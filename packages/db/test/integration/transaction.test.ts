import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '../../src/index.ts';

describe('database transactions', () => {
  it('commits session and run atomically', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-db-'));
    const dbPath = path.join(directory, 'state.db');
    const db = new ControlPlaneDatabase(dbPath);
    db.migrate();

    db.transaction((store) => {
      const session = store.upsertSessionByKey({
        sessionKey: 'telegram:peer:user1:bot',
        channel: 'telegram',
        chatType: 'direct',
        agentId: 'codex'
      });

      store.createRun({
        sessionId: session.id,
        runtime: 'codex',
        prompt: 'hello',
        status: 'queued'
      });
    });

    const sessions = db.listSessions({ limit: 10, offset: 0 }).rows;
    const runs = db.listRuns({ limit: 10, offset: 0 }).rows;

    expect(sessions).toHaveLength(1);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.sessionId).toEqual(sessions[0]?.id);

    db.close();
  });

  it('stores and updates agent profiles for delegation workflows', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-db-'));
    const dbPath = path.join(directory, 'state.db');
    const db = new ControlPlaneDatabase(dbPath);
    db.migrate();

    const profile = db.upsertAgentProfile({
      id: 'software-engineer',
      name: 'Software Engineer',
      title: 'Senior Software Engineer',
      systemPrompt: 'Implement reliable features quickly.',
      defaultRuntime: 'codex',
      defaultModel: 'default',
      allowedRuntimes: ['codex', 'process'],
      skills: ['implementation', 'testing'],
      tools: ['runtime:codex', 'git'],
      metadata: {
        department: 'engineering'
      }
    });

    expect(profile.id).toBe('software-engineer');
    expect(profile.enabled).toBe(true);

    const listed = db.listAgentProfiles();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe('Software Engineer');

    const disabled = db.setAgentProfileEnabled(profile.id, false);
    expect(disabled?.enabled).toBe(false);
    expect(db.listAgentProfiles()).toHaveLength(0);
    expect(db.listAgentProfiles(true)).toHaveLength(1);

    db.close();
  });

  it('clears run error/result when updateRunStatus is called with explicit nulls', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-db-'));
    const dbPath = path.join(directory, 'state.db');
    const db = new ControlPlaneDatabase(dbPath);
    db.migrate();

    const session = db.upsertSessionByKey({
      sessionKey: 'internal:run-status:clear-null',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'codex'
    });

    const run = db.createRun({
      sessionId: session.id,
      runtime: 'codex',
      prompt: 'debug stale run',
      status: 'running'
    });

    db.updateRunStatus({
      runId: run.id,
      status: 'failed',
      error: 'provider overload',
      resultSummary: 'first summary'
    });

    const reopened = db.updateRunStatus({
      runId: run.id,
      status: 'running',
      error: null,
      resultSummary: null
    });

    expect(reopened.status).toBe('running');
    expect(reopened.error).toBeNull();
    expect(reopened.resultSummary).toBeNull();

    db.close();
  });

  it('enforces backlog transition legality and dependency gating for done state', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-db-'));
    const dbPath = path.join(directory, 'state.db');
    const db = new ControlPlaneDatabase(dbPath);
    db.migrate();

    const dependency = db.createBacklogItem({
      title: 'Dependency card',
      state: 'planned',
      createdBy: 'test'
    });
    const primary = db.createBacklogItem({
      title: 'Primary card',
      state: 'planned',
      createdBy: 'test'
    });

    db.setBacklogDependencies(primary.id, [dependency.id]);

    db.transitionBacklogItem({
      itemId: primary.id,
      toState: 'in_progress',
      actor: 'test',
      reason: 'work start'
    });
    db.transitionBacklogItem({
      itemId: primary.id,
      toState: 'review',
      actor: 'test',
      reason: 'work reviewed'
    });

    expect(() =>
      db.transitionBacklogItem({
        itemId: primary.id,
        toState: 'done',
        actor: 'test',
        reason: 'attempt complete too early'
      })
    ).toThrow(/dependencies are unresolved/i);

    db.transitionBacklogItem({
      itemId: dependency.id,
      toState: 'in_progress',
      actor: 'test',
      reason: 'work start'
    });
    db.transitionBacklogItem({
      itemId: dependency.id,
      toState: 'review',
      actor: 'test',
      reason: 'work reviewed'
    });
    db.transitionBacklogItem({
      itemId: dependency.id,
      toState: 'done',
      actor: 'test',
      reason: 'work complete'
    });

    db.transitionBacklogItem({
      itemId: primary.id,
      toState: 'in_progress',
      actor: 'test',
      reason: 'resume after dependency completion'
    });
    db.transitionBacklogItem({
      itemId: primary.id,
      toState: 'review',
      actor: 'test',
      reason: 'review after dependency completion'
    });
    const done = db.transitionBacklogItem({
      itemId: primary.id,
      toState: 'done',
      actor: 'test',
      reason: 'dependencies resolved'
    });

    expect(done.state).toBe('done');
    expect(db.listBacklogTransitions(primary.id).length).toBeGreaterThanOrEqual(4);

    db.close();
  });

  it('keeps backlog orchestration reads side-effect free until explicitly ensured', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-db-'));
    const dbPath = path.join(directory, 'state.db');
    const db = new ControlPlaneDatabase(dbPath);
    db.migrate();

    expect(db.getBacklogOrchestrationControl()).toBeNull();

    const created = db.ensureBacklogOrchestrationControl();

    expect(created.enabled).toBe(true);
    expect(db.getBacklogOrchestrationControl()).toMatchObject({
      id: created.id,
      paused: true
    });

    db.close();
  });

  it('persists memory embeddings with checksum dedupe lookup', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-db-'));
    const dbPath = path.join(directory, 'state.db');
    const db = new ControlPlaneDatabase(dbPath);
    db.migrate();

    const memory = db.insertMemory({
      agentId: 'memory-agent',
      source: 'structured',
      content: 'Persistent memory embedding record',
      embeddingRef: 'checksum-1'
    });
    db.upsertMemoryEmbedding({
      memoryItemId: memory.id,
      checksum: 'checksum-1',
      provider: 'voyage',
      model: 'voyage-3-lite',
      dimension: 3,
      vector: [0.2, 0.4, 0.6],
      status: 'ready',
      attempts: 1
    });

    const fetched = db.getMemoryEmbeddingByMemoryItemId(memory.id);
    expect(fetched?.status).toBe('ready');
    expect(fetched?.dimension).toBe(3);

    const deduped = db.findMemoryEmbeddingByChecksum({
      checksum: 'checksum-1',
      provider: 'voyage',
      model: 'voyage-3-lite'
    });
    expect(deduped?.memoryItemId).toBe(memory.id);
    expect(db.listMemoryEmbeddingsForAgent({ agentId: 'memory-agent', statuses: ['ready'] })).toHaveLength(1);

    db.close();
  });

  it('demotes stale waiting_input runs and prunes expired terminal artifacts during housekeeping', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-db-'));
    const dbPath = path.join(directory, 'state.db');
    const db = new ControlPlaneDatabase(dbPath);
    db.migrate();

    const session = db.upsertSessionByKey({
      sessionKey: 'telegram:peer:housekeeping:test',
      channel: 'telegram',
      chatType: 'direct',
      agentId: 'codex'
    });
    const waitingRun = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      prompt: 'needs approval',
      status: 'waiting_input'
    });

    const completedRun = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      prompt: 'done run',
      status: 'completed'
    });
    db.upsertRunTerminalSession({
      runId: completedRun.id,
      sessionId: session.id,
      runtime: 'process',
      mode: 'tmux',
      status: 'active',
      metadata: {
        test: true
      }
    });
    db.appendRunTerminalChunk({
      runId: completedRun.id,
      sessionId: session.id,
      chunk: 'terminal output chunk'
    });
    db.closeRunTerminalSession(completedRun.id, 'completed', '2000-01-01T00:00:00.000Z');

    const result = db.runHousekeepingPrune({
      sessionRetentionCutoffs: {
        delegate: '1970-01-01T00:00:00.000Z',
        dashboard: '1970-01-01T00:00:00.000Z',
        agent: '1970-01-01T00:00:00.000Z',
        internal: '1970-01-01T00:00:00.000Z',
        telegram: '1970-01-01T00:00:00.000Z',
        office: '1970-01-01T00:00:00.000Z',
        unknown: '1970-01-01T00:00:00.000Z'
      },
      protectedSessionKeys: [],
      runRetentionCutoff: '1970-01-01T00:00:00.000Z',
      terminalRetentionCutoff: new Date().toISOString(),
      waitingInputStaleCutoff: new Date(Date.now() + 5 * 60_000).toISOString(),
      messageRetentionCutoff: '1970-01-01T00:00:00.000Z',
      realtimeRetentionCutoff: '1970-01-01T00:00:00.000Z',
      officePresenceRetentionCutoff: '1970-01-01T00:00:00.000Z',
      llmUsageRetentionDayCutoff: '1970-01-01',
      memoryRetentionCutoff: '1970-01-01T00:00:00.000Z',
      auditRetentionCutoff: '1970-01-01T00:00:00.000Z'
    });

    expect(result.staleWaitingRunsDemoted).toBe(1);
    expect(result.terminalSessionsPrunedByAge).toBe(1);
    expect(result.terminalChunksPrunedByAge).toBe(1);

    const demoted = db.getRunById(waitingRun.id);
    expect(demoted?.status).toBe('failed');
    expect(demoted?.error).toBe('waiting_input_stale_timeout');
    expect(db.getRunTerminalSession(completedRun.id)).toBeUndefined();
    expect(db.listRunTerminalChunks(completedRun.id, 0, 50)).toHaveLength(0);

    db.close();
  });

  it('stores prompt assembly snapshots and dedupes continuity signals while open', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-db-'));
    const dbPath = path.join(directory, 'state.db');
    const db = new ControlPlaneDatabase(dbPath);
    db.migrate();

    const session = db.upsertSessionByKey({
      sessionKey: 'internal:continuity:test',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'codex'
    });
    const run = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      prompt: 'prompt assembly persistence',
      status: 'queued'
    });

    db.upsertPromptAssemblySnapshot({
      runId: run.id,
      sessionId: session.id,
      contextLimit: 4096,
      totalEstimatedTokens: 3850,
      overflowStrategy: 'shrink',
      overflowed: false,
      continuityCoverage: {
        transcriptMessagesSelected: 4
      },
      segments: [
        {
          id: 'task',
          estimatedTokens: 1400,
          budgetTokens: 1600,
          included: true,
          droppedReason: null
        }
      ],
      droppedSegments: [],
      promptPreview: 'CURRENT_TASK:\nFinish implementation.'
    });

    const snapshot = db.getPromptAssemblySnapshot(run.id);
    expect(snapshot).toBeTruthy();
    expect(snapshot?.contextLimit).toBe(4096);
    expect(snapshot?.overflowed).toBe(false);

    const first = db.appendContinuitySignal({
      runId: run.id,
      sessionId: session.id,
      severity: 'high',
      source: 'runtime_adapter',
      code: 'context_overflow_runtime',
      summary: 'Overflow on first attempt',
      details: { attempt: 1 },
      dedupeKey: 'continuity:overflow:test'
    });
    const second = db.appendContinuitySignal({
      runId: run.id,
      sessionId: session.id,
      severity: 'high',
      source: 'runtime_adapter',
      code: 'context_overflow_runtime',
      summary: 'Overflow on repeated attempt',
      details: { attempt: 2 },
      dedupeKey: 'continuity:overflow:test'
    });

    expect(second.id).toBe(first.id);
    expect(second.summary).toContain('repeated');
    expect(db.listContinuitySignals(10)).toHaveLength(1);

    const resolved = db.updateContinuitySignalStatus(first.id, 'resolved');
    expect(resolved?.status).toBe('resolved');

    const afterResolve = db.appendContinuitySignal({
      runId: run.id,
      sessionId: session.id,
      severity: 'medium',
      source: 'operator_feedback',
      code: 'context_overflow_runtime',
      summary: 'New occurrence after resolution',
      details: { attempt: 3 },
      dedupeKey: 'continuity:overflow:test'
    });
    expect(afterResolve.id).not.toBe(first.id);
    expect(db.listContinuitySignals(10)).toHaveLength(2);

    db.close();
  });
});
