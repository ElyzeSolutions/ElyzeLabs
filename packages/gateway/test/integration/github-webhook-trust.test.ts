import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

describe('github webhook trust integration', () => {
  let harness: GatewayTestHarness;
  const webhookSecret = 'webhook-secret';

  const signPayloadWithSecret = (payload: Record<string, unknown>, secret: string): string =>
    `sha256=${createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`;

  const signPayload = (payload: Record<string, unknown>): string => signPayloadWithSecret(payload, webhookSecret);

  beforeAll(async () => {
    process.env.OPS_GITHUB_WEBHOOK_SECRET = webhookSecret;
    harness = await createGatewayTestHarness('github-webhook-trust');
  });

  beforeEach(() => {
    process.env.OPS_GITHUB_WEBHOOK_SECRET = webhookSecret;
  });

  afterAll(async () => {
    await harness.close();
    delete process.env.OPS_GITHUB_WEBHOOK_SECRET;
  });

  it('rejects unverified deliveries and only mutates delivery state after verified signature checks', async () => {
    const repo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'acme',
        repo: 'portal',
        authSecretRef: 'env:GITHUB_TOKEN',
        webhookSecretRef: 'env:OPS_GITHUB_WEBHOOK_SECRET',
        enabled: true
      }
    });
    expect(repo.statusCode).toBe(201);
    const repoBody = repo.json() as { repo: { id: string } };

    const item = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: 'Trusted webhook target',
        description: 'Verify webhook trust boundaries.',
        state: 'review',
        priority: 60,
        actor: 'test'
      }
    });
    expect(item.statusCode).toBe(201);
    const itemId = (item.json() as { item: { id: string } }).item.id;

    const delivery = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      payload: {
        repoConnectionId: repoBody.repo.id,
        prNumber: 12,
        status: 'review'
      }
    });
    expect(delivery.statusCode).toBe(200);

    const payload = {
      action: 'closed',
      number: 12,
      repository: {
        name: 'portal',
        owner: {
          login: 'acme'
        }
      },
      pull_request: {
        number: 12,
        state: 'closed',
        merged: true,
        html_url: 'https://github.com/acme/portal/pull/12'
      }
    };

    const missingSignature = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-missing'
      },
      payload
    });
    expect(missingSignature.statusCode).toBe(401);

    const invalidSignature = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-invalid',
        'x-hub-signature-256': 'sha256=deadbeef'
      },
      payload
    });
    expect(invalidSignature.statusCode).toBe(401);

    const beforeVerified = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}`
    });
    expect(beforeVerified.statusCode).toBe(200);
    const beforeVerifiedBody = beforeVerified.json() as {
      item: {
        delivery: {
          status: string;
        } | null;
        state: string;
      };
    };
    expect(beforeVerifiedBody.item.delivery?.status).toBe('review');
    expect(beforeVerifiedBody.item.state).toBe('review');

    const verified = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-verified',
        'x-hub-signature-256': signPayload(payload)
      },
      payload
    });
    expect(verified.statusCode).toBe(200);
    const verifiedBody = verified.json() as { processed: boolean; updates: number };
    expect(verifiedBody.processed).toBe(true);
    expect(verifiedBody.updates).toBeGreaterThan(0);

    const afterVerified = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}`
    });
    expect(afterVerified.statusCode).toBe(200);
    const afterVerifiedBody = afterVerified.json() as {
      item: {
        delivery: {
          status: string;
        } | null;
        state: string;
      };
    };
    expect(afterVerifiedBody.item.delivery?.status).toBe('merged');
    expect(afterVerifiedBody.item.state).toBe('done');

    const events = await harness.inject({
      method: 'GET',
      url: '/api/github/webhooks/events?limit=20',
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(events.statusCode).toBe(200);
    const eventsBody = events.json() as {
      entries: Array<{
        deliveryId: string | null;
        signatureState: string;
        status: string;
        reason: string | null;
      }>;
    };
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId === 'delivery-missing')
    ).toMatchObject({
      signatureState: 'missing',
      status: 'rejected',
      reason: 'missing_signature'
    });
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId === 'delivery-invalid')
    ).toMatchObject({
      signatureState: 'invalid',
      status: 'rejected',
      reason: 'invalid_signature'
    });
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId === 'delivery-verified')
    ).toMatchObject({
      signatureState: 'verified',
      status: 'accepted',
      reason: null
    });
  });

  it('deduplicates verified deliveries, only replays trusted sources, and honors webhook secret rotation', async () => {
    const repo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'acme',
        repo: 'portal-replay',
        authSecretRef: 'env:GITHUB_TOKEN',
        webhookSecretRef: 'env:OPS_GITHUB_WEBHOOK_SECRET',
        enabled: true
      }
    });
    expect(repo.statusCode).toBe(201);
    const repoBody = repo.json() as { repo: { id: string } };

    const item = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: 'Replay and rotation target',
        description: 'Exercise duplicate, replay, and rotated secret paths.',
        state: 'review',
        priority: 55,
        actor: 'test'
      }
    });
    expect(item.statusCode).toBe(201);
    const itemId = (item.json() as { item: { id: string } }).item.id;

    const delivery = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(itemId)}/delivery`,
      payload: {
        repoConnectionId: repoBody.repo.id,
        prNumber: 21,
        status: 'review'
      }
    });
    expect(delivery.statusCode).toBe(200);

    const payload = {
      action: 'closed',
      number: 21,
      repository: {
        name: 'portal-replay',
        owner: {
          login: 'acme'
        }
      },
      pull_request: {
        number: 21,
        state: 'closed',
        merged: true,
        html_url: 'https://github.com/acme/portal-replay/pull/21'
      }
    };

    const accepted = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-replay-source',
        'x-hub-signature-256': signPayload(payload)
      },
      payload
    });
    expect(accepted.statusCode).toBe(200);

    const duplicate = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-replay-source',
        'x-hub-signature-256': signPayload(payload)
      },
      payload
    });
    expect(duplicate.statusCode).toBe(200);
    expect((duplicate.json() as { deduplicated: boolean; reason: string }).deduplicated).toBe(true);

    const replay = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks/replay',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        deliveryId: 'delivery-replay-source'
      }
    });
    expect(replay.statusCode).toBe(200);
    expect((replay.json() as { replayedFromDeliveryId: string }).replayedFromDeliveryId).toBe('delivery-replay-source');

    const wrongSecretPayload = {
      action: 'closed',
      number: 22,
      repository: {
        name: 'portal-replay',
        owner: {
          login: 'acme'
        }
      },
      pull_request: {
        number: 22,
        state: 'closed',
        merged: true,
        html_url: 'https://github.com/acme/portal-replay/pull/22'
      }
    };

    const wrongSecret = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-wrong-secret',
        'x-hub-signature-256': signPayloadWithSecret(wrongSecretPayload, 'wrong-secret')
      },
      payload: wrongSecretPayload
    });
    expect(wrongSecret.statusCode).toBe(401);

    const untrustedReplay = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks/replay',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        deliveryId: 'delivery-wrong-secret'
      }
    });
    expect(untrustedReplay.statusCode).toBe(409);

    process.env.OPS_GITHUB_WEBHOOK_SECRET = 'webhook-secret-rotated';

    const rotatedItem = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: 'Rotation target',
        description: 'Verify secret rotation rejects old signatures and accepts new ones.',
        state: 'review',
        priority: 56,
        actor: 'test'
      }
    });
    expect(rotatedItem.statusCode).toBe(201);
    const rotatedItemId = (rotatedItem.json() as { item: { id: string } }).item.id;

    const rotatedDelivery = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(rotatedItemId)}/delivery`,
      payload: {
        repoConnectionId: repoBody.repo.id,
        prNumber: 22,
        status: 'review'
      }
    });
    expect(rotatedDelivery.statusCode).toBe(200);

    const staleSecretAttempt = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-rotated-stale',
        'x-hub-signature-256': signPayloadWithSecret(wrongSecretPayload, webhookSecret)
      },
      payload: wrongSecretPayload
    });
    expect(staleSecretAttempt.statusCode).toBe(401);

    const rotatedAccepted = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'delivery-rotated-verified',
        'x-hub-signature-256': signPayloadWithSecret(wrongSecretPayload, 'webhook-secret-rotated')
      },
      payload: wrongSecretPayload
    });
    expect(rotatedAccepted.statusCode).toBe(200);

    const events = await harness.inject({
      method: 'GET',
      url: '/api/github/webhooks/events?limit=20',
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(events.statusCode).toBe(200);
    const eventsBody = events.json() as {
      entries: Array<{
        deliveryId: string | null;
        status: string;
        reason: string | null;
        replayOfDeliveryId: string | null;
      }>;
    };
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId === 'delivery-replay-source')
    ).toMatchObject({
      status: 'duplicate',
      reason: 'duplicate_delivery'
    });
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId?.startsWith('delivery-replay-source:replay:'))
    ).toMatchObject({
      status: 'replayed',
      replayOfDeliveryId: 'delivery-replay-source'
    });
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId === 'delivery-wrong-secret')
    ).toMatchObject({
      status: 'rejected',
      reason: 'invalid_signature'
    });
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId === 'delivery-rotated-stale')
    ).toMatchObject({
      status: 'rejected',
      reason: 'invalid_signature'
    });
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId === 'delivery-rotated-verified')
    ).toMatchObject({
      status: 'accepted',
      reason: null
    });
  });

  it('prevents unsigned or wrong-secret check and issue deliveries from mutating delivery truth', async () => {
    const repo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'acme',
        repo: 'portal-checks',
        authSecretRef: 'env:GITHUB_TOKEN',
        webhookSecretRef: 'env:OPS_GITHUB_WEBHOOK_SECRET',
        enabled: true
      }
    });
    expect(repo.statusCode).toBe(201);
    const repoBody = repo.json() as { repo: { id: string } };

    const db = harness.createDb();
    const backlogItem = db.createBacklogItem({
      title: 'Check and issue trust target',
      description: 'Negative test for unsigned check and issues deliveries.',
      state: 'review',
      priority: 61,
      createdBy: 'operator',
      source: 'dashboard'
    });
    db.upsertBacklogDeliveryLink({
      itemId: backlogItem.id,
      repoConnectionId: repoBody.repo.id,
      prNumber: 44,
      status: 'review',
      checks: {
        conclusion: 'success',
        updatedAt: '2026-03-14T12:00:00.000Z',
        event: 'check_run'
      },
      metadata: {
        githubIssue: {
          number: 901,
          state: 'open',
          url: 'https://github.com/acme/portal-checks/issues/901',
          labels: ['state:review'],
          assignees: ['octocat']
        }
      }
    });
    db.close();

    const checkPayload = {
      action: 'completed',
      repository: {
        name: 'portal-checks',
        owner: {
          login: 'acme'
        }
      },
      check_run: {
        conclusion: 'failure',
        pull_requests: [{ number: 44 }]
      }
    };

    const missingCheckSignature = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'check_run',
        'x-github-delivery': 'delivery-check-missing'
      },
      payload: checkPayload
    });
    expect(missingCheckSignature.statusCode).toBe(401);

    const issuePayload = {
      action: 'closed',
      repository: {
        name: 'portal-checks',
        owner: {
          login: 'acme'
        }
      },
      issue: {
        number: 901,
        state: 'closed',
        html_url: 'https://github.com/acme/portal-checks/issues/901',
        labels: [{ name: 'state:done' }],
        assignees: [{ login: 'octocat' }]
      }
    };

    const wrongSecretIssue = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'issues',
        'x-github-delivery': 'delivery-issue-invalid',
        'x-hub-signature-256': signPayloadWithSecret(issuePayload, 'wrong-secret')
      },
      payload: issuePayload
    });
    expect(wrongSecretIssue.statusCode).toBe(401);

    const itemDetails = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(backlogItem.id)}`
    });
    expect(itemDetails.statusCode).toBe(200);
    const itemDetailsBody = itemDetails.json() as {
      item: {
        state: string;
        delivery: {
          status: string;
          checks: {
            conclusion: string;
          };
          metadata: {
            githubIssue: {
              state: string;
            };
          };
        } | null;
      };
    };
    expect(itemDetailsBody.item.state).toBe('review');
    expect(itemDetailsBody.item.delivery?.status).toBe('review');
    expect(itemDetailsBody.item.delivery?.checks.conclusion).toBe('success');
    expect(itemDetailsBody.item.delivery?.metadata.githubIssue.state).toBe('open');

    const issueDetails = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(backlogItem.id)}/issues`
    });
    expect(issueDetails.statusCode).toBe(200);
    const issueDetailsBody = issueDetails.json() as {
      issue: {
        state: string;
      } | null;
    };
    expect(issueDetailsBody.issue?.state).toBe('open');
  });
});
