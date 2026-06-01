import path from 'node:path';

import type { ControlPlaneConfig, SandboxProfileKey } from '@ops/config';
import type { CommandPlanRiskClass } from '@ops/shared';
import type { SkillManifest } from '@ops/skills';

type SandboxProfiles = ControlPlaneConfig['policy']['sandbox']['profiles'];
type SandboxPolicyProfile = SandboxProfiles['balanced'];

export type SandboxPolicyStatus = 'pass' | 'warn' | 'fail';

export interface SandboxPolicyCheck {
  id: string;
  label: string;
  status: SandboxPolicyStatus;
  summary: string;
  evidence: Record<string, unknown>;
}

export interface SandboxPolicySnapshot {
  schema: 'ops.sandbox-policy.v1';
  enabled: boolean;
  activeProfile: SandboxProfileKey;
  profile: SandboxPolicyProfile & { key: SandboxProfileKey };
  availableProfiles: SandboxProfileKey[];
  checks: SandboxPolicyCheck[];
  riskySkills: Array<{
    name: string;
    scopes: SkillManifest['scopes'];
    requiresApproval: boolean;
  }>;
  recommendations: string[];
}

export interface SandboxCommandPolicyAssessment {
  reasonCode: string;
  riskClass: CommandPlanRiskClass;
  requiresApproval: boolean;
  blockedReason: string | null;
  diagnostics: string[];
}

function profileForKey(profiles: SandboxProfiles, key: SandboxProfileKey): SandboxPolicyProfile {
  if (key === 'trusted_local') {
    return profiles.trusted_local;
  }
  if (key === 'restricted') {
    return profiles.restricted;
  }
  if (key === 'open') {
    return profiles.open;
  }
  return profiles.balanced;
}

function riskySkillScope(skill: SkillManifest): boolean {
  return (
    skill.enabled &&
    !skill.requiresApproval &&
    (skill.scopes.process === 'exec' || skill.scopes.network === 'outbound' || skill.scopes.secrets === 'read')
  );
}

function check(input: SandboxPolicyCheck): SandboxPolicyCheck {
  return input;
}

const COMMAND_RISK_ORDER: Record<CommandPlanRiskClass, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
};

const NETWORK_COMMANDS = new Set(['curl', 'wget', 'ssh', 'scp', 'sftp', 'nc', 'netcat', 'telnet', 'rsync']);

function maxRiskClass(left: CommandPlanRiskClass, right: CommandPlanRiskClass): CommandPlanRiskClass {
  return COMMAND_RISK_ORDER[left] >= COMMAND_RISK_ORDER[right] ? left : right;
}

function normalizeExecutable(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function commandHasNetworkSignal(argv: string[]): boolean {
  const executable = normalizeExecutable(argv[0] ?? '');
  if (NETWORK_COMMANDS.has(executable)) {
    return true;
  }
  const joined = argv.join(' ').toLowerCase();
  return (
    /\b(curl|wget|ssh|scp|sftp|nc|netcat|telnet|rsync)\b/.test(joined) ||
    /\b(git\s+(?:clone|fetch|pull|push)|npm\s+(?:install|publish)|pnpm\s+(?:install|publish)|bun\s+(?:install|publish))\b/.test(joined) ||
    /\b(requests|httpx|aiohttp|urllib\.request|socket|websockets?)\b/.test(joined)
  );
}

function commandMatchesEndpointGroup(profile: SandboxPolicyProfile, argv: string[]): boolean {
  const executable = normalizeExecutable(argv[0] ?? '');
  const joined = argv.join(' ').toLowerCase();
  return profile.endpointGroups.some((group) => {
    const binaryMatch = group.binaries.some((binary) => normalizeExecutable(binary) === executable);
    const endpointMatch = group.endpoints.some((endpoint) => joined.includes(endpoint.toLowerCase()));
    return binaryMatch || endpointMatch;
  });
}

function pathIsInsideOrEqual(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function commandHasFilesystemMutationSignal(argv: string[]): boolean {
  const executable = normalizeExecutable(argv[0] ?? '');
  if (['rm', 'rmdir', 'mv', 'cp', 'touch', 'mkdir', 'chmod', 'chown', 'tee'].includes(executable)) {
    return true;
  }
  const joined = argv.join(' ').toLowerCase();
  return (
    /\b(git\s+(?:commit|checkout|switch|branch|merge|rebase|reset|clean|apply|am)|npm\s+(?:install|ci|publish)|pnpm\s+(?:install|add|remove|publish)|bun\s+(?:install|add|remove|publish))\b/.test(joined) ||
    /\b(write_text|write_bytes|unlink|rmdir|mkdir|rename|replace|chmod|chown|symlink_to|touch|rmtree|move|copytree|dump\()/.test(joined) ||
    /\bopen\s*\([^)]*,\s*['"][wax+]/.test(joined) ||
    /\bsed\b[\s\S]*\s-i\b/.test(joined) ||
    /(\s|^)>+\s*[^&\s]/.test(joined)
  );
}

export function evaluateSandboxCommandPolicy(input: {
  config: ControlPlaneConfig;
  argv: string[];
  cwd?: string;
  workspacePath?: string;
  assessment: SandboxCommandPolicyAssessment;
}): SandboxCommandPolicyAssessment {
  const sandbox = input.config.policy.sandbox;
  if (!sandbox.enabled) {
    return input.assessment;
  }

  const profile = profileForKey(sandbox.profiles, sandbox.activeProfile);
  const cwd = input.cwd ? path.resolve(input.cwd) : null;
  const workspacePath = input.workspacePath ? path.resolve(input.workspacePath) : null;
  if (
    cwd &&
    workspacePath &&
    (profile.filesystem === 'read_workspace' || profile.filesystem === 'write_workspace') &&
    !pathIsInsideOrEqual(workspacePath, cwd)
  ) {
    return {
      reasonCode: 'sandbox_filesystem_scope_blocked',
      riskClass: 'critical',
      requiresApproval: false,
      blockedReason: 'sandbox_filesystem_scope_blocked',
      diagnostics: [
        `Sandbox profile ${sandbox.activeProfile} requires command cwd to stay inside workspace ${workspacePath}.`
      ]
    };
  }

  if (profile.filesystem === 'read_workspace' && commandHasFilesystemMutationSignal(input.argv)) {
    return {
      reasonCode: 'sandbox_filesystem_readonly_blocked',
      riskClass: 'critical',
      requiresApproval: false,
      blockedReason: 'sandbox_filesystem_readonly_blocked',
      diagnostics: [
        `Sandbox profile ${sandbox.activeProfile} allows read-only workspace access and blocks filesystem mutation commands.`
      ]
    };
  }

  if (profile.process === 'none') {
    return {
      reasonCode: 'sandbox_process_blocked',
      riskClass: 'critical',
      requiresApproval: false,
      blockedReason: 'sandbox_process_blocked',
      diagnostics: [
        `Sandbox profile ${sandbox.activeProfile} blocks process execution.`
      ]
    };
  }

  const hasNetworkSignal = commandHasNetworkSignal(input.argv);
  if (hasNetworkSignal && profile.network === 'deny_all') {
    return {
      reasonCode: 'sandbox_network_blocked',
      riskClass: 'critical',
      requiresApproval: false,
      blockedReason: 'sandbox_network_blocked',
      diagnostics: [
        `Sandbox profile ${sandbox.activeProfile} denies network egress for command execution.`
      ]
    };
  }

  if (hasNetworkSignal && profile.network === 'allowlisted' && !commandMatchesEndpointGroup(profile, input.argv)) {
    return {
      reasonCode: 'sandbox_network_not_allowlisted',
      riskClass: 'critical',
      requiresApproval: false,
      blockedReason: 'sandbox_network_not_allowlisted',
      diagnostics: [
        `Sandbox profile ${sandbox.activeProfile} allows only declared endpoint groups for network egress.`
      ]
    };
  }

  if (hasNetworkSignal && profile.network === 'approval_required' && input.assessment.blockedReason === null) {
    return {
      ...input.assessment,
      reasonCode: input.assessment.requiresApproval ? input.assessment.reasonCode : 'sandbox_network_approval_required',
      riskClass: maxRiskClass(input.assessment.riskClass, 'high'),
      requiresApproval: true,
      diagnostics: [
        ...input.assessment.diagnostics,
        `Sandbox profile ${sandbox.activeProfile} requires explicit approval for network egress.`
      ]
    };
  }

  if (profile.process === 'approved_only' && input.assessment.riskClass === 'critical' && input.assessment.blockedReason === null) {
    return {
      ...input.assessment,
      requiresApproval: true,
      diagnostics: [
        ...input.assessment.diagnostics,
        `Sandbox profile ${sandbox.activeProfile} requires approval for critical process execution.`
      ]
    };
  }

  return input.assessment;
}

export function buildSandboxPolicySnapshot(input: {
  config: ControlPlaneConfig;
  skills: SkillManifest[];
}): SandboxPolicySnapshot {
  const sandbox = input.config.policy.sandbox;
  const activeProfile = profileForKey(sandbox.profiles, sandbox.activeProfile);
  const riskySkills = input.skills.filter(riskySkillScope).map((skill) => ({
    name: skill.name,
    scopes: skill.scopes,
    requiresApproval: skill.requiresApproval
  }));
  const recommendations: string[] = [];
  if (!sandbox.enabled) {
    recommendations.push('Enable policy.sandbox before adding additional execution backends or channels.');
  }
  if (activeProfile.network === 'allow_all') {
    recommendations.push('Use balanced or restricted sandbox networking for normal operation.');
  }
  if (activeProfile.credentials === 'direct') {
    recommendations.push('Keep credentials brokered through the host/vault boundary instead of direct sandbox access.');
  }
  if (riskySkills.length > 0) {
    recommendations.push('Require approval for skills with process, network, or secret scopes.');
  }

  const checks = [
    check({
      id: 'sandbox_policy_enabled',
      label: 'Sandbox policy enabled',
      status: sandbox.enabled ? 'pass' : 'warn',
      summary: sandbox.enabled
        ? `Sandbox policy is enabled with active profile ${sandbox.activeProfile}.`
        : 'Sandbox policy is disabled.',
      evidence: {
        enabled: sandbox.enabled,
        activeProfile: sandbox.activeProfile
      }
    }),
    check({
      id: 'sandbox_network_boundary',
      label: 'Network boundary',
      status: activeProfile.network === 'allow_all' ? 'warn' : 'pass',
      summary:
        activeProfile.network === 'allow_all'
          ? 'Active sandbox profile allows unrestricted network egress.'
          : `Active sandbox network policy is ${activeProfile.network}.`,
      evidence: {
        network: activeProfile.network,
        endpointGroups: activeProfile.endpointGroups
      }
    }),
    check({
      id: 'sandbox_credential_boundary',
      label: 'Credential boundary',
      status: activeProfile.credentials === 'direct' ? 'warn' : 'pass',
      summary:
        activeProfile.credentials === 'direct'
          ? 'Active sandbox profile allows direct credential access.'
          : `Active sandbox credential policy is ${activeProfile.credentials}.`,
      evidence: {
        credentials: activeProfile.credentials
      }
    }),
    check({
      id: 'sandbox_process_boundary',
      label: 'Process boundary',
      status: activeProfile.process === 'unrestricted' ? 'warn' : 'pass',
      summary:
        activeProfile.process === 'unrestricted'
          ? 'Active sandbox profile allows unrestricted process execution.'
          : `Active sandbox process policy is ${activeProfile.process}.`,
      evidence: {
        process: activeProfile.process,
        allowElevatedExecution: input.config.policy.allowElevatedExecution
      }
    }),
    check({
      id: 'sandbox_skill_scope_alignment',
      label: 'Skill scope alignment',
      status: riskySkills.length > 0 ? 'warn' : 'pass',
      summary:
        riskySkills.length > 0
          ? `${riskySkills.length} enabled skill${riskySkills.length === 1 ? '' : 's'} expose elevated scopes without approval.`
          : 'Enabled skills with process, network, or secret scopes require approval.',
      evidence: {
        riskySkills
      }
    })
  ];

  return {
    schema: 'ops.sandbox-policy.v1',
    enabled: sandbox.enabled,
    activeProfile: sandbox.activeProfile,
    profile: {
      key: sandbox.activeProfile,
      ...activeProfile
    },
    availableProfiles: ['trusted_local', 'restricted', 'balanced', 'open'],
    checks,
    riskySkills,
    recommendations
  };
}
