import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';
import { MemoryService } from '@ops/memory';

describe('adaptive memory + retention soak simulation', () => {
  it('captures backend switching stability and retention hygiene evidence in one artifact', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-adaptive-soak-'));
    const workspacePath = path.join(root, 'workspace');
    fs.mkdirSync(workspacePath, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();

    const providerState = {
      delayMs: 8,
      fail: false
    };

    const provider = {
      name: 'voyage' as const,
      modelName: 'voyage-3-lite',
      embed: async (inputs: string[]) => {
        if (providerState.fail) {
          throw new Error('simulated ann degradation');
        }
        if (providerState.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, providerState.delayMs));
        }
        return inputs.map((value) => {
          const lower = value.toLowerCase();
          if (lower.includes('alpha')) {
            return [1, 0, 0];
          }
          if (lower.includes('beta')) {
            return [0, 1, 0];
          }
          return [0.5, 0.5, 0];
        });
      }
    };

    const service = new MemoryService(db, {
      workspaceMemoryFile: 'MEMORY.md',
      dailyMemoryDir: '.ops/memory-daily',
      retentionDays: 30,
      writeStructured: true,
      provider,
      vectorMode: 'auto',
      annAvailable: true,
      adaptiveAnn: {
        minSamples: 3,
        stabilityWindowSec: 3_600,
        promoteP95Ms: 2,
        demoteP95Ms: 2,
        minCandidateVolume: 1,
        rollbackErrorThreshold: 2
      }
    });

    for (let index = 0; index < 18; index += 1) {
      await service.remember({
        workspacePath,
        agentId: 'adaptive-soak-agent',
        content: `memory shard ${index} alpha beta continuity ${index % 3}`
      });
    }

    const backendTimeline: Array<{
      phase: string;
      requestedMode: string;
      activeMode: string;
      fallbackReason: string | null;
      annErrorStreak: number;
      sampleCount: number;
    }> = [];
    const captureBackend = (phase: string) => {
      const status = service.getEmbeddingBackendStatus();
      backendTimeline.push({
        phase,
        requestedMode: status.requestedMode,
        activeMode: status.activeMode,
        fallbackReason: status.fallbackReason,
        annErrorStreak: status.retrieval.annErrorStreak,
        sampleCount: status.retrieval.sampleCount
      });
      return status;
    };

    captureBackend('initial');

    for (let index = 0; index < 8; index += 1) {
      await service.search({
        agentId: 'adaptive-soak-agent',
        query: `alpha retrieval pressure ${index}`,
        limit: 6
      });
    }
    const afterPromote = captureBackend('after_promote');
    expect(afterPromote.activeMode).toBe('sqlite_ann');

    service.setAnnCapability(false, 'simulated_ann_capability_loss');
    await service.search({
      agentId: 'adaptive-soak-agent',
      query: 'capability-loss fallback probe',
      limit: 6
    });
    const afterRollback = captureBackend('after_capability_fallback');
    expect(afterRollback.activeMode).toBe('sqlite_exact');
    expect(afterRollback.fallbackReason).toBe('ann_unavailable');

    service.setAnnCapability(true);
    providerState.delayMs = 0;
    await service.search({
      agentId: 'adaptive-soak-agent',
      query: 'post-fallback recovery probe',
      limit: 6
    });
    captureBackend('after_capability_recovery_probe');

    const session = db.upsertSessionByKey({
      sessionKey: 'telegram:peer:adaptive-soak',
      channel: 'telegram',
      chatType: 'direct',
      agentId: 'codex'
    });
    const waitingRun = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      prompt: 'stale waiting input',
      status: 'waiting_input'
    });
    const completedRun = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      prompt: 'completed run for terminal prune',
      status: 'completed'
    });
    db.upsertRunTerminalSession({
      runId: completedRun.id,
      sessionId: session.id,
      runtime: 'process',
      mode: 'tmux',
      status: 'active',
      metadata: {
        simulation: 'adaptive-retention-soak'
      }
    });
    db.appendRunTerminalChunk({
      runId: completedRun.id,
      sessionId: session.id,
      chunk: 'terminal evidence chunk'
    });
    db.closeRunTerminalSession(completedRun.id, 'completed', '2000-01-01T00:00:00.000Z');

    const housekeeping = db.runHousekeepingPrune({
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
      waitingInputStaleCutoff: new Date(Date.now() + 60_000).toISOString(),
      messageRetentionCutoff: '1970-01-01T00:00:00.000Z',
      realtimeRetentionCutoff: '1970-01-01T00:00:00.000Z',
      officePresenceRetentionCutoff: '1970-01-01T00:00:00.000Z',
      llmUsageRetentionDayCutoff: '1970-01-01',
      memoryRetentionCutoff: '1970-01-01T00:00:00.000Z',
      auditRetentionCutoff: '1970-01-01T00:00:00.000Z'
    });

    const demotedWaiting = db.getRunById(waitingRun.id);
    const terminalSessionAfterPrune = db.getRunTerminalSession(completedRun.id);
    const terminalChunksAfterPrune = db.listRunTerminalChunks(completedRun.id, 0, 20);

    expect(housekeeping.staleWaitingRunsDemoted).toBe(1);
    expect(housekeeping.terminalSessionsPrunedByAge).toBe(1);
    expect(housekeeping.terminalChunksPrunedByAge).toBe(1);
    expect(demotedWaiting?.status).toBe('failed');
    expect(demotedWaiting?.error).toBe('waiting_input_stale_timeout');
    expect(terminalSessionAfterPrune).toBeUndefined();
    expect(terminalChunksAfterPrune).toHaveLength(0);

    const reportDir = path.join(root, '.ops', 'simulations', 'adaptive-memory-retention');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'soak-report.json');
    const report = {
      schema: 'ops.adaptive_memory_retention.soak.v1',
      generatedAt: new Date().toISOString(),
      backendTimeline,
      finalBackendStatus: service.getEmbeddingBackendStatus(),
      retentionSummary: housekeeping,
      retentionChecks: {
        waitingRunStatus: demotedWaiting?.status ?? null,
        waitingRunError: demotedWaiting?.error ?? null,
        terminalSessionPruned: terminalSessionAfterPrune === undefined,
        terminalChunksRemaining: terminalChunksAfterPrune.length
      }
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(fs.existsSync(reportPath)).toBe(true);
    expect(report.backendTimeline.some((entry) => entry.activeMode === 'sqlite_ann')).toBe(true);
    expect(report.backendTimeline.some((entry) => entry.fallbackReason === 'ann_unavailable')).toBe(true);
    expect(report.retentionChecks.terminalSessionPruned).toBe(true);

    db.close();
  });
});
