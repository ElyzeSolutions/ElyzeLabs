import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

async function enableProcessHarness(harness: GatewayTestHarness): Promise<void> {
  const llmLimits = await harness.inject({
    method: 'GET',
    url: '/api/llm/limits'
  });
  expect(llmLimits.statusCode).toBe(200);
  const llmLimitsBody = llmLimits.json() as {
    limits: {
      localHarnessByRuntime: Record<string, boolean>;
      orchestratorLocalHarnessByRuntime: Record<string, boolean>;
    } & Record<string, unknown>;
  };
  const nextLimits = structuredClone(llmLimitsBody.limits) as {
    localHarnessByRuntime: Record<string, boolean>;
    orchestratorLocalHarnessByRuntime: Record<string, boolean>;
  } & Record<string, unknown>;
  nextLimits.localHarnessByRuntime.process = true;
  nextLimits.orchestratorLocalHarnessByRuntime.process = true;
  const saveLimits = await harness.inject({
    method: 'PUT',
    url: '/api/llm/limits',
    payload: {
      limits: nextLimits,
      actor: 'test'
    }
  });
  expect(saveLimits.statusCode).toBe(200);
}

async function enableCodexHarness(harness: GatewayTestHarness): Promise<void> {
  const llmLimits = await harness.inject({
    method: 'GET',
    url: '/api/llm/limits'
  });
  expect(llmLimits.statusCode).toBe(200);
  const llmLimitsBody = llmLimits.json() as {
    limits: {
      localHarnessByRuntime: Record<string, boolean>;
      orchestratorLocalHarnessByRuntime: Record<string, boolean>;
    } & Record<string, unknown>;
  };
  const nextLimits = structuredClone(llmLimitsBody.limits) as {
    localHarnessByRuntime: Record<string, boolean>;
    orchestratorLocalHarnessByRuntime: Record<string, boolean>;
  } & Record<string, unknown>;
  nextLimits.localHarnessByRuntime.codex = true;
  nextLimits.orchestratorLocalHarnessByRuntime.codex = true;
  const saveLimits = await harness.inject({
    method: 'PUT',
    url: '/api/llm/limits',
    payload: {
      limits: nextLimits,
      actor: 'test'
    }
  });
  expect(saveLimits.statusCode).toBe(200);
}

function seedDefaultAgents(db: ControlPlaneDatabase): void {
  db.upsertAgentProfile({
    id: 'ceo-default',
    name: 'CEO',
    title: 'Chief Executive Agent',
    systemPrompt: 'Coordinate repository work.',
    defaultRuntime: 'process',
    allowedRuntimes: ['process', 'codex', 'claude', 'gemini'],
    tools: ['runtime:process', 'runtime:codex']
  });
  db.upsertAgentProfile({
    id: 'software-engineer',
    name: 'Software Engineer',
    title: 'Senior Software Engineer',
    parentAgentId: 'ceo-default',
    systemPrompt: 'Implement the requested changes.',
    defaultRuntime: 'codex',
    allowedRuntimes: ['codex', 'process', 'claude', 'gemini'],
    tools: ['runtime:codex', 'runtime:process', 'git']
  });
}

function initRepo(repoRoot: string, remoteUrl: string): void {
  fs.mkdirSync(repoRoot, { recursive: true });
  const runGit = (args: string[]): void => {
    const result = spawnSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
  };
  runGit(['init', '--initial-branch=main']);
  runGit(['config', 'user.name', 'Gateway Integration']);
  runGit(['config', 'user.email', 'gateway-integration@elyzelabs.local']);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), `# ${path.basename(repoRoot)}\n`);
  runGit(['add', 'README.md']);
  runGit(['commit', '-m', 'init']);
  runGit(['remote', 'add', 'origin', remoteUrl]);
}

describe('gateway execution-contract scope integration', () => {
  const harnesses: GatewayTestHarness[] = [];

  const createHarness = async (label: string): Promise<GatewayTestHarness> => {
    const harness = await createGatewayTestHarness(label);
    harnesses.push(harness);
    return harness;
  };

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it('keeps backlog scope project-bound until a hinted repo actually exists inside the workspace', async () => {
    const harness = await createHarness('scope-project-only-before-clone');
    const db = harness.createDb();

    await enableProcessHarness(harness);
    seedDefaultAgents(db);

    const session = db.upsertSessionByKey({
      sessionKey: `outer-repo-only-${Date.now().toString(36)}`,
      channel: 'internal',
      chatType: 'internal',
      agentId: 'ceo-default',
      preferredRuntime: 'process'
    });

    const sessionWorkspace = path.join(String((harness.config.runtime as { workspaceRoot: string }).workspaceRoot), session.id);
    initRepo(sessionWorkspace, 'https://github.com/ElyzeSolutions/ElyzeLabs.git');
    const realSessionWorkspace = fs.realpathSync(sessionWorkspace);

    const contractPayload = {
      type: 'execution_contract',
      schema: 'ops.execution-contract.v1',
      reason: 'Clone ugothere.ai and add a contact page',
      intakeDecision: {
        schema: 'ops.intake-decision.v1',
        version: 1,
        action: 'plan_backlog',
        backlog: {
          required: true,
          title: 'Clone ugothere.ai and add a contact page',
          description: 'Track the repo before the clone is materialized.',
          priority: 84
        },
        targetAgentId: 'software-engineer',
        requiredSkills: ['p4rd'],
        requiredTools: ['git', 'codex'],
        missingCapabilities: [],
        rationale: {
          summary: 'Before clone time, backlog should stay scoped by project hint only.',
          confidence: 0.91,
          notes: ['Do not bind to the enclosing workspace repo root when it is a different repository.']
        }
      },
      backlog: {
        required: true,
        title: 'Clone ugothere.ai and add a contact page',
        description: 'Track the repo before the clone is materialized.',
        priority: 84
      },
      tasks: [
        {
          taskId: 'outer-repo-only-task',
          title: 'Clone ugothere.ai and add a contact page',
          action: 'dispatch_subrun',
          targetAgentId: 'software-engineer',
          runtime: 'codex',
          prompt:
            'Clone `ugothere.ai` into the current workspace and add a contact page. Use `https://github.com/ElyzeSolutions/ugothere.ai.git` if you need an HTTPS clone URL.'
        }
      ]
    };

    const runResponse = await harness.inject({
      method: 'POST',
      url: `/api/sessions/${session.id}/runs`,
      headers: {
        'Idempotency-Key': 'outer-repo-only-scope-contract'
      },
      payload: {
        prompt: JSON.stringify(contractPayload),
        runtime: 'process',
        source: 'dashboard',
        autoDelegate: false
      }
    });
    expect(runResponse.statusCode).toBe(201);
    const runBody = runResponse.json() as {
      run: {
        id: string;
      };
    };

    const ceoRun = await harness.waitForTerminalRun(runBody.run.id, 20_000);
    expect(['completed', 'failed', 'aborted']).toContain(ceoRun.status);

    const contractResponse = await harness.inject({
      method: 'GET',
      url: `/api/runs/${runBody.run.id}/execution-contract`
    });
    expect(contractResponse.statusCode).toBe(200);
    const contractBody = contractResponse.json() as {
      dispatches: Array<{
        taskId: string;
        status: string;
        details?: Record<string, unknown>;
      }>;
    };
    const queuedDispatch = contractBody.dispatches.find(
      (dispatch) => dispatch.taskId === 'outer-repo-only-task' && dispatch.status === 'queued'
    );
    expect(queuedDispatch).toBeTruthy();
    expect(fs.realpathSync(String(queuedDispatch?.details?.repoCwd ?? ''))).toBe(realSessionWorkspace);

    const backlogItemId = String(queuedDispatch?.details?.backlogItemId ?? '');
    expect(backlogItemId.length).toBeGreaterThan(0);

    const backlogItemResponse = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(backlogItemId)}`
    });
    expect(backlogItemResponse.statusCode).toBe(200);
    const backlogItemBody = backlogItemResponse.json() as {
      item: {
        projectId: string | null;
        repoRoot: string | null;
        metadata: {
          githubRepoHint?: {
            owner: string;
            repo: string;
          };
        };
        scope: {
          scopeSource: string;
        };
      };
    };
    expect(backlogItemBody.item.projectId).toBe('ugothere-ai');
    expect(backlogItemBody.item.repoRoot).toBeNull();
    expect(backlogItemBody.item.metadata.githubRepoHint?.owner).toBe('elyzesolutions');
    expect(backlogItemBody.item.metadata.githubRepoHint?.repo).toBe('ugothere.ai');
    expect(backlogItemBody.item.scope.scopeSource).toBe('explicit_contract');
    db.close();
  });

  it('preserves the stored scope contract when a backlog patch tries to switch to a mismatched repo identity', async () => {
    const harness = await createHarness('scope-patch-mismatch');
    const originalRepoRoot = path.join(harness.root, 'scopes', 'ugothere.ai');
    const mismatchedRepoRoot = path.join(harness.root, 'scopes', 'different-repo');
    fs.mkdirSync(originalRepoRoot, { recursive: true });
    fs.mkdirSync(mismatchedRepoRoot, { recursive: true });

    const createResponse = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        actor: 'integration-test',
        title: 'Scoped item',
        description: 'Track repo-bound work.',
        projectId: 'ugothere-ai',
        repoRoot: originalRepoRoot,
        metadata: {
          githubRepoHint: {
            owner: 'elyzesolutions',
            repo: 'ugothere.ai'
          }
        }
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const createBody = createResponse.json() as {
      item: {
        id: string;
      };
    };

    const patchResponse = await harness.inject({
      method: 'PATCH',
      url: `/api/backlog/items/${encodeURIComponent(createBody.item.id)}`,
      payload: {
        projectId: 'different-repo',
        repoRoot: mismatchedRepoRoot,
        scopeSource: 'explicit_contract',
        metadata: {
          githubRepoHint: {
            owner: 'other-owner',
            repo: 'different-repo'
          }
        }
      }
    });
    expect(patchResponse.statusCode).toBe(200);
    const patchBody = patchResponse.json() as {
      item: {
        projectId: string | null;
        repoRoot: string | null;
        scope: {
          projectId: string | null;
          repoRoot: string | null;
          scopeSource: string;
        };
        metadata: {
          scopeDiagnostics?: Array<{
            context: string;
            reason: string;
          }>;
        };
      };
    };
    expect(patchBody.item.projectId).toBe('ugothere-ai');
    expect(patchBody.item.repoRoot).toBe(originalRepoRoot);
    expect(patchBody.item.scope.projectId).toBe('ugothere-ai');
    expect(patchBody.item.scope.repoRoot).toBe(originalRepoRoot);
    expect(patchBody.item.scope.scopeSource).toBe('workspace_fallback');
    expect(patchBody.item.metadata.scopeDiagnostics?.some((entry) => entry.context === 'backlog_item_patch')).toBe(true);
  });

  it('prefers hinted nested repos over enclosing workspace roots for execution-contract dispatch', async () => {
    const harness = await createHarness('scope-prefers-nested-repo');
    const db = harness.createDb();
    seedDefaultAgents(db);

    const session = db.upsertSessionByKey({
      sessionKey: `nested-repo-scope-${Date.now().toString(36)}`,
      channel: 'internal',
      chatType: 'internal',
      agentId: 'ceo-default',
      preferredRuntime: 'process'
    });
    const sessionWorkspace = path.join(String((harness.config.runtime as { workspaceRoot: string }).workspaceRoot), session.id);
    initRepo(sessionWorkspace, 'https://github.com/ElyzeSolutions/ElyzeLabs.git');
    const hintedRepoRoot = path.join(sessionWorkspace, 'ugothere.ai');
    const alternateRepoRoot = path.join(sessionWorkspace, 'ugothere.ai.https');
    initRepo(hintedRepoRoot, 'https://github.com/ElyzeSolutions/ugothere.ai.git');
    initRepo(alternateRepoRoot, 'https://github.com/ElyzeSolutions/ugothere.ai.git');
    fs.writeFileSync(path.join(hintedRepoRoot, 'contact.txt'), 'contact page pending\n');
    const realSessionWorkspace = fs.realpathSync(sessionWorkspace);
    const realHintedRepoRoot = fs.realpathSync(hintedRepoRoot);
    const realAlternateRepoRoot = fs.realpathSync(alternateRepoRoot);
    db.updateSessionMetadata({
      sessionId: session.id,
      metadata: {
        runtimeOverrides: {
          cwd: realSessionWorkspace
        }
      }
    });

    const run = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      requestedRuntime: 'process',
      effectiveRuntime: 'process',
      triggerSource: 'dashboard',
      prompt: 'Dispatch execution contract inside the hinted nested repo.',
      status: 'completed'
    });

    db.upsertExecutionContract({
      runId: run.id,
      sessionId: session.id,
      source: 'execution_contract_manual',
      status: 'parsed',
      contract: {
        schema: 'ops.execution-contract.v1',
        intakeDecision: {
          schema: 'ops.intake-decision.v1',
          version: 1,
          action: 'plan_backlog',
          backlog: {
            required: true,
            title: 'Clone ugothere.ai and add a contact page',
            description: 'Track a scoped repository delivery before delegation.',
            priority: 86
          },
          targetAgentId: 'software-engineer',
          requiredSkills: ['p4rd'],
          requiredTools: ['git', 'codex'],
          missingCapabilities: [],
          rationale: {
            summary: 'Repository work should be scoped to the hinted repo, not the enclosing workspace.',
            confidence: 0.93,
            notes: ['Prefer the exact repo match when multiple git roots exist in the session workspace.']
          }
        },
        backlog: {
          required: true,
          title: 'Clone ugothere.ai and add a contact page',
          description: 'Track a scoped repository delivery before delegation.',
          priority: 86
        },
        tasks: [
          {
            taskId: 'nested-repo-task',
            title: 'Implement contact page inside ugothere.ai',
            action: 'dispatch_subrun',
            targetAgentId: 'software-engineer',
            runtime: 'codex',
            prompt: 'Work inside ugothere.ai and add a contact page with lightweight validation.'
          }
        ]
      }
    });

    const control = await harness.inject({
      method: 'POST',
      url: `/api/runs/${run.id}/control-actions`,
      payload: {
        action: 'dispatch_subrun',
        actor: 'integration-test'
      }
    });
    expect(control.statusCode).toBe(200);
    const controlBody = control.json() as {
      contract: {
        status: string;
      };
      dispatches: Array<{
        taskId: string;
        status: string;
        delegatedRunId: string | null;
        details?: Record<string, unknown>;
      }>;
    };
    expect(controlBody.contract.status).toBe('dispatched');

    const queuedDispatch = controlBody.dispatches.find(
      (dispatch) => dispatch.taskId === 'nested-repo-task' && dispatch.status === 'queued'
    );
    expect(queuedDispatch).toBeTruthy();
    expect(queuedDispatch?.delegatedRunId).toBeTruthy();
    expect(queuedDispatch?.details?.repoCwd).toBe(realHintedRepoRoot);
    expect(queuedDispatch?.details?.repoCwd).not.toBe(realSessionWorkspace);
    expect(queuedDispatch?.details?.repoCwd).not.toBe(realAlternateRepoRoot);

    const backlogItemId = String(queuedDispatch?.details?.backlogItemId ?? '');
    expect(backlogItemId.length).toBeGreaterThan(0);

    const backlogItemResponse = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(backlogItemId)}`
    });
    expect(backlogItemResponse.statusCode).toBe(200);
    const backlogItemBody = backlogItemResponse.json() as {
      item: {
        projectId: string | null;
        repoRoot: string | null;
      };
    };
    expect(backlogItemBody.item.projectId).toBe('ugothere-ai');
    expect(backlogItemBody.item.repoRoot).toBe(realHintedRepoRoot);
    expect(backlogItemBody.item.repoRoot).not.toBe(realSessionWorkspace);
    expect(backlogItemBody.item.repoRoot).not.toBe(realAlternateRepoRoot);

    const delegatedRunResponse = await harness.inject({
      method: 'GET',
      url: `/api/runs/${encodeURIComponent(String(queuedDispatch?.delegatedRunId))}`
    });
    expect(delegatedRunResponse.statusCode).toBe(200);
    const delegatedRunBody = delegatedRunResponse.json() as {
      run: {
        sessionId: string;
      };
    };

    const delegatedSessionResponse = await harness.inject({
      method: 'GET',
      url: `/api/sessions/${encodeURIComponent(delegatedRunBody.run.sessionId)}`
    });
    expect(delegatedSessionResponse.statusCode).toBe(200);
    const delegatedSessionBody = delegatedSessionResponse.json() as {
      session: {
        runtimeOverrides: {
          cwd: string | null;
        };
      };
    };
    expect(delegatedSessionBody.session.runtimeOverrides.cwd).toBe(realHintedRepoRoot);
    db.close();
  });

  it('anchors execution-contract repo scoping to a stored linked repo when the contract omits repo hints', async () => {
    const harness = await createHarness('scope-linked-repo');
    const db = harness.createDb();
    seedDefaultAgents(db);

    const session = db.upsertSessionByKey({
      sessionKey: `linked-repo-scope-${Date.now().toString(36)}`,
      channel: 'internal',
      chatType: 'internal',
      agentId: 'ceo-default',
      preferredRuntime: 'process'
    });
    const sessionWorkspace = path.join(String((harness.config.runtime as { workspaceRoot: string }).workspaceRoot), session.id);
    const linkedRepoRoot = path.join(sessionWorkspace, 'ugothere.ai');
    initRepo(sessionWorkspace, 'https://github.com/ElyzeSolutions/ElyzeLabs.git');
    initRepo(linkedRepoRoot, 'https://github.com/ElyzeSolutions/ugothere.ai.git');
    fs.writeFileSync(path.join(sessionWorkspace, 'dashboard-note.md'), 'root workspace noise\n');
    const realLinkedRepoRoot = fs.realpathSync(linkedRepoRoot);
    db.updateSessionMetadata({
      sessionId: session.id,
      metadata: {
        linkedRepoRoot: realLinkedRepoRoot,
        linkedProjectId: 'ugothere-ai'
      }
    });

    const run = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      requestedRuntime: 'process',
      effectiveRuntime: 'process',
      triggerSource: 'dashboard',
      prompt: 'Dispatch execution contract inside the linked repo.',
      status: 'completed'
    });

    db.upsertExecutionContract({
      runId: run.id,
      sessionId: session.id,
      source: 'execution_contract_manual',
      status: 'parsed',
      contract: {
        schema: 'ops.execution-contract.v1',
        intakeDecision: {
          schema: 'ops.intake-decision.v1',
          version: 1,
          action: 'plan_backlog',
          backlog: {
            required: true,
            title: 'Add a contact page',
            description: 'Track repository delivery in the already linked workspace.',
            priority: 88
          },
          targetAgentId: 'software-engineer',
          requiredSkills: [],
          requiredTools: ['git'],
          missingCapabilities: [],
          rationale: {
            summary: 'The session already remembers which repo owns this task.',
            confidence: 0.88,
            notes: []
          }
        },
        backlog: {
          required: true,
          title: 'Add a contact page',
          description: 'Track repository delivery in the already linked workspace.',
          priority: 88
        },
        tasks: [
          {
            taskId: 'linked-repo-task',
            title: 'Implement contact page inside the linked repo',
            action: 'dispatch_subrun',
            targetAgentId: 'software-engineer',
            runtime: 'codex',
            prompt: 'Implement the requested contact page and validate it.'
          }
        ]
      }
    });

    const control = await harness.inject({
      method: 'POST',
      url: `/api/runs/${run.id}/control-actions`,
      payload: {
        action: 'dispatch_subrun',
        actor: 'integration-test'
      }
    });
    expect(control.statusCode).toBe(200);
    const controlBody = control.json() as {
      dispatches: Array<{
        taskId: string;
        status: string;
        delegatedRunId: string | null;
        details?: Record<string, unknown>;
      }>;
    };
    const queuedDispatch = controlBody.dispatches.find(
      (dispatch) => dispatch.taskId === 'linked-repo-task' && dispatch.status === 'queued'
    );
    expect(queuedDispatch).toBeTruthy();
    expect(queuedDispatch?.details?.repoCwd).toBe(realLinkedRepoRoot);
    expect(queuedDispatch?.details?.repoCwd).not.toBe(fs.realpathSync(sessionWorkspace));

    const backlogItemId = String(queuedDispatch?.details?.backlogItemId ?? '');
    expect(backlogItemId.length).toBeGreaterThan(0);

    const backlogItemResponse = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${encodeURIComponent(backlogItemId)}`
    });
    expect(backlogItemResponse.statusCode).toBe(200);
    const backlogItemBody = backlogItemResponse.json() as {
      item: {
        projectId: string | null;
        repoRoot: string | null;
        scope: {
          scopeSource: string;
        };
      };
    };
    expect(backlogItemBody.item.projectId).toBe('ugothere-ai');
    expect(backlogItemBody.item.repoRoot).toBe(realLinkedRepoRoot);
    expect(backlogItemBody.item.scope.scopeSource).toBe('explicit_contract');
    db.close();
  });

  it('defers broad execution-contract dispatches to synced project backlog tasks for the same repo wave', async () => {
    const harness = await createHarness('scope-project-backlog-deferral');
    const db = harness.createDb();
    seedDefaultAgents(db);

    const repoRoot = path.join(harness.root, `project-backlog-deferral-${Date.now().toString(36)}`);
    const agentsDir = path.join(repoRoot, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'PLAN.md'), '# plan\n');
    fs.writeFileSync(path.join(agentsDir, 'PRD.md'), '# prd\n');

    const session = db.upsertSessionByKey({
      sessionKey: `contract-deferral-${Date.now().toString(36)}`,
      channel: 'internal',
      chatType: 'internal',
      agentId: 'ceo-default',
      preferredRuntime: 'process',
      metadata: {
        linkedProjectId: 'ugothere-ai',
        linkedRepoRoot: repoRoot
      }
    });

    const plannedItem = db.createBacklogItem({
      title: 'T-001 · Confirm the active frontend route and shared navigation surface.',
      description: 'Seed synced project backlog item.',
      state: 'planned',
      priority: 70,
      source: 'project_intake',
      sourceRef: path.join(agentsDir, 'PLAN.md'),
      createdBy: 'ceo-autonomous-p4rd',
      projectId: 'ugothere-ai',
      repoRoot,
      linkedSessionId: session.id,
      assignedAgentId: 'software-engineer',
      metadata: {
        projectIntake: {
          planTaskId: 'T-001',
          category: 'setup',
          passes: false,
          dependsOnTaskIds: [],
          sourcePlanPath: path.join(agentsDir, 'PLAN.md'),
          sourcePrdPath: path.join(agentsDir, 'PRD.md'),
          projectId: 'ugothere-ai',
          repoRoot,
          syncedBy: 'test'
        }
      }
    });

    const run = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      requestedRuntime: 'process',
      effectiveRuntime: 'process',
      triggerSource: 'dashboard',
      prompt: 'Dispatch broad implementation contract after planning.',
      status: 'completed'
    });

    db.upsertExecutionContract({
      runId: run.id,
      sessionId: session.id,
      source: 'execution_contract_manual',
      status: 'parsed',
      contract: {
        schema: 'ops.execution-contract.v1',
        intakeDecision: {
          schema: 'ops.intake-decision.v1',
          version: 1,
          action: 'plan_backlog',
          backlog: {
            required: true,
            title: 'Clone ugothere.ai and add contact page',
            description: 'Tracked repository delivery should flow through backlog tasks.',
            priority: 70
          },
          targetAgentId: 'software-engineer',
          requiredSkills: ['frontend-design'],
          requiredTools: ['runtime:codex'],
          missingCapabilities: [],
          rationale: {
            summary: 'Project backlog already exists and should remain authoritative.',
            confidence: 0.94,
            notes: ['Do not create a duplicate broad implementation subrun when plan-sync tasks are present.']
          }
        },
        backlog: {
          required: true,
          title: 'Clone ugothere.ai and add contact page',
          description: 'Tracked repository delivery should flow through backlog tasks.',
          priority: 70
        },
        tasks: [
          {
            taskId: 'impl-contact-page',
            title: 'Implement Contact Page',
            action: 'dispatch_subrun',
            targetAgentId: 'software-engineer',
            runtime: 'codex',
            prompt:
              'Review .agents/PRD.md and .agents/PLAN.md. Implement the contact page route, update navigation, and verify the frontend build.'
          }
        ]
      }
    });

    const runsBefore = db.listRuns({ limit: 5000, offset: 0 }).total;

    const control = await harness.inject({
      method: 'POST',
      url: `/api/runs/${run.id}/control-actions`,
      payload: {
        action: 'dispatch_subrun',
        actor: 'integration-test'
      }
    });
    expect(control.statusCode).toBe(200);
    const controlBody = control.json() as {
      contract: {
        status: string;
      };
      summary: {
        queued: number;
        skipped: number;
        blocked: number;
        failed: number;
      };
      dispatches: Array<{
        taskId: string;
        status: string;
        reason: string;
        details?: Record<string, unknown>;
      }>;
    };
    expect(controlBody.contract.status).toBe('completed');
    expect(controlBody.summary.queued).toBe(0);
    expect(controlBody.summary.skipped).toBe(1);
    expect(controlBody.summary.blocked).toBe(0);
    expect(controlBody.summary.failed).toBe(0);
    const deferredDispatch = controlBody.dispatches.find((dispatch) => dispatch.taskId === 'impl-contact-page');
    expect(deferredDispatch).toBeTruthy();
    expect(deferredDispatch?.status).toBe('skipped');
    expect(deferredDispatch?.reason).toBe('deferred_to_project_backlog');
    expect(Array.isArray(deferredDispatch?.details?.linkedProjectBacklogItemIds)).toBe(true);
    expect((deferredDispatch?.details?.linkedProjectBacklogItemIds as string[] | undefined) ?? []).toContain(plannedItem.id);
    expect(Array.isArray(deferredDispatch?.details?.linkedPlanTaskIds)).toBe(true);
    expect((deferredDispatch?.details?.linkedPlanTaskIds as string[] | undefined) ?? []).toContain('T-001');

    const runsAfter = db.listRuns({ limit: 5000, offset: 0 }).total;
    expect(runsAfter).toBe(runsBefore);

    const backlogItems = db.listBacklogItems({
      projectId: 'ugothere-ai',
      repoRoot,
      limit: 50
    }).rows;
    expect(backlogItems.some((item) => item.source === 'execution_contract' && item.sourceRef === run.id)).toBe(false);
    db.close();
  });

  it('recovers p4rd execute-command aliases by syncing backlog instead of blocking missing capability', async () => {
    const harness = await createHarness('scope-p4rd-direct-skill-alias');
    const db = harness.createDb();
    seedDefaultAgents(db);

    const skillDir = path.join(harness.root, '.ops', 'skills', 'p4rd');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: p4rd',
        'description: Project planning skill for tracked repository delivery.',
        '---',
        '',
        '# p4rd',
        '',
        'Synchronize PRD and PLAN artifacts for tracked delivery.'
      ].join('\n')
    );
    const reloadSkills = await harness.inject({
      method: 'POST',
      url: '/api/skills/reload'
    });
    expect(reloadSkills.statusCode).toBe(200);

    const repoRoot = path.join(harness.root, `p4rd-skill-alias-${Date.now().toString(36)}`);
    initRepo(repoRoot, 'https://github.com/ElyzeSolutions/ugothere.ai.git');
    const agentsDir = path.join(repoRoot, '.agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'PRD.md'), '# PRD\n\nAdd a contact page.\n');
    fs.writeFileSync(
      path.join(agentsDir, 'PLAN.md'),
      [
        '```json',
        JSON.stringify(
          [
            {
              id: 'T-001',
              category: 'feature',
              description: 'Add the public contact page and navigation entry.',
              depends_on: [],
              steps: ['Create the route', 'Link it from navigation'],
              criteria: ['Example: contact page is reachable from navigation', 'Negative: unknown routes still 404'],
              passes: false
            }
          ],
          null,
          2
        ),
        '```'
      ].join('\n')
    );

    const session = db.upsertSessionByKey({
      sessionKey: `p4rd-skill-alias-${Date.now().toString(36)}`,
      channel: 'telegram',
      chatType: 'private',
      agentId: 'ceo-default',
      preferredRuntime: 'process',
      metadata: {
        linkedProjectId: 'ugothere-ai',
        linkedRepoRoot: repoRoot,
        telegramChatId: '999001',
        telegramSenderId: '999001'
      }
    });

    const run = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      requestedRuntime: 'process',
      effectiveRuntime: 'process',
      triggerSource: 'telegram',
      prompt: 'Clone ugothere.ai and add a contact page with navigation entry and basic test coverage.',
      status: 'completed'
    });

    db.upsertExecutionContract({
      runId: run.id,
      sessionId: session.id,
      source: 'execution_contract_manual',
      status: 'parsed',
      contract: {
        schema: 'ops.execution-contract.v1',
        intakeDecision: {
          schema: 'ops.intake-decision.v1',
          version: 1,
          action: 'direct_execute',
          backlog: {
            required: false,
            title: null,
            description: null,
            priority: null
          },
          targetAgentId: null,
          requiredSkills: [],
          requiredTools: [],
          missingCapabilities: [],
          rationale: {
            summary: 'native_execute_command_tool',
            confidence: 1,
            notes: ['Derived from native execute_command tool events.']
          }
        },
        tasks: [
          {
            taskId: 'native-execute-command-1',
            title: 'Execute command',
            action: 'execute_command',
            prompt: 'Start tracked repository delivery process by synchronizing the plan and creating/updating backlog items before delegation.',
            command: {
              argv: [
                'p4rd',
                'sync',
                'backlog',
                '--title',
                'Add contact page and basic test coverage to ugothere.ai',
                '--description',
                'Implement a new Contact page, add a navigation entry, and include basic test coverage.',
                '--priority',
                '70'
              ],
              envProfile: 'inherit',
              riskClass: 'low',
              requiresApproval: false,
              approved: false
            }
          }
        ],
        backlog: null
      }
    });

    const controlResponse = await harness.inject({
      method: 'POST',
      url: `/api/runs/${run.id}/control-actions`,
      payload: {
        action: 'execute_command',
        actor: 'test'
      }
    });
    expect(controlResponse.statusCode).toBe(200);
    const controlBody = controlResponse.json() as {
      dispatches: Array<{
        taskId: string;
        status: string;
        reason: string;
        details?: {
          execution?: {
            stdout?: string;
          };
          directSkillAlias?: {
            name?: string;
          };
        };
      }>;
    };
    const dispatch = controlBody.dispatches.find((entry) => entry.taskId === 'native-execute-command-1');
    if (dispatch?.status !== 'completed') {
      throw new Error(
        JSON.stringify(
          {
            counterExists: fs.existsSync(counterPath),
            counterValue: fs.existsSync(counterPath) ? fs.readFileSync(counterPath, 'utf8') : null,
            runs: db.listRuns({ limit: 20, offset: 0 }).rows.map((entry) => ({
              id: entry.id,
              status: entry.status,
              triggerSource: entry.triggerSource,
              error: entry.error,
              resultSummary: entry.resultSummary
            })),
            controlBody
          },
          null,
          2
        )
      );
    }
    expect(dispatch?.reason).toBe('direct_skill_alias_executed');
    expect(dispatch?.details?.directSkillAlias?.name).toBe('p4rd');
    expect(dispatch?.details?.execution?.stdout).toContain('p4rd backlog sync completed');

    const backlogItems = db.listBacklogItems({
      projectId: 'ugothere-ai',
      repoRoot,
      limit: 20
    }).rows;
    expect(backlogItems).toHaveLength(1);
    expect(backlogItems[0]?.projectId).toBe('ugothere-ai');
    expect(backlogItems[0]?.repoRoot).toBe(repoRoot);
    expect(backlogItems[0]?.source).toBe('project_intake');
    expect(backlogItems[0]?.createdBy).toBe('ceo-autonomous-p4rd');
    expect(backlogItems[0]?.title).toContain('T-001');
    db.close();
  });

  it('regenerates invalid syncable project-intake plans before p4rd backlog sync dispatch', async () => {
    const counterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-p4rd-regenerate-'));
    const counterPath = path.join(counterDir, 'attempt-counter.txt');
    const scriptPath = path.join(counterDir, 'project-intake-regenerate-runner.mjs');
    fs.writeFileSync(
      scriptPath,
      [
        "import fs from 'node:fs';",
        'const prompt = await new Promise((resolve) => {',
        "  let data = '';",
        "  process.stdin.setEncoding('utf8');",
        "  process.stdin.on('data', (chunk) => { data += chunk; });",
        "  process.stdin.on('end', () => resolve(data));",
        '});',
        `const counterPath = ${JSON.stringify(counterPath)};`,
        "const current = Number(fs.existsSync(counterPath) ? fs.readFileSync(counterPath, 'utf8') : '0') || 0;",
        "fs.writeFileSync(counterPath, String(current + 1));",
        "const planMatch = prompt.match(/Update PLAN at: (.+)/);",
        "const prdMatch = prompt.match(/Update PRD at: (.+)/);",
        'if (planMatch && prdMatch) {',
        '  const planPath = planMatch[1].trim();',
        '  const prdPath = prdMatch[1].trim();',
        "  fs.writeFileSync(prdPath, '# Regenerated PRD\\n\\nContact page delivery.\\n');",
        "  const tasks = [",
        "    { id: 'T-101', category: 'feature', description: 'Implement the public contact page and wire it into the primary navigation.', depends_on: [], steps: ['Create the contact route', 'Add the main navigation entry', 'Keep contact copy honest and explicit'], criteria: ['Example: the contact page is reachable from the primary navigation', 'Negative: unknown routes still 404 and fake submission flows stay absent'], passes: false },",
        "    { id: 'T-102', category: 'testing', description: 'Validate contact-page rendering and navigation reachability.', depends_on: ['T-101'], steps: ['Run the narrow frontend verification command'], criteria: ['Example: verification covers the route and navigation path', 'Negative: unrelated workspace installs are not introduced'], passes: false }",
        '  ];',
        "  fs.writeFileSync(planPath, ['# Regenerated Plan', '', '```json', JSON.stringify(tasks, null, 2), '```', ''].join('\\n'));",
        '}',
        "process.stdout.write('project intake regenerated');"
      ].join('\n')
    );

    const harness = await createGatewayTestHarness(
      `scope-p4rd-regenerate-invalid-syncable-plan-${Date.now().toString(36)}`,
      (config) => {
        config.runtime.adapters.codex = {
          command: 'node',
          args: [scriptPath]
        };
      }
    );
    const db = harness.createDb();
    try {
      seedDefaultAgents(db);
      await enableCodexHarness(harness);

      const repoRoot = path.join(harness.root, `p4rd-regenerate-invalid-plan-${Date.now().toString(36)}`);
      initRepo(repoRoot, 'https://github.com/ElyzeSolutions/ugothere.ai.git');
      const agentsDir = path.join(repoRoot, '.agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'PRD.md'), '# PRD\n\nAdd a contact page.\n');
      fs.writeFileSync(
        path.join(agentsDir, 'PLAN.md'),
        [
          '```json',
          JSON.stringify(
            [
              {
                id: 'T-001',
                category: 'setup',
                description: 'Confirm frontend route, navigation, and test surfaces.',
                depends_on: [],
                steps: ['Inspect the top-level docs and route entry points', 'Identify the current navigation surface'],
                criteria: ['Example: target route and nav files are identified', 'Negative: avoid broad repo exploration'],
                passes: false
              },
              {
                id: 'T-002',
                category: 'feature',
                description: 'Implement the contact page and wire it into primary navigation.',
                depends_on: ['T-001'],
                steps: ['Add the route', 'Update navigation'],
                criteria: ['Example: contact page is reachable from navigation', 'Negative: unknown routes still 404'],
                passes: false
              }
            ],
            null,
            2
          ),
          '```'
        ].join('\n')
      );

      const session = db.upsertSessionByKey({
        sessionKey: `p4rd-regenerate-invalid-plan-${Date.now().toString(36)}`,
        channel: 'telegram',
        chatType: 'private',
        agentId: 'ceo-default',
        preferredRuntime: 'process',
        metadata: {
          linkedProjectId: 'ugothere-ai',
          linkedRepoRoot: repoRoot,
          telegramChatId: '999002',
          telegramSenderId: '999002'
        }
      });

      const run = db.createRun({
        sessionId: session.id,
        runtime: 'process',
        requestedRuntime: 'process',
        effectiveRuntime: 'process',
        triggerSource: 'telegram',
        prompt: 'Clone ugothere.ai and add a contact page with navigation entry and basic test coverage.',
        status: 'completed'
      });

      db.upsertExecutionContract({
        runId: run.id,
        sessionId: session.id,
        source: 'execution_contract_manual',
        status: 'parsed',
        contract: {
          schema: 'ops.execution-contract.v1',
          intakeDecision: {
            schema: 'ops.intake-decision.v1',
            version: 1,
            action: 'direct_execute',
            backlog: {
              required: false,
              title: null,
              description: null,
              priority: null
            },
            targetAgentId: null,
            requiredSkills: [],
            requiredTools: [],
            missingCapabilities: [],
            rationale: {
              summary: 'native_execute_command_tool',
              confidence: 1,
              notes: ['Derived from native execute_command tool events.']
            }
          },
          tasks: [
            {
              taskId: 'native-execute-command-1',
              title: 'Execute command',
              action: 'execute_command',
              prompt:
                'Start tracked repository delivery process by synchronizing the plan and creating/updating backlog items before delegation.',
              command: {
                argv: [
                  'p4rd',
                  'sync',
                  'backlog',
                  '--title',
                  'Add contact page and basic test coverage to ugothere.ai',
                  '--description',
                  'Implement a new Contact page, add a navigation entry, and include basic test coverage.',
                  '--priority',
                  '70'
                ],
                envProfile: 'inherit',
                riskClass: 'low',
                requiresApproval: false,
                approved: false
              }
            }
          ],
          backlog: null
        }
      });

      const controlResponse = await harness.inject({
        method: 'POST',
        url: `/api/runs/${run.id}/control-actions`,
        payload: {
          action: 'execute_command',
          actor: 'test'
        }
      });
      expect(controlResponse.statusCode).toBe(200);
      const controlBody = controlResponse.json() as {
        dispatches: Array<{
          taskId: string;
          status: string;
          reason: string;
          details?: {
            execution?: {
              stdout?: string;
            };
            directSkillAlias?: {
              name?: string;
            };
          };
        }>;
      };
      const dispatch = controlBody.dispatches.find((entry) => entry.taskId === 'native-execute-command-1');
      expect(dispatch?.status).toBe('completed');
      expect(dispatch?.reason).toBe('direct_skill_alias_executed');
      expect(dispatch?.details?.directSkillAlias?.name).toBe('p4rd');
      expect(dispatch?.details?.execution?.stdout).toContain('p4rd backlog sync completed');
      expect(fs.readFileSync(counterPath, 'utf8').trim()).toBe('1');

      const backlogItems = db.listBacklogItems({
        projectId: 'ugothere-ai',
        repoRoot,
        limit: 20
      }).rows;
      expect(backlogItems).toHaveLength(2);
      expect(backlogItems.map((item) => item.title).sort()).toEqual([
        'T-101 · Implement the public contact page and wire it into the primary navigation.',
        'T-102 · Validate contact-page rendering and navigation reachability.'
      ]);
      expect(backlogItems.some((item) => item.title.includes('Confirm frontend route'))).toBe(false);
    } finally {
      db.close();
      await harness.close();
    }
  }, 20_000);
});
