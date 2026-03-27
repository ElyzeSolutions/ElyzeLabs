import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';
import { buildGatewayApp } from '../../src/server.js';
import { installPortableRuntimeBinaryShims } from './runtime-binary-shims.js';

describe('frontier wave certification integration', () => {
  const restoreRuntimeBinaryShims = installPortableRuntimeBinaryShims('ops-frontier-wave');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-frontier-wave-'));
  const runtimeConfigPath = path.join(root, 'runtime-config.json');
  const apiToken = 'frontier-integration-token';
  const sqlitePath = path.join(root, 'state.db');
  const config = {
    server: {
      host: '127.0.0.1',
      port: 8788,
      companyName: 'Company',
      corsOrigin: '*',
      apiToken,
      logLevel: 'error'
    },
    channel: {
      telegram: {
        enabled: false,
        botToken: undefined,
        useWebhook: false,
        debugRawOutput: false,
        dmScope: 'peer',
        requireMentionInGroups: true,
        allowlist: []
      }
    },
    queue: {
      defaultLane: 'default',
      laneConcurrency: { default: 2 },
      retry: {
        maxAttempts: 3,
        baseDelayMs: 50,
        maxDelayMs: 120
      }
    },
    runtime: {
      defaultRuntime: 'process',
      workspaceRoot: root,
      workspaceStrategy: 'session',
      adapters: {
        codex: { command: 'codex', args: [] },
        claude: { command: 'claude', args: [] },
        gemini: { command: 'gemini', args: [] },
        process: {
          command: 'node',
          args: ['-e', 'let p=\"\";process.stdin.on(\"data\",c=>p+=c);process.stdin.on(\"end\",()=>{process.stdout.write(p||\"ok\");process.exit(0)});']
        }
      }
    },
    memory: {
      enabled: true,
      writeStructured: true,
      workspaceMemoryFile: 'MEMORY.md',
      dailyMemoryDir: '.daily',
      retentionDays: 30,
      embedding: {
        provider: 'noop',
        voyageModel: 'voyage-3-lite',
        voyageApiKey: undefined
      }
    },
    vault: {
      enabled: false,
      requireUnlockOnStartup: false,
      autoUnlockFromEnv: false,
      envKey: undefined,
      allowPassphraseUnlock: true,
      passphraseSalt: 'integration-vault-salt',
      passphraseIterations: 10_000
    },
    skills: {
      directories: ['skills', '.ops/skills'],
      catalogStrict: false,
      sandboxDefault: true,
      installer: {
        enabled: false,
        allowedSources: ['*/*'],
        blockedSources: [],
        requireApproval: false,
        timeoutMs: 20_000,
        maxAttempts: 1,
        installRoot: '.ops/skills'
      }
    },
    policy: {
      requirePairing: false,
      allowElevatedExecution: false,
      elevatedApprover: 'operator',
      delegationGuards: {
        maxHops: 4,
        maxFanoutPerStep: 3,
        cycleDetection: true
      }
    },
    observability: {
      eventBufferSize: 400,
      metricsWindowSec: 60
    },
    office: {
      enabled: false,
      defaultLayoutName: 'Main'
    },
    persistence: {
      sqlitePath
    }
  } as const;

  let app: Awaited<ReturnType<typeof buildGatewayApp>>;

  const frontierProof = (input: {
    principalId: string;
    actorType: 'agent' | 'board_user' | 'local_board_implicit';
    companyId?: string;
  }): string =>
    createHmac('sha256', apiToken)
      .update([input.principalId.trim(), input.actorType.trim().toLowerCase(), input.companyId?.trim() ?? ''].join('\n'))
      .digest('hex');

  const baseHeaders = (
    input: {
      role?: 'viewer' | 'operator' | 'admin';
      principalId?: string;
      actorType?: 'agent' | 'board_user' | 'local_board_implicit';
      companyId?: string;
      host?: string;
      origin?: string;
    } = {}
  ): Record<string, string> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiToken}`,
      'x-ops-role': input.role ?? 'admin',
      'x-ops-principal-id': input.principalId ?? 'local-board-implicit',
      'x-ops-actor-type': input.actorType ?? 'local_board_implicit',
      host: input.host ?? '127.0.0.1:8788'
    };
    if (input.companyId) {
      headers['x-ops-company-id'] = input.companyId;
    }
    headers['x-ops-frontier-proof'] = frontierProof({
      principalId: headers['x-ops-principal-id']!,
      actorType: headers['x-ops-actor-type'] as 'agent' | 'board_user' | 'local_board_implicit',
      companyId: headers['x-ops-company-id']
    });
    if (input.origin) {
      headers.origin = input.origin;
    }
    return headers;
  };

  beforeAll(async () => {
    fs.writeFileSync(runtimeConfigPath, JSON.stringify(config, null, 2));
    app = await buildGatewayApp(config as never, { runtimeConfigPath });
  });

  afterAll(async () => {
    await app.close();
    restoreRuntimeBinaryShims();
  });

  it('implements governance auth with invite/join/claim lifecycle', async () => {
    const createPrincipal = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/principals',
      headers: baseHeaders(),
      payload: {
        id: 'board-user-1',
        actorType: 'board_user',
        name: 'Board User 1'
      }
    });
    expect(createPrincipal.statusCode).toBe(201);

    const createCompany = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/companies',
      headers: baseHeaders(),
      payload: {
        name: 'Acme Frontier'
      }
    });
    expect(createCompany.statusCode).toBe(201);
    const createCompanyBody = createCompany.json() as { company: { id: string } };
    const companyId = createCompanyBody.company.id;

    const issueInviteResponse = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/invites',
      headers: baseHeaders({ companyId }),
      payload: {
        companyId,
        target: 'board-user-1',
        role: 'operator',
        ttlMinutes: 30
      }
    });
    expect(issueInviteResponse.statusCode).toBe(201);
    const inviteBody = issueInviteResponse.json() as { token: string };
    expect(inviteBody.token).toMatch(/^inv_/);

    const unsignedAcceptInviteResponse = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/invites/accept',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'x-ops-role': 'admin',
        'x-ops-principal-id': 'board-user-1',
        'x-ops-actor-type': 'board_user',
        'x-ops-company-id': companyId,
        host: '127.0.0.1:8788'
      },
      payload: {
        token: inviteBody.token,
        principalId: 'board-user-1',
        role: 'owner'
      }
    });
    expect(unsignedAcceptInviteResponse.statusCode).toBe(403);
    expect((unsignedAcceptInviteResponse.json() as { details?: { reason?: string } }).details?.reason).toBe(
      'frontier_actor_identity_unverified'
    );

    const acceptInviteResponse = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/invites/accept',
      headers: baseHeaders({ principalId: 'board-user-1', actorType: 'board_user', companyId }),
      payload: {
        token: inviteBody.token,
        principalId: 'board-user-1',
        role: 'owner'
      }
    });
    expect(acceptInviteResponse.statusCode).toBe(200);
    const governanceAfterAccept = await app.inject({
      method: 'GET',
      url: '/api/frontier/governance',
      headers: baseHeaders()
    });
    expect(governanceAfterAccept.statusCode).toBe(200);
    const governanceAfterAcceptBody = governanceAfterAccept.json() as {
      governance: {
        memberships: Array<{ principalId: string; companyId: string; role: string }>;
      };
    };
    expect(
      governanceAfterAcceptBody.governance.memberships.find(
        (entry) => entry.companyId === companyId && entry.principalId === 'board-user-1'
      )?.role
    ).toBe('operator');

    const createJoinPrincipal = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/principals',
      headers: baseHeaders(),
      payload: {
        id: 'board-user-2',
        actorType: 'board_user',
        name: 'Board User 2'
      }
    });
    expect(createJoinPrincipal.statusCode).toBe(201);

    const joinRequest = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/join-requests',
      headers: baseHeaders({ principalId: 'board-user-2', actorType: 'board_user', companyId }),
      payload: {
        companyId,
        principalId: 'board-user-2',
        note: 'joining as observer'
      }
    });
    expect(joinRequest.statusCode).toBe(201);
    const joinRequestBody = joinRequest.json() as { joinRequest: { id: string } };

    const decideJoinRequest = await app.inject({
      method: 'POST',
      url: `/api/frontier/governance/join-requests/${joinRequestBody.joinRequest.id}/decision`,
      headers: baseHeaders({ companyId }),
      payload: {
        decision: 'approved',
        role: 'viewer'
      }
    });
    expect(decideJoinRequest.statusCode).toBe(200);

    const challenge = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/claims/challenge',
      headers: baseHeaders({ companyId }),
      payload: {
        companyId,
        principalId: 'board-user-1',
        ttlMinutes: 20
      }
    });
    expect(challenge.statusCode).toBe(201);
    const challengeBody = challenge.json() as { token: string };
    expect(challengeBody.token).toMatch(/^claim_/);

    const claimComplete = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/claims/complete',
      headers: baseHeaders({ principalId: 'board-user-1', actorType: 'board_user', companyId }),
      payload: {
        token: challengeBody.token,
        principalId: 'board-user-1'
      }
    });
    expect(claimComplete.statusCode).toBe(200);

    const governance = await app.inject({
      method: 'GET',
      url: '/api/frontier/governance',
      headers: baseHeaders({ principalId: 'local-board-implicit' })
    });
    expect(governance.statusCode).toBe(200);
    const governanceBody = governance.json() as {
      governance: {
        memberships: Array<{ principalId: string; companyId: string; role: string }>;
        companies: Array<{ id: string; ownerPrincipalId: string }>;
      };
    };
    expect(
      governanceBody.governance.memberships.some(
        (entry) => entry.companyId === companyId && entry.principalId === 'board-user-1'
      )
    ).toBe(true);
    const claimedCompany = governanceBody.governance.companies.find((entry) => entry.id === companyId);
    expect(claimedCompany?.ownerPrincipalId).toBe('board-user-1');
  });

  it('enforces company-scoped authorization boundaries', async () => {
    const createPrincipal = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/principals',
      headers: baseHeaders(),
      payload: {
        id: 'agent-x',
        actorType: 'agent',
        name: 'Agent X'
      }
    });
    expect(createPrincipal.statusCode).toBe(201);

    const createCompany = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/companies',
      headers: baseHeaders(),
      payload: {
        name: 'Scoped Corp'
      }
    });
    expect(createCompany.statusCode).toBe(201);
    const companyId = (createCompany.json() as { company: { id: string } }).company.id;

    const forbiddenInvite = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/invites',
      headers: baseHeaders({
        principalId: 'agent-x',
        actorType: 'agent',
        companyId
      }),
      payload: {
        companyId,
        target: 'agent-x'
      }
    });
    expect(forbiddenInvite.statusCode).toBe(403);
    expect((forbiddenInvite.json() as { details?: { reason?: string } }).details?.reason).toBe('permission_denied');
  });

  it('enforces issue execution locks, deferred wake promotion, and stale repair', async () => {
    const acquire = await app.inject({
      method: 'POST',
      url: '/api/frontier/issues/ISSUE-1/wakeup',
      headers: baseHeaders(),
      payload: {
        companyId: 'company',
        requestedByAgentId: 'agent-a',
        requestedRunId: 'run-a',
        activeRunIds: ['run-a']
      }
    });
    expect(acquire.statusCode).toBe(201);
    const acquireBody = acquire.json() as { wakeup: { state: string } };
    expect(acquireBody.wakeup.state).toBe('acquired');

    const coalesce = await app.inject({
      method: 'POST',
      url: '/api/frontier/issues/ISSUE-1/wakeup',
      headers: baseHeaders(),
      payload: {
        companyId: 'company',
        requestedByAgentId: 'agent-a',
        requestedRunId: 'run-a-2',
        activeRunIds: ['run-a']
      }
    });
    expect(coalesce.statusCode).toBe(201);
    expect((coalesce.json() as { wakeup: { state: string } }).wakeup.state).toBe('coalesced_same_owner');

    const deferred = await app.inject({
      method: 'POST',
      url: '/api/frontier/issues/ISSUE-1/wakeup',
      headers: baseHeaders(),
      payload: {
        companyId: 'company',
        requestedByAgentId: 'agent-b',
        requestedRunId: 'run-b',
        activeRunIds: ['run-a']
      }
    });
    expect(deferred.statusCode).toBe(201);
    expect((deferred.json() as { wakeup: { state: string } }).wakeup.state).toBe('deferred_issue_lock');

    const forbiddenLocks = await app.inject({
      method: 'GET',
      url: '/api/frontier/issues/locks?issueId=ISSUE-1&companyId=company',
      headers: baseHeaders({
        principalId: 'issue-outsider',
        actorType: 'agent',
        companyId: 'company'
      })
    });
    expect(forbiddenLocks.statusCode).toBe(403);

    const locks = await app.inject({
      method: 'GET',
      url: '/api/frontier/issues/locks?issueId=ISSUE-1&companyId=company',
      headers: baseHeaders({ companyId: 'company' })
    });
    expect(locks.statusCode).toBe(200);
    const locksBody = locks.json() as {
      issueLocks: {
        locks: Array<{ issueId: string; ownerRunId: string }>;
      };
    };
    expect(locksBody.issueLocks.locks.some((entry) => entry.issueId === 'ISSUE-1' && entry.ownerRunId === 'run-a')).toBe(true);

    const release = await app.inject({
      method: 'POST',
      url: '/api/frontier/issues/ISSUE-1/release',
      headers: baseHeaders(),
      payload: {
        companyId: 'company',
        ownerRunId: 'run-a'
      }
    });
    expect(release.statusCode).toBe(200);
    const releaseBody = release.json() as { promoted: { state: string } | null };
    expect(releaseBody.promoted?.state).toBe('promoted_after_release');

    const repair = await app.inject({
      method: 'POST',
      url: '/api/frontier/issues/repair',
      headers: baseHeaders(),
      payload: {
        companyId: 'company',
        activeRunIds: []
      }
    });
    expect(repair.statusCode).toBe(200);
    const repairBody = repair.json() as { repaired: number };
    expect(repairBody.repaired).toBeGreaterThanOrEqual(1);
  });

  it('supports portability export/import preview/apply across local source manifests', async () => {
    const exportResponse = await app.inject({
      method: 'GET',
      url: '/api/frontier/portability/export?companyId=company',
      headers: baseHeaders({ companyId: 'company' })
    });
    expect(exportResponse.statusCode).toBe(200);
    const exportBody = exportResponse.json() as { manifest: Record<string, unknown> };

    const manifestPath = path.join(root, 'frontier-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(exportBody.manifest, null, 2));

    const preview = await app.inject({
      method: 'POST',
      url: '/api/frontier/portability/import/preview',
      headers: baseHeaders({ companyId: 'company' }),
      payload: {
        strategy: 'rename',
        source: {
          mode: 'local',
          path: manifestPath
        }
      }
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json() as { preview: { strategy: string; collisions: Array<unknown> } };
    expect(previewBody.preview.strategy).toBe('rename');
    expect(Array.isArray(previewBody.preview.collisions)).toBe(true);

    const apply = await app.inject({
      method: 'POST',
      url: '/api/frontier/portability/import/apply',
      headers: baseHeaders({ companyId: 'company' }),
      payload: {
        strategy: 'rename',
        source: {
          mode: 'local',
          path: manifestPath
        }
      }
    });
    expect(apply.statusCode).toBe(200);
    const applyBody = apply.json() as {
      governance: {
        companies: Array<{ id: string }>;
      };
    };
    expect(applyBody.governance.companies.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes adapter diagnostics and run event/log parity', async () => {
    const createAgent = await app.inject({
      method: 'POST',
      url: '/api/agents/profiles',
      headers: baseHeaders()
      ,
      payload: {
        id: 'frontier-agent',
        name: 'frontier-agent',
        title: 'Frontier Agent',
        systemPrompt: 'Frontier parity runner',
        defaultRuntime: 'process',
        allowedRuntimes: ['process', 'codex', 'claude', 'gemini']
      }
    });
    expect([200, 201]).toContain(createAgent.statusCode);
    const createdAgentId = (createAgent.json() as { agent?: { id?: string } }).agent?.id ?? 'frontier-agent';

    const sessionCreate = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: baseHeaders(),
      payload: {
        label: 'frontier-parity-session',
        agentId: createdAgentId
      }
    });
    expect(sessionCreate.statusCode).toBe(201);
    const sessionId = (sessionCreate.json() as { session: { id: string } }).session.id;

    const db = new ControlPlaneDatabase(sqlitePath);
    const run = db.createRun({
      sessionId,
      runtime: 'process',
      requestedRuntime: 'process',
      effectiveRuntime: 'process',
      triggerSource: 'dashboard',
      prompt: 'health parity test',
      status: 'queued'
    });
    db.updateRunStatus({
      runId: run.id,
      status: 'running'
    });
    db.upsertRunTerminalSession({
      runId: run.id,
      sessionId,
      runtime: 'process',
      mode: 'direct',
      muxSessionId: null,
      workspacePath: root,
      status: 'active'
    });
    db.appendRunTerminalChunk({
      runId: run.id,
      sessionId,
      chunk: 'health parity test\n'
    });
    db.closeRunTerminalSession(run.id, 'completed');
    db.updateRunStatus({
      runId: run.id,
      status: 'completed',
      resultSummary: 'health parity completed'
    });
    const runId = run.id;

    const diagnostics = await app.inject({
      method: 'GET',
      url: '/api/frontier/adapters/diagnostics',
      headers: baseHeaders()
    });
    expect(diagnostics.statusCode).toBe(200);
    const diagnosticsBody = diagnostics.json() as { diagnostics: Array<{ runtime: string; status: string }> };
    expect(diagnosticsBody.diagnostics.some((entry) => entry.runtime === 'process')).toBe(true);

    const events = await app.inject({
      method: 'GET',
      url: `/api/frontier/runs/${runId}/events`,
      headers: baseHeaders()
    });
    expect(events.statusCode).toBe(200);
    const eventsBody = events.json() as { events: Array<{ type: string }> };
    expect(eventsBody.events.length).toBeGreaterThan(0);

    const logs = await app.inject({
      method: 'GET',
      url: `/api/frontier/runs/${runId}/logs?offset=0&limit=50`,
      headers: baseHeaders()
    });
    expect(logs.statusCode).toBe(200);
    const logsBody = logs.json() as { chunks: Array<{ offset: number }> };
    expect(Array.isArray(logsBody.chunks)).toBe(true);
  }, 25_000);

  it('enforces deployment guardrails and repair-capable doctor flow', async () => {
    const setDeployment = await app.inject({
      method: 'PUT',
      url: '/api/frontier/deployment',
      headers: baseHeaders(),
      payload: {
        mode: 'authenticated_private',
        allowedHostnames: ['127.0.0.1'],
        trustedOrigins: []
      }
    });
    expect(setDeployment.statusCode).toBe(200);

    const blockedMutation = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/principals',
      headers: {
        ...baseHeaders(),
        host: '127.0.0.1:8788'
      },
      payload: {
        id: 'blocked-origin-principal'
      }
    });
    expect(blockedMutation.statusCode).toBe(403);
    expect((blockedMutation.json() as { details?: { reason?: string } }).details?.reason).toBe('origin_missing');

    const doctorRepair = await app.inject({
      method: 'POST',
      url: '/api/frontier/deployment/doctor',
      headers: baseHeaders({
        origin: 'http://127.0.0.1:4173'
      }),
      payload: {
        repair: true
      }
    });
    expect(doctorRepair.statusCode).toBe(200);
    const doctorBody = doctorRepair.json() as {
      doctor: {
        overall: string;
        checks: Array<{ id: string; repaired: boolean }>;
      };
    };
    expect(['pass', 'warn']).toContain(doctorBody.doctor.overall);
    expect(doctorBody.doctor.checks.some((entry) => entry.id === 'trusted_origins' && entry.repaired)).toBe(true);

    const allowedMutation = await app.inject({
      method: 'POST',
      url: '/api/frontier/governance/principals',
      headers: baseHeaders({
        origin: 'http://127.0.0.1:4173'
      }),
      payload: {
        id: 'allowed-origin-principal'
      }
    });
    expect(allowedMutation.statusCode).toBe(201);
  });

  it('supports benchmark delta, critic, remediation planning, and release gate certification', async () => {
    const authOriginHeaders = baseHeaders({
      origin: 'http://127.0.0.1:4173'
    });
    const scorecard = await app.inject({
      method: 'GET',
      url: '/api/frontier/scorecard',
      headers: authOriginHeaders
    });
    expect(scorecard.statusCode).toBe(200);
    const scorecardBody = scorecard.json() as {
      scorecard: {
        version: number;
        dimensions: Record<string, { threshold: number; weight: number; label: string }>;
        comparators: Record<string, { availability: string; discoveredPath: string | null }>;
        scenarios: Array<{ id: string }>;
        evidenceBundle: {
          schema: string;
          requiredArtifacts: string[];
        };
        legacyJsonSkillCallDecision: {
          schema: string;
          modes: Record<string, unknown>;
        };
      };
    };
    expect(scorecardBody.scorecard.version).toBe(2);
    expect(scorecardBody.scorecard.dimensions.tool_runtime_nativeness?.label).toBeTruthy();
    expect(scorecardBody.scorecard.dimensions.bootstrap_fidelity?.label).toBeTruthy();
    expect(scorecardBody.scorecard.dimensions.task_bound_continuity?.label).toBeTruthy();
    expect(scorecardBody.scorecard.dimensions.fallback_clarity?.label).toBeTruthy();
    expect(scorecardBody.scorecard.dimensions.operator_visible_truth?.label).toBeTruthy();
    expect(Object.keys(scorecardBody.scorecard.comparators)).toEqual(
      expect.arrayContaining(['baseline_alpha', 'baseline_beta', 'paperclip', 'baseline_gamma', 'baseline_delta', 'baseline_epsilon'])
    );
    expect(['available', 'missing']).toContain(scorecardBody.scorecard.comparators.baseline_delta?.availability);
    expect(['available', 'missing']).toContain(scorecardBody.scorecard.comparators.baseline_epsilon?.availability);
    expect(scorecardBody.scorecard.scenarios.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'native_tool_session',
        'bootstrap_provenance',
        'task_resume_integrity',
        'legacy_fallback_audit'
      ])
    );
    expect(scorecardBody.scorecard.evidenceBundle.schema).toBe('ops.frontier-comparator-evidence.v1');
    expect(scorecardBody.scorecard.evidenceBundle.requiredArtifacts).toContain('comparator_availability');
    expect(scorecardBody.scorecard.legacyJsonSkillCallDecision.schema).toBe('ops.legacy-json-skill-call-rubric.v1');
    expect(Object.keys(scorecardBody.scorecard.legacyJsonSkillCallDecision.modes)).toEqual(
      expect.arrayContaining(['retain', 'shadow', 'remove'])
    );

    const updatedScorecard = await app.inject({
      method: 'PUT',
      url: '/api/frontier/scorecard',
      headers: authOriginHeaders,
      payload: {
        dimensions: {
          tool_runtime_nativeness: {
            threshold: 0.93,
            weight: 0.16,
            label: 'Tool Runtime Nativeness',
            comparatorFocus: ['baseline_alpha', 'baseline_beta'],
            rubric: 'Native typed tools remain the default provider-backed path.'
          }
        }
      }
    });
    expect(updatedScorecard.statusCode).toBe(200);
    const updatedScorecardBody = updatedScorecard.json() as {
      scorecard: {
        dimensions: Record<string, { threshold: number; weight: number }>;
        comparators: Record<string, { availability: string }>;
        legacyJsonSkillCallDecision: {
          modes: Record<string, unknown>;
        };
      };
    };
    expect(updatedScorecardBody.scorecard.dimensions.tool_runtime_nativeness?.threshold).toBe(0.93);
    expect(updatedScorecardBody.scorecard.dimensions.tool_runtime_nativeness?.weight).toBe(0.16);
    expect(['available', 'missing']).toContain(updatedScorecardBody.scorecard.comparators.baseline_delta?.availability);
    expect(Object.keys(updatedScorecardBody.scorecard.legacyJsonSkillCallDecision.modes)).toEqual(
      expect.arrayContaining(['retain', 'shadow', 'remove'])
    );

    const comparatorRun = await app.inject({
      method: 'POST',
      url: '/api/frontier/comparator/run',
      headers: authOriginHeaders
    });
    expect(comparatorRun.statusCode).toBe(201);
    const comparatorRunBody = comparatorRun.json() as {
      run: {
        schema: string;
        comparators: Record<string, { availability: string; discoveredPath: string | null }>;
        scenarioResults: Array<{
          comparator: string;
          scenarioId: string;
          status: string;
          supportState: string;
          coverage: number;
          artifacts: Record<string, { status: string; matches: Array<{ file: string; line: number; excerpt: string }> }>;
        }>;
        scoreDeltas: Array<{
          comparator: string;
          dimension: string;
          status: string;
        }>;
      };
    };
    expect(comparatorRunBody.run.schema).toBe('ops.frontier-comparator-run.v1');
    expect(comparatorRunBody.run.scenarioResults.some((entry) => entry.comparator === 'elyze')).toBe(true);
    expect(
      comparatorRunBody.run.scenarioResults.some(
        (entry) => entry.comparator === 'elyze' && entry.scenarioId === 'native_tool_session'
      )
    ).toBe(true);
    const elyzeNativeScenario =
      comparatorRunBody.run.scenarioResults.find(
        (entry) => entry.comparator === 'elyze' && entry.scenarioId === 'native_tool_session'
      ) ?? null;
    expect(elyzeNativeScenario).toBeTruthy();
    expect(elyzeNativeScenario?.coverage).toBeGreaterThan(0);
    expect(Object.keys(elyzeNativeScenario?.artifacts ?? {})).toEqual(
      expect.arrayContaining(['executionPath', 'toolEvents', 'nativeToolSession', 'operatorReceipt'])
    );
    const baseline_deltaAvailability = comparatorRunBody.run.comparators.baseline_delta?.availability;
    if (baseline_deltaAvailability === 'missing') {
      expect(
        comparatorRunBody.run.scenarioResults
          .filter((entry) => entry.comparator === 'baseline_delta')
          .every((entry) => entry.status === 'not_available' && entry.supportState === 'missing_repo')
      ).toBe(true);
    }
    expect(
      comparatorRunBody.run.scoreDeltas.some(
        (entry) =>
          entry.comparator === 'elyze' &&
          ['tool_runtime_nativeness', 'bootstrap_fidelity', 'task_bound_continuity', 'fallback_clarity', 'operator_visible_truth'].includes(
            entry.dimension
          )
      )
    ).toBe(true);

    const comparatorClosure = await app.inject({
      method: 'POST',
      url: '/api/frontier/comparator/closure',
      headers: authOriginHeaders
    });
    expect(comparatorClosure.statusCode).toBe(201);
    const comparatorClosureBody = comparatorClosure.json() as {
      closure: {
        schema: string;
        legacyJsonDecision: {
          mode: string;
          rationale: string[];
          evidenceRequirements: string[];
        };
        summary: {
          wins: string[];
          remainingGaps: string[];
          missingReferences: string[];
        };
        followUpTasks: Array<{ id: string; criteria: string[] }>;
      };
    };
    expect(comparatorClosureBody.closure.schema).toBe('ops.frontier-comparator-closure.v1');
    expect(['retain', 'shadow', 'remove']).toContain(comparatorClosureBody.closure.legacyJsonDecision.mode);
    expect(comparatorClosureBody.closure.legacyJsonDecision.rationale.length).toBeGreaterThan(0);
    expect(Array.isArray(comparatorClosureBody.closure.summary.wins)).toBe(true);
    expect(Array.isArray(comparatorClosureBody.closure.summary.remainingGaps)).toBe(true);
    expect(Array.isArray(comparatorClosureBody.closure.summary.missingReferences)).toBe(true);
    expect(
      comparatorClosureBody.closure.followUpTasks.every((task) => task.id.length > 0 && task.criteria.length > 0)
    ).toBe(true);

    const delta = await app.inject({
      method: 'POST',
      url: '/api/frontier/benchmark/delta',
      headers: authOriginHeaders,
      payload: {
        current: {
          capability_accuracy: 0.71,
          message_quality: 0.76,
          parity_consistency: 0.79,
          operator_override_rate: 0.7,
          remediation_latency: 0.74
        },
        previous: {
          capability_accuracy: 0.83,
          message_quality: 0.84,
          parity_consistency: 0.86,
          operator_override_rate: 0.8,
          remediation_latency: 0.81
        }
      }
    });
    expect(delta.statusCode).toBe(200);
    const deltaBody = delta.json() as { regressions: Array<Record<string, unknown>> };
    expect(deltaBody.regressions.length).toBeGreaterThan(0);

    const critic = await app.inject({
      method: 'POST',
      url: '/api/frontier/critic',
      headers: authOriginHeaders,
      payload: {
        channel: 'telegram',
        text: 'Run status: completed. exit_code=0. next: commit and push with attached files.'
      }
    });
    expect(critic.statusCode).toBe(200);
    const criticBody = critic.json() as { critic: { score: { clarity: number } } };
    expect(criticBody.critic.score.clarity).toBeGreaterThan(0);

    const remediationPlans = await app.inject({
      method: 'POST',
      url: '/api/frontier/remediation/plans',
      headers: authOriginHeaders,
      payload: {
        approved: false,
        regressions: deltaBody.regressions,
        critic: criticBody.critic
      }
    });
    expect(remediationPlans.statusCode).toBe(201);
    const remediationPlansBody = remediationPlans.json() as { proposals: Array<{ status: string }> };
    expect(remediationPlansBody.proposals.length).toBeGreaterThan(0);

    const cert = await app.inject({
      method: 'POST',
      url: '/api/frontier/certification/report',
      headers: authOriginHeaders,
      payload: {
        status: 'passed',
        matrix: [{ surface: 'api', comparator: 'paperclip', score: 0.91 }],
        dimensions: { capability_accuracy: 0.91 },
        artifacts: { report: 'frontier-report.json' }
      }
    });
    expect(cert.statusCode).toBe(201);

    const gate = await app.inject({
      method: 'GET',
      url: '/api/frontier/release/gate',
      headers: authOriginHeaders
    });
    expect(gate.statusCode).toBe(200);
    const gateBody = gate.json() as {
      gate: {
        status: string;
        reasons: string[];
        comparatorRun: { schema: string } | null;
        comparatorClosure: { schema: string } | null;
      };
    };
    expect(['ready', 'blocked']).toContain(gateBody.gate.status);
    expect(Array.isArray(gateBody.gate.reasons)).toBe(true);
    expect(gateBody.gate.comparatorRun?.schema).toBe('ops.frontier-comparator-run.v1');
    expect(gateBody.gate.comparatorClosure?.schema).toBe('ops.frontier-comparator-closure.v1');
  });
});
