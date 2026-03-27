import { createHmac, generateKeyPairSync } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

const TEST_GITHUB_APP_PRIVATE_KEY = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
}).privateKey;
const TEST_GITHUB_WEBHOOK_SECRET = 'github-app-webhook-secret';

const toUrl = (input: string | URL | Request): string => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
};

const headerValue = (headers: HeadersInit | undefined, key: string): string | null => {
  if (!headers) {
    return null;
  }
  if (headers instanceof Headers) {
    return headers.get(key);
  }
  if (Array.isArray(headers)) {
    const entry = headers.find(([name]) => name.toLowerCase() === key.toLowerCase());
    return entry ? entry[1] : null;
  }
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === key.toLowerCase()) {
      return String(value);
    }
  }
  return null;
};

const signPayload = (payload: Record<string, unknown>): string =>
  `sha256=${createHmac('sha256', TEST_GITHUB_WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex')}`;

describe('github app auth integration', () => {
  let harness: GatewayTestHarness;

  beforeAll(async () => {
    process.env.OPS_GITHUB_PAT = 'ghp_pat_allowed';
    process.env.OPS_GITHUB_APP_PRIVATE_KEY = TEST_GITHUB_APP_PRIVATE_KEY;
    process.env.OPS_GITHUB_WEBHOOK_SECRET = TEST_GITHUB_WEBHOOK_SECRET;
    delete process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW;
    harness = await createGatewayTestHarness('github-app-auth');
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await harness.close();
    delete process.env.OPS_GITHUB_PAT;
    delete process.env.OPS_GITHUB_APP_PRIVATE_KEY;
    delete process.env.OPS_GITHUB_WEBHOOK_SECRET;
    delete process.env.OPS_GITHUB_PAT_FALLBACK_ALLOW;
  });

  it('uses installation tokens for app-backed sync and write flows and blocks PAT fallback until explicitly allowed', async () => {
    const fetchCalls: Array<{ url: string; method: string; authorization: string | null }> = [];
    let tokenExchangeCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = toUrl(input);
      const method = String(init?.method ?? 'GET').toUpperCase();
      const authorization = headerValue(init?.headers, 'authorization');
      fetchCalls.push({ url, method, authorization });

      if (url.endsWith('/app/installations/424242/access_tokens')) {
        const token = tokenExchangeCount === 0 ? 'ghs_install_token_sync' : 'ghs_install_token_issue_sync';
        const expiresAt = tokenExchangeCount === 0 ? '2026-03-14T12:00:00.000Z' : '2026-03-14T12:30:00.000Z';
        tokenExchangeCount += 1;
        return new Response(
          JSON.stringify({
            token,
            expires_at: expiresAt,
            permissions: {
              contents: 'write',
              pull_requests: 'write',
              issues: 'write'
            }
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }

      if (url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard') {
        return new Response(
          JSON.stringify({
            id: 987,
            default_branch: 'main',
            private: true,
            visibility: 'private',
            archived: false,
            permissions: { push: true },
            pushed_at: '2026-03-14T11:00:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard-pat') {
        return new Response(
          JSON.stringify({
            id: 654,
            default_branch: 'main',
            private: true,
            visibility: 'private',
            archived: false,
            permissions: { push: true },
            pushed_at: '2026-03-14T11:30:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard/issues') {
        return new Response(
          JSON.stringify({
            number: 77,
            html_url: 'https://github.com/ElyzeSolutions/ops-dashboard/issues/77',
            state: 'open'
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }

      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ login: 'pat-operator' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ message: `Unexpected ${method} ${url}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const createAppRepo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'ElyzeSolutions',
        repo: 'ops-dashboard',
        defaultBranch: 'main',
        authSecretRef: 'env:OPS_GITHUB_APP_PRIVATE_KEY',
        authMode: 'github_app',
        appInstallationId: 424242,
        appInstallationAccountLogin: 'elyze-app',
        webhookSecretRef: 'env:OPS_GITHUB_WEBHOOK_SECRET',
        metadata: {
          githubAppId: '12345'
        }
      }
    });
    expect(createAppRepo.statusCode).toBe(201);
    const appRepoBody = createAppRepo.json() as { repo: { id: string } };

    const syncAppRepo = await harness.inject({
      method: 'POST',
      url: `/api/github/repos/${encodeURIComponent(appRepoBody.repo.id)}/sync`,
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(syncAppRepo.statusCode).toBe(200);
    const syncAppBody = syncAppRepo.json() as {
      repo: {
        authMode: string;
        tokenExpiresAt: string | null;
        lastValidationStatus: string | null;
        permissionSnapshotJson: string;
      };
      github: {
        viewer: string | null;
      };
    };
    expect(syncAppBody.repo.authMode).toBe('github_app');
    expect(syncAppBody.repo.tokenExpiresAt).toBe('2026-03-14T12:00:00.000Z');
    expect(syncAppBody.repo.lastValidationStatus).toBe('ok');
    expect(JSON.parse(syncAppBody.repo.permissionSnapshotJson)).toMatchObject({
      contents: 'write',
      pull_requests: 'write',
      issues: 'write'
    });
    expect(syncAppBody.github.viewer).toBe('elyze-app');

    const db = harness.createDb();
    const backlogItem = db.createBacklogItem({
      title: 'Sync README tasks to GitHub issues',
      description: 'Ensure README chores stay visible in GitHub.',
      state: 'planned',
      priority: 70,
      createdBy: 'operator',
      source: 'dashboard'
    });
    db.upsertBacklogDeliveryLink({
      itemId: backlogItem.id,
      repoConnectionId: appRepoBody.repo.id,
      status: 'planned'
    });
    db.close();

    const issueSync = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(backlogItem.id)}/issues/sync`,
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(issueSync.statusCode).toBe(200);
    const issueSyncBody = issueSync.json() as {
      issue: {
        number: number | null;
        url: string | null;
      };
    };
    expect(issueSyncBody.issue.number).toBe(77);
    expect(issueSyncBody.issue.url).toContain('/issues/77');

    const refreshedDb = harness.createDb();
    const refreshedRepo = refreshedDb.getGithubRepoConnectionById(appRepoBody.repo.id);
    refreshedDb.close();
    expect(refreshedRepo?.tokenExpiresAt).toBe('2026-03-14T12:30:00.000Z');

    const tokenExchangeCall = fetchCalls.find((call) => call.url.endsWith('/app/installations/424242/access_tokens'));
    expect(tokenExchangeCall?.authorization?.startsWith('Bearer ')).toBe(true);
    expect(tokenExchangeCall?.authorization).not.toBe('Bearer ghs_install_token_sync');
    expect(tokenExchangeCount).toBe(2);
    expect(
      fetchCalls.some(
        (call) =>
          call.url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard' &&
          call.authorization === 'Bearer ghs_install_token_sync'
      )
    ).toBe(true);
    expect(
      fetchCalls.some(
        (call) =>
          call.url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard/issues' &&
          call.authorization === 'Bearer ghs_install_token_issue_sync'
      )
    ).toBe(true);

    const createPatRepo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'ElyzeSolutions',
        repo: 'ops-dashboard-pat',
        defaultBranch: 'main',
        authSecretRef: 'env:OPS_GITHUB_PAT',
        authMode: 'pat_fallback'
      }
    });
    expect(createPatRepo.statusCode).toBe(201);
    const patRepoBody = createPatRepo.json() as {
      repo: {
        id: string;
        metadata: {
          patFallbackAllowed?: boolean;
        };
      };
    };
    expect(patRepoBody.repo.metadata.patFallbackAllowed).toBe(true);

    const defaultPatSync = await harness.inject({
      method: 'POST',
      url: `/api/github/repos/${encodeURIComponent(patRepoBody.repo.id)}/sync`,
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(defaultPatSync.statusCode).toBe(200);

    const disablePatFallback = await harness.inject({
      method: 'PATCH',
      url: `/api/github/repos/${encodeURIComponent(patRepoBody.repo.id)}`,
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        metadata: {
          patFallbackAllowed: false
        }
      }
    });
    expect(disablePatFallback.statusCode).toBe(200);

    const blockedPatSync = await harness.inject({
      method: 'POST',
      url: `/api/github/repos/${encodeURIComponent(patRepoBody.repo.id)}/sync`,
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(blockedPatSync.statusCode).toBe(409);
    expect(blockedPatSync.body).toContain('PAT fallback is blocked');

    const enablePatFallback = await harness.inject({
      method: 'PATCH',
      url: `/api/github/repos/${encodeURIComponent(patRepoBody.repo.id)}`,
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        metadata: {
          patFallbackAllowed: true
        }
      }
    });
    expect(enablePatFallback.statusCode).toBe(200);

    const allowedPatSync = await harness.inject({
      method: 'POST',
      url: `/api/github/repos/${encodeURIComponent(patRepoBody.repo.id)}/sync`,
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(allowedPatSync.statusCode).toBe(200);
    const allowedPatBody = allowedPatSync.json() as {
      repo: {
        authMode: string;
        lastValidationStatus: string | null;
      };
      github: {
        viewer: string | null;
      };
    };
    expect(allowedPatBody.repo.authMode).toBe('pat_fallback');
    expect(allowedPatBody.repo.lastValidationStatus).toBe('ok');
    expect(allowedPatBody.github.viewer).toBe('pat-operator');
    expect(
      fetchCalls.some(
        (call) =>
          call.url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard-pat' &&
          call.authorization === 'Bearer ghp_pat_allowed'
      )
    ).toBe(true);
  });

  it('blocks app-backed write flows when installation permissions drift below required access', async () => {
    const fetchCalls: Array<{ url: string; method: string; authorization: string | null }> = [];
    let tokenExchangeCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = toUrl(input);
      const method = String(init?.method ?? 'GET').toUpperCase();
      const authorization = headerValue(init?.headers, 'authorization');
      fetchCalls.push({ url, method, authorization });

      if (url.endsWith('/app/installations/525252/access_tokens')) {
        tokenExchangeCount += 1;
        return new Response(
          JSON.stringify({
            token: tokenExchangeCount === 1 ? 'ghs_perm_ok' : 'ghs_perm_limited',
            expires_at: tokenExchangeCount === 1 ? '2026-03-14T13:00:00.000Z' : '2026-03-14T13:30:00.000Z',
            permissions:
              tokenExchangeCount === 1
                ? {
                    contents: 'write',
                    pull_requests: 'write',
                    issues: 'write'
                  }
                : {
                    contents: 'write',
                    pull_requests: 'write',
                    issues: 'read'
                  }
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }

      if (url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard-perms') {
        return new Response(
          JSON.stringify({
            id: 321,
            default_branch: 'main',
            private: true,
            visibility: 'private',
            archived: false,
            permissions: { push: true },
            pushed_at: '2026-03-14T12:45:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ message: `Unexpected ${method} ${url}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const createAppRepo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'ElyzeSolutions',
        repo: 'ops-dashboard-perms',
        defaultBranch: 'main',
        authSecretRef: 'env:OPS_GITHUB_APP_PRIVATE_KEY',
        authMode: 'github_app',
        appInstallationId: 525252,
        appInstallationAccountLogin: 'elyze-app',
        metadata: {
          githubAppId: '12345'
        }
      }
    });
    expect(createAppRepo.statusCode).toBe(201);
    const appRepoBody = createAppRepo.json() as { repo: { id: string } };

    const syncAppRepo = await harness.inject({
      method: 'POST',
      url: `/api/github/repos/${encodeURIComponent(appRepoBody.repo.id)}/sync`,
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(syncAppRepo.statusCode).toBe(200);

    const db = harness.createDb();
    const backlogItem = db.createBacklogItem({
      title: 'Permission drift target',
      description: 'Ensure revoked app permissions block writes.',
      state: 'planned',
      priority: 65,
      createdBy: 'operator',
      source: 'dashboard'
    });
    db.upsertBacklogDeliveryLink({
      itemId: backlogItem.id,
      repoConnectionId: appRepoBody.repo.id,
      status: 'planned'
    });
    db.close();

    const issueSync = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${encodeURIComponent(backlogItem.id)}/issues/sync`,
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(issueSync.statusCode).toBe(409);
    expect(issueSync.body).toContain('issues:write');
    expect(
      fetchCalls.some((call) => call.url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard-perms/issues')
    ).toBe(false);

    const repoDb = harness.createDb();
    const blockedRepo = repoDb.getGithubRepoConnectionById(appRepoBody.repo.id);
    repoDb.close();
    expect(blockedRepo?.lastValidationStatus).toBe('blocked');
    expect(blockedRepo?.lastValidationError).toContain('missing_permissions:issues:write');
    expect(tokenExchangeCount).toBe(2);
  });

  it('captures an app-backed repo sync plus verified webhook round trip', async () => {
    const fetchCalls: Array<{ url: string; method: string; authorization: string | null }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = toUrl(input);
      const method = String(init?.method ?? 'GET').toUpperCase();
      const authorization = headerValue(init?.headers, 'authorization');
      fetchCalls.push({ url, method, authorization });

      if (url.endsWith('/app/installations/626262/access_tokens')) {
        return new Response(
          JSON.stringify({
            token: 'ghs_roundtrip_token',
            expires_at: '2026-03-14T14:00:00.000Z',
            permissions: {
              contents: 'write',
              pull_requests: 'write',
              issues: 'write'
            }
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      }

      if (url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard-roundtrip') {
        return new Response(
          JSON.stringify({
            id: 456,
            default_branch: 'main',
            private: true,
            visibility: 'private',
            archived: false,
            permissions: { push: true },
            pushed_at: '2026-03-14T13:45:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ message: `Unexpected ${method} ${url}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const createAppRepo = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      headers: {
        'x-ops-role': 'admin'
      },
      payload: {
        owner: 'ElyzeSolutions',
        repo: 'ops-dashboard-roundtrip',
        defaultBranch: 'main',
        authSecretRef: 'env:OPS_GITHUB_APP_PRIVATE_KEY',
        authMode: 'github_app',
        appInstallationId: 626262,
        appInstallationAccountLogin: 'elyze-app',
        webhookSecretRef: 'env:OPS_GITHUB_WEBHOOK_SECRET',
        metadata: {
          githubAppId: '12345'
        }
      }
    });
    expect(createAppRepo.statusCode).toBe(201);
    const appRepoBody = createAppRepo.json() as { repo: { id: string } };

    const syncAppRepo = await harness.inject({
      method: 'POST',
      url: `/api/github/repos/${encodeURIComponent(appRepoBody.repo.id)}/sync`,
      headers: {
        'x-ops-role': 'admin'
      }
    });
    expect(syncAppRepo.statusCode).toBe(200);

    const db = harness.createDb();
    const backlogItem = db.createBacklogItem({
      title: 'App-backed webhook evidence',
      description: 'Certify app auth plus verified webhook mutation.',
      state: 'review',
      priority: 80,
      createdBy: 'operator',
      source: 'dashboard'
    });
    db.upsertBacklogDeliveryLink({
      itemId: backlogItem.id,
      repoConnectionId: appRepoBody.repo.id,
      prNumber: 98,
      status: 'review'
    });
    db.close();

    const payload = {
      action: 'closed',
      number: 98,
      repository: {
        name: 'ops-dashboard-roundtrip',
        owner: {
          login: 'elyzesolutions'
        }
      },
      pull_request: {
        number: 98,
        state: 'closed',
        merged: true,
        html_url: 'https://github.com/elyzesolutions/ops-dashboard-roundtrip/pull/98'
      }
    };

    const webhook = await harness.inject({
      method: 'POST',
      url: '/api/github/webhooks',
      headers: {
        'x-ops-role': 'admin',
        'x-github-event': 'pull_request',
        'x-github-delivery': 'app-roundtrip-verified',
        'x-hub-signature-256': signPayload(payload)
      },
      payload
    });
    expect(webhook.statusCode).toBe(200);
    expect((webhook.json() as { updates: number }).updates).toBeGreaterThan(0);

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
        } | null;
      };
    };
    expect(itemDetailsBody.item.state).toBe('done');
    expect(itemDetailsBody.item.delivery?.status).toBe('merged');

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
      }>;
    };
    expect(
      eventsBody.entries.find((entry) => entry.deliveryId === 'app-roundtrip-verified')
    ).toMatchObject({
      signatureState: 'verified',
      status: 'accepted'
    });
    expect(
      fetchCalls.some(
        (call) =>
          call.url === 'https://api.github.com/repos/elyzesolutions/ops-dashboard-roundtrip' &&
          call.authorization === 'Bearer ghs_roundtrip_token'
      )
    ).toBe(true);
  });
});
