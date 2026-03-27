import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

describe('github trust contract integration', () => {
  let harness: GatewayTestHarness;

  beforeAll(async () => {
    harness = await createGatewayTestHarness('github-trust-contract');
  });

  afterAll(async () => {
    await harness.close();
  });

  it('persists app-first auth, repo policy, and trusted webhook delivery contract fields', async () => {
    const createResponse = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'ElyzeSolutions',
        repo: 'ops-dashboard',
        defaultBranch: 'main',
        authSecretRef: 'providers.github_app_private_key',
        authMode: 'github_app',
        appInstallationId: 424242,
        appInstallationAccountLogin: 'elyze-app',
        webhookSecretRef: 'github.webhook_secret',
        permissionManifest: {
          contents: 'write',
          pull_requests: 'write',
          issues: 'write',
          checks: 'write'
        },
        permissionSnapshot: {
          contents: 'write',
          pull_requests: 'read',
          issues: 'write',
          checks: 'write'
        },
        policyVersion: 'policy.v2',
        policyHash: 'sha256:abc123',
        policySource: 'control_plane',
        policy: {
          branchNaming: 'delivery/{itemId}',
          reviewers: ['qa-reliability'],
          requiredChecks: ['build', 'integration'],
          mergePolicy: 'squash'
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const createBody = createResponse.json() as {
      repo: {
        id: string;
        authMode: string;
        appInstallationId: number | null;
        appInstallationAccountLogin: string | null;
        permissionManifestJson: string;
        permissionSnapshotJson: string;
        policyVersion: string;
        policyHash: string | null;
        policySource: string;
        policyJson: string;
        webhookSecretRef: string | null;
      };
    };

    expect(createBody.repo.authMode).toBe('github_app');
    expect(createBody.repo.appInstallationId).toBe(424242);
    expect(createBody.repo.appInstallationAccountLogin).toBe('elyze-app');
    expect(JSON.parse(createBody.repo.permissionManifestJson)).toMatchObject({
      contents: 'write',
      pull_requests: 'write'
    });
    expect(JSON.parse(createBody.repo.permissionSnapshotJson)).toMatchObject({
      pull_requests: 'read'
    });
    expect(createBody.repo.policyVersion).toBe('policy.v2');
    expect(createBody.repo.policyHash).toBe('sha256:abc123');
    expect(createBody.repo.policySource).toBe('control_plane');
    expect(JSON.parse(createBody.repo.policyJson)).toMatchObject({
      branchNaming: 'delivery/{itemId}',
      mergePolicy: 'squash'
    });
    expect(createBody.repo.webhookSecretRef).toBe('github.webhook_secret');

    const patchResponse = await harness.inject({
      method: 'PATCH',
      url: `/api/github/repos/${encodeURIComponent(createBody.repo.id)}`,
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        authMode: 'pat_fallback',
        appInstallationId: null,
        appInstallationAccountLogin: null,
        lastValidationStatus: 'blocked',
        lastValidationError: 'permission drift detected',
        lastValidatedAt: '2026-03-14T10:00:00.000Z',
        tokenExpiresAt: null,
        policyVersion: 'policy.v3',
        policyHash: 'sha256:def456',
        policySource: 'hybrid',
        policy: {
          branchNaming: 'delivery/{itemId}',
          requiredChecks: ['build', 'integration', 'e2e'],
          mergePolicy: 'merge_queue'
        }
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    const patchBody = patchResponse.json() as {
      repo: {
        authMode: string;
        appInstallationId: number | null;
        appInstallationAccountLogin: string | null;
        lastValidationStatus: string | null;
        lastValidationError: string | null;
        lastValidatedAt: string | null;
        policyVersion: string;
        policyHash: string | null;
        policySource: string;
        policyJson: string;
      };
    };

    expect(patchBody.repo.authMode).toBe('pat_fallback');
    expect(patchBody.repo.appInstallationId).toBeNull();
    expect(patchBody.repo.appInstallationAccountLogin).toBeNull();
    expect(patchBody.repo.lastValidationStatus).toBe('blocked');
    expect(patchBody.repo.lastValidationError).toBe('permission drift detected');
    expect(patchBody.repo.lastValidatedAt).toBe('2026-03-14T10:00:00.000Z');
    expect(patchBody.repo.policyVersion).toBe('policy.v3');
    expect(patchBody.repo.policyHash).toBe('sha256:def456');
    expect(patchBody.repo.policySource).toBe('hybrid');
    expect(JSON.parse(patchBody.repo.policyJson)).toMatchObject({
      mergePolicy: 'merge_queue'
    });

    const listResponse = await harness.inject({
      method: 'GET',
      url: '/api/github/repos?includeDisabled=true',
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json() as {
      repos: Array<{
        id: string;
        authMode: string;
        lastValidationStatus: string | null;
        policySource: string;
        policyVersion: string;
      }>;
    };
    const persistedRepo = listBody.repos.find((entry) => entry.id === createBody.repo.id);
    expect(persistedRepo).toMatchObject({
      authMode: 'pat_fallback',
      lastValidationStatus: 'blocked',
      policySource: 'hybrid',
      policyVersion: 'policy.v3'
    });

    const db = harness.createDb();
    try {
      const delivery = db.upsertGithubWebhookDelivery({
        deliveryId: 'delivery-001',
        repoConnectionId: createBody.repo.id,
        event: 'pull_request',
        owner: 'ElyzeSolutions',
        repo: 'ops-dashboard',
        source: 'webhook',
        signatureState: 'verified',
        signatureFingerprint: 'sha256=feedbeef',
        status: 'accepted',
        payload: {
          action: 'opened',
          pull_request: {
            number: 17
          }
        }
      });

      expect(delivery.repoConnectionId).toBe(createBody.repo.id);
      expect(delivery.signatureState).toBe('verified');
      expect(delivery.status).toBe('accepted');
      expect(JSON.parse(delivery.payloadJson)).toMatchObject({
        action: 'opened'
      });

      const persistedDelivery = db.getGithubWebhookDeliveryByDeliveryId('delivery-001');
      expect(persistedDelivery?.signatureFingerprint).toBe('sha256=feedbeef');
      expect(persistedDelivery?.event).toBe('pull_request');
      expect(db.listGithubWebhookDeliveries(10).some((entry) => entry.deliveryId === 'delivery-001')).toBe(true);
    } finally {
      db.close();
    }
  });
});
