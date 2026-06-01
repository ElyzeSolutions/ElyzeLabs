import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '@ops/config';
import type { SkillManifest } from '@ops/skills';

import { buildSandboxPolicySnapshot, evaluateSandboxCommandPolicy, type SandboxCommandPolicyAssessment } from '../../src/sandbox-policy.js';

function makeConfig(profile = 'balanced') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-sandbox-policy-test-'));
  return loadConfig({
    cwd: directory,
    env: {
      OPS_API_TOKEN: 'test-token-12345',
      OPS_TELEGRAM_ENABLED: 'false',
      OPS_SANDBOX_PROFILE: profile
    }
  });
}

function makeSkill(input: {
  name: string;
  requiresApproval: boolean;
  process?: 'none' | 'exec';
  network?: 'none' | 'outbound';
  secrets?: 'none' | 'read';
}): SkillManifest {
  return {
    id: input.name,
    name: input.name,
    version: '1.0.0',
    description: `${input.name} skill`,
    entry: '__skill_markdown__',
    enabled: true,
    requiresApproval: input.requiresApproval,
    supportsDryRun: true,
    tags: [],
    allowedCommands: [],
    requiredTools: [],
    scopes: {
      filesystem: 'none',
      process: input.process ?? 'none',
      network: input.network ?? 'none',
      secrets: input.secrets ?? 'none'
    }
  };
}

function lowRiskAssessment(): SandboxCommandPolicyAssessment {
  return {
    reasonCode: 'probe_allowed',
    riskClass: 'low',
    requiresApproval: false,
    blockedReason: null,
    diagnostics: ['Direct command is classified as low-risk.']
  };
}

describe('sandbox policy snapshot', () => {
  it('exposes balanced default policy and flags elevated skills without approval', () => {
    const snapshot = buildSandboxPolicySnapshot({
      config: makeConfig(),
      skills: [
        makeSkill({
          name: 'unsafe-network',
          requiresApproval: false,
          network: 'outbound'
        }),
        makeSkill({
          name: 'approved-process',
          requiresApproval: true,
          process: 'exec'
        })
      ]
    });

    expect(snapshot.schema).toBe('ops.sandbox-policy.v1');
    expect(snapshot.activeProfile).toBe('balanced');
    expect(snapshot.profile.network).toBe('approval_required');
    expect(snapshot.profile.credentials).toBe('brokered');
    expect(snapshot.riskySkills.map((skill) => skill.name)).toEqual(['unsafe-network']);
    expect(snapshot.checks.find((check) => check.id === 'sandbox_skill_scope_alignment')?.status).toBe('warn');
  });

  it('warns when the open profile removes network, credential, and process boundaries', () => {
    const snapshot = buildSandboxPolicySnapshot({
      config: makeConfig('open'),
      skills: []
    });

    expect(snapshot.activeProfile).toBe('open');
    expect(snapshot.checks.find((check) => check.id === 'sandbox_network_boundary')?.status).toBe('warn');
    expect(snapshot.checks.find((check) => check.id === 'sandbox_credential_boundary')?.status).toBe('warn');
    expect(snapshot.checks.find((check) => check.id === 'sandbox_process_boundary')?.status).toBe('warn');
    expect(snapshot.recommendations).toContain('Use balanced or restricted sandbox networking for normal operation.');
  });

  it('upgrades network commands to approval under balanced policy', () => {
    const assessment = evaluateSandboxCommandPolicy({
      config: makeConfig('balanced'),
      argv: ['curl', 'https://example.com/health'],
      assessment: lowRiskAssessment()
    });

    expect(assessment.blockedReason).toBeNull();
    expect(assessment.requiresApproval).toBe(true);
    expect(assessment.riskClass).toBe('high');
    expect(assessment.reasonCode).toBe('sandbox_network_approval_required');
  });

  it('blocks network commands under restricted deny-all policy', () => {
    const assessment = evaluateSandboxCommandPolicy({
      config: makeConfig('restricted'),
      argv: ['curl', 'https://example.com/health'],
      assessment: lowRiskAssessment()
    });

    expect(assessment.blockedReason).toBe('sandbox_network_blocked');
    expect(assessment.requiresApproval).toBe(false);
    expect(assessment.riskClass).toBe('critical');
  });

  it('does not add sandbox approval requirements under open policy', () => {
    const assessment = evaluateSandboxCommandPolicy({
      config: makeConfig('open'),
      argv: ['curl', 'https://example.com/health'],
      assessment: lowRiskAssessment()
    });

    expect(assessment.blockedReason).toBeNull();
    expect(assessment.requiresApproval).toBe(false);
    expect(assessment.riskClass).toBe('low');
  });

  it('blocks workspace-scoped profiles from executing outside the workspace', () => {
    const assessment = evaluateSandboxCommandPolicy({
      config: makeConfig('balanced'),
      argv: ['node', '--version'],
      cwd: '/tmp/outside-workspace',
      workspacePath: '/workspace/project',
      assessment: lowRiskAssessment()
    });

    expect(assessment.blockedReason).toBe('sandbox_filesystem_scope_blocked');
    expect(assessment.requiresApproval).toBe(false);
    expect(assessment.riskClass).toBe('critical');
  });

  it('blocks mutation commands under restricted read-only workspace policy', () => {
    const assessment = evaluateSandboxCommandPolicy({
      config: makeConfig('restricted'),
      argv: ['rm', '-rf', 'dist'],
      cwd: '/workspace/project',
      workspacePath: '/workspace/project',
      assessment: lowRiskAssessment()
    });

    expect(assessment.blockedReason).toBe('sandbox_filesystem_readonly_blocked');
    expect(assessment.requiresApproval).toBe(false);
    expect(assessment.riskClass).toBe('critical');
  });

  it('allows open profile commands outside the workspace without sandbox filesystem rejection', () => {
    const assessment = evaluateSandboxCommandPolicy({
      config: makeConfig('open'),
      argv: ['node', '--version'],
      cwd: '/tmp/outside-workspace',
      workspacePath: '/workspace/project',
      assessment: lowRiskAssessment()
    });

    expect(assessment.blockedReason).toBeNull();
    expect(assessment.requiresApproval).toBe(false);
    expect(assessment.riskClass).toBe('low');
  });
});
