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

describe('browser managed profiles integration', () => {
  it('creates or reuses an isolated agent-managed browser profile', async () => {
    const harness = await createGatewayTestHarness('browser-managed-profiles');

    try {
      const ensureResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/managed-profiles/ensure',
        headers: {
          Authorization: `Bearer ${harness.config.server.apiToken}`,
          'x-ops-role': 'admin'
        },
        payload: {
          actor: 'browser-managed-profile-test'
        }
      });
      expect(ensureResponse.statusCode, ensureResponse.body).toBe(200);
      const ensureBody = expectRecord(ensureResponse.json(), 'ensure response');
      const profile = expectRecord(ensureBody.sessionProfile, 'session profile');
      expect(profile.useRealChrome).toBe(false);
      expect(profile.profileClass).toBe('managed');
      expect(profile.isManaged).toBe(true);
      expect(profile.isIsolated).toBe(true);

      const vault = expectRecord(ensureBody.vault, 'vault');
      const sessionProfiles = recordsField(vault, 'sessionProfiles');
      expect(sessionProfiles.some((entry) => entry.id === profile.id && entry.profileClass === 'managed')).toBe(true);

      const reuseResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/managed-profiles/ensure',
        headers: {
          Authorization: `Bearer ${harness.config.server.apiToken}`,
          'x-ops-role': 'admin'
        },
        payload: {
          actor: 'browser-managed-profile-test'
        }
      });
      expect(reuseResponse.statusCode).toBe(200);
      const reuseBody = expectRecord(reuseResponse.json(), 'reuse response');
      const reusedProfile = expectRecord(reuseBody.sessionProfile, 'reused profile');
      expect(reusedProfile.id).toBe(profile.id);

      const releaseGateResponse = await harness.inject({
        method: 'GET',
        url: '/api/browser/release-gate'
      });
      expect(releaseGateResponse.statusCode).toBe(200);
      const releaseGateBody = expectRecord(releaseGateResponse.json(), 'release gate response');
      const releaseGate = expectRecord(releaseGateBody.releaseGate, 'release gate');
      expect(releaseGate.schema).toBe('ops.browser-release-gate.v1');
      expect(releaseGate.status).toBe('ready');
      const checks = recordsField(releaseGate, 'checks');
      expect(checks.find((entry) => entry.id === 'managed_profile_isolation')?.status).toBe('passed');
      const controls = recordsField(releaseGate, 'controls');
      expect(controls.find((entry) => entry.id === 'artifact_preview_and_download')?.status).toBe('certified');

      const diffResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/policy/diff',
        headers: {
          Authorization: `Bearer ${harness.config.server.apiToken}`,
          'x-ops-role': 'admin'
        },
        payload: {
          policy: {
            allowVisibleBrowser: true
          }
        }
      });
      expect(diffResponse.statusCode).toBe(200);
      const diffBody = expectRecord(diffResponse.json(), 'diff response');
      const diff = expectRecord(diffBody.diff, 'browser policy diff');
      expect(diff.schema).toBe('ops.browser-policy-diff.v1');
      expect(diff.requiresApproval).toBe(true);

      const blockedApplyResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/policy/apply',
        headers: {
          Authorization: `Bearer ${harness.config.server.apiToken}`,
          'x-ops-role': 'admin'
        },
        payload: {
          actor: 'browser-managed-profile-test',
          policy: {
            allowVisibleBrowser: true
          }
        }
      });
      expect(blockedApplyResponse.statusCode).toBe(409);

      const approvedApplyResponse = await harness.inject({
        method: 'POST',
        url: '/api/browser/policy/apply',
        headers: {
          Authorization: `Bearer ${harness.config.server.apiToken}`,
          'x-ops-role': 'admin'
        },
        payload: {
          actor: 'browser-managed-profile-test',
          approved: true,
          policy: {
            allowVisibleBrowser: true
          }
        }
      });
      expect(approvedApplyResponse.statusCode).toBe(200);
      const applyBody = expectRecord(approvedApplyResponse.json(), 'apply response');
      const appliedConfig = expectRecord(applyBody.config, 'applied browser config');
      const appliedPolicy = expectRecord(appliedConfig.policy, 'applied browser policy');
      expect(appliedPolicy.allowVisibleBrowser).toBe(true);
    } finally {
      await harness.close();
    }
  });
});
