import { describe, expect, it } from 'vitest';

import { createGatewayTestHarness } from './test-harness.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(isRecord(value), `${label} should be an object`).toBe(true);
  if (isRecord(value)) {
    return value;
  }
  return {};
}

function recordsField(record: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = record[key];
  expect(Array.isArray(value), `${key} should be an array`).toBe(true);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => expectRecord(entry, `${key}[${index}]`));
}

describe('doctor center integration', () => {
  it('aggregates operator repair posture and runs bounded repairs through the API', async () => {
    const harness = await createGatewayTestHarness('doctor-center', (config) => {
      config.browser.enabled = true;
      config.browser.transport = 'stdio';
      config.browser.executable = 'definitely-missing-browser';
    });

    try {
      const response = await harness.inject({
        method: 'GET',
        url: '/api/doctor'
      });
      expect(response.statusCode).toBe(200);

      const body = expectRecord(response.json(), 'doctor response');
      const doctor = expectRecord(body.doctor, 'doctor');
      expect(doctor.schema).toBe('ops.doctor-center.v1');

      const areas = recordsField(doctor, 'areas');
      expect(areas.map((area) => String(area.label))).toEqual(
        expect.arrayContaining([
          'Control plane readiness',
          'Prompt governance',
          'Memory governance',
          'Sandbox policy',
          'Skill lifecycle',
          'Schedule guardrails',
          'Browser profiles'
        ])
      );

      const promptArea = areas.find((area) => area.id === 'prompt_governance');
      expect(promptArea?.status).toBe('warn');

      const memoryArea = areas.find((area) => area.id === 'memory_governance');
      expect(memoryArea).toBeDefined();
      const memoryChecks = memoryArea ? recordsField(memoryArea, 'checks') : [];
      expect(memoryChecks.find((check) => check.id === 'memory_write_guardrail')?.status).toBe('pass');

      const sandboxArea = areas.find((area) => area.id === 'sandbox_policy');
      expect(sandboxArea).toBeDefined();
      const sandboxChecks = sandboxArea ? recordsField(sandboxArea, 'checks') : [];
      expect(sandboxChecks.find((check) => check.id === 'sandbox_network_boundary')?.status).toBe('pass');

      const sandboxPolicyResponse = await harness.inject({
        method: 'GET',
        url: '/api/sandbox/policy'
      });
      expect(sandboxPolicyResponse.statusCode).toBe(200);
      const sandboxPolicyBody = expectRecord(sandboxPolicyResponse.json(), 'sandbox policy response');
      const sandboxPolicy = expectRecord(sandboxPolicyBody.sandboxPolicy, 'sandbox policy');
      expect(sandboxPolicy.schema).toBe('ops.sandbox-policy.v1');
      expect(sandboxPolicy.activeProfile).toBe('balanced');

      const sandboxDiffResponse = await harness.inject({
        method: 'GET',
        url: '/api/sandbox/policy/diff?profile=restricted'
      });
      expect(sandboxDiffResponse.statusCode).toBe(200);
      const sandboxDiffBody = expectRecord(sandboxDiffResponse.json(), 'sandbox diff response');
      const sandboxDiff = expectRecord(sandboxDiffBody.diff, 'sandbox diff');
      expect(sandboxDiff.schema).toBe('ops.sandbox-policy-diff.v1');
      expect(sandboxDiff.approvalRequired).toBe(true);

      const blockedSandboxApply = await harness.inject({
        method: 'POST',
        url: '/api/sandbox/policy/apply',
        payload: {
          profile: 'restricted',
          actor: 'doctor-center-test'
        }
      });
      expect(blockedSandboxApply.statusCode).toBe(412);

      const approvedSandboxApply = await harness.inject({
        method: 'POST',
        url: '/api/sandbox/policy/apply',
        payload: {
          profile: 'restricted',
          actor: 'doctor-center-test',
          approved: true
        }
      });
      expect(approvedSandboxApply.statusCode).toBe(200);
      const approvedSandboxBody = expectRecord(approvedSandboxApply.json(), 'approved sandbox response');
      const approvedSandboxPolicy = expectRecord(approvedSandboxBody.sandboxPolicy, 'approved sandbox policy');
      expect(approvedSandboxPolicy.activeProfile).toBe('restricted');

      const browserArea = areas.find((area) => area.id === 'browser_profiles');
      expect(browserArea?.status).toBe('warn');

      const skillGateResponse = await harness.inject({
        method: 'GET',
        url: '/api/skills/release-gate'
      });
      expect(skillGateResponse.statusCode).toBe(200);
      const skillGateBody = expectRecord(skillGateResponse.json(), 'skill release gate response');
      const skillGate = expectRecord(skillGateBody.releaseGate, 'skill release gate');
      expect(skillGate.schema).toBe('ops.skill-release-gate.v1');
      expect(Array.isArray(skillGate.cronDenylist)).toBe(true);

      const skillGateEvaluateResponse = await harness.inject({
        method: 'POST',
        url: '/api/skills/release-gate/evaluate',
        payload: {
          actor: 'doctor-center-test'
        }
      });
      expect(skillGateEvaluateResponse.statusCode).toBe(200);
      const skillGateEvaluateBody = expectRecord(skillGateEvaluateResponse.json(), 'skill release gate evaluate response');
      const evaluatedSkillGate = expectRecord(skillGateEvaluateBody.releaseGate, 'evaluated skill release gate');
      expect(evaluatedSkillGate.schema).toBe('ops.skill-release-gate.v1');

      const blockedRepair = await harness.inject({
        method: 'POST',
        url: '/api/doctor/repairs/skills_resync/run',
        payload: {
          actor: 'doctor-center-test'
        }
      });
      expect(blockedRepair.statusCode).toBe(403);

      const approvedRepair = await harness.inject({
        method: 'POST',
        url: '/api/doctor/repairs/skills_resync/run',
        payload: {
          actor: 'doctor-center-test',
          approved: true
        }
      });
      expect(approvedRepair.statusCode).toBe(200);
      const approvedBody = expectRecord(approvedRepair.json(), 'approved repair response');
      const repair = expectRecord(approvedBody.repair, 'repair');
      expect(repair.status).toBe('ok');
      expect(approvedBody.doctor).toBeTruthy();
    } finally {
      await harness.close();
    }
  });
});
