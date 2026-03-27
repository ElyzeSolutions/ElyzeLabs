import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { MemoryService, NoopEmbeddingProvider } from '../../src/index.ts';

describe('memory service', () => {
  it('writes workspace markdown and structured row while keeping missing-file reads graceful', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-memory-'));
    const workspacePath = path.join(root, 'workspace');
    fs.mkdirSync(workspacePath, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();

    const service = new MemoryService(db, {
      workspaceMemoryFile: 'MEMORY.md',
      dailyMemoryDir: '.ops/memory-daily',
      retentionDays: 30,
      writeStructured: true,
      provider: new NoopEmbeddingProvider()
    });

    const before = await service.readWorkspaceMemory(workspacePath);
    expect(before).toEqual('');

    await service.remember({
      workspacePath,
      agentId: 'codex',
      content: 'remember this detail',
      tags: ['critical']
    });

    const after = await service.readWorkspaceMemory(workspacePath);
    expect(after).toContain('remember this detail');

    const results = await service.search({
      agentId: 'codex',
      query: 'detail',
      limit: 3
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.combinedScore).toBeGreaterThanOrEqual(0);

    const session = db.upsertSessionByKey({
      sessionKey: 'memory:trajectory:test',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'codex'
    });
    const run = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      prompt: 'trajectory test run',
      status: 'completed'
    });

    db.appendTrajectoryEvent({
      sessionId: session.id,
      runId: run.id,
      chapter: 'execution',
      eventType: 'run.running',
      actor: 'agent',
      content: 'Planner selected remediation strategy.',
      significance: 7,
      sourceKind: 'test',
      sourceRef: 'event-1'
    });
    db.appendTrajectoryEvent({
      sessionId: session.id,
      runId: run.id,
      chapter: 'outcome',
      eventType: 'run.completed',
      actor: 'agent',
      content: 'Remediation completed and tests passed.',
      significance: 8,
      sourceKind: 'test',
      sourceRef: 'event-2'
    });

    const compacted = await service.compactTrajectories({
      agentId: 'codex',
      runIds: [run.id]
    });
    expect(compacted.compactedRuns).toBe(1);

    const evaluation = service.evaluateRecall(
      [
        {
          query: 'remediation strategy',
          expectedContains: ['Remediation']
        }
      ],
      'codex'
    );
    expect(evaluation.fixtureCount).toBe(1);
    expect(evaluation.hitRate).toBeGreaterThanOrEqual(0);

    db.close();
  });

  it('persists embeddings and supports auto-remember decisions with policy guards', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-memory-auto-'));
    const workspacePath = path.join(root, 'workspace');
    fs.mkdirSync(workspacePath, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();
    const session = db.upsertSessionByKey({
      sessionKey: 'internal:auto-remember:test',
      channel: 'internal',
      chatType: 'internal',
      agentId: 'coder'
    });
    const run = db.createRun({
      sessionId: session.id,
      runtime: 'process',
      prompt: 'execute rollout',
      status: 'completed'
    });
    db.appendTrajectoryEvent({
      sessionId: session.id,
      runId: run.id,
      chapter: 'outcome',
      eventType: 'run.completed',
      actor: 'agent',
      content: 'Finished rollout with validated checks.',
      significance: 8,
      sourceKind: 'test',
      sourceRef: 'auto-event-1'
    });

    const service = new MemoryService(db, {
      workspaceMemoryFile: 'MEMORY.md',
      dailyMemoryDir: '.ops/memory-daily',
      retentionDays: 30,
      writeStructured: true,
      provider: {
        name: 'voyage',
        modelName: 'voyage-3-lite',
        embed: async (inputs: string[]) => inputs.map(() => [0.1, 0.2, 0.3])
      },
      autoRemember: {
        enabled: true,
        triggerStatuses: ['completed'],
        minSignificance: 5,
        maxEntryChars: 800,
        dedupeWindowRuns: 8,
        cooldownMinutes: 60,
        includeChannels: [],
        includeAgents: [],
        excludeAgents: []
      }
    });

    await service.remember({
      workspacePath,
      sessionId: session.id,
      agentId: 'coder',
      content: 'Persist embedding row'
    });

    const structured = db.listMemoryItemsByAgent('coder', 20);
    const embeddingRows = db.listMemoryEmbeddingsForAgent({
      agentId: 'coder',
      statuses: ['ready']
    });
    expect(structured.length).toBeGreaterThan(0);
    expect(embeddingRows.length).toBeGreaterThan(0);

    const decision = await service.autoRememberRun({
      workspacePath,
      sessionId: session.id,
      agentId: 'coder',
      channel: 'internal',
      runId: run.id,
      status: 'completed',
      runtime: 'process',
      model: null,
      summary: 'Deployment checks all green.'
    });
    expect(decision.written).toBe(true);

    const duplicate = await service.autoRememberRun({
      workspacePath,
      sessionId: session.id,
      agentId: 'coder',
      channel: 'internal',
      runId: run.id,
      status: 'completed',
      runtime: 'process',
      model: null,
      summary: 'Deployment checks all green.'
    });
    expect(duplicate.reason).toBe('duplicate');

    db.close();
  });

  it('uses persisted vectors from sqlite and ranks semantic matches above lexical ties', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-memory-vector-'));
    const workspacePath = path.join(root, 'workspace');
    fs.mkdirSync(workspacePath, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();

    const telemetry: Array<{ category: string; status: string }> = [];
    const provider = {
      name: 'voyage' as const,
      modelName: 'voyage-3-lite',
      embed: async (inputs: string[]) =>
        inputs.map((value) => {
          const lower = value.toLowerCase();
          if (lower.includes('apple')) {
            return [1, 0];
          }
          if (lower.includes('banana')) {
            return [0, 1];
          }
          return [1, 0];
        })
    };

    const service = new MemoryService(db, {
      workspaceMemoryFile: 'MEMORY.md',
      dailyMemoryDir: '.ops/memory-daily',
      retentionDays: 30,
      writeStructured: true,
      provider,
      vectorMode: 'sqlite_exact',
      onTelemetry: (event) => {
        telemetry.push({ category: event.category, status: event.status });
      }
    });

    await service.remember({
      workspacePath,
      agentId: 'semantic-agent',
      content: 'fruit corpus apple anchor'
    });
    await service.remember({
      workspacePath,
      agentId: 'semantic-agent',
      content: 'fruit corpus banana anchor'
    });

    const persistedVectors = db.listMemoryEmbeddingsForAgent({
      agentId: 'semantic-agent',
      statuses: ['ready']
    });
    expect(persistedVectors.length).toBe(2);
    expect(persistedVectors.every((row) => row.embedding.vectorJson && row.embedding.vectorJson.includes('['))).toBe(true);

    const results = await service.search({
      agentId: 'semantic-agent',
      query: 'fruit corpus',
      limit: 2
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.item.content).toContain('apple');
    expect(results[0]?.semanticScore).toBeGreaterThan(results[1]?.semanticScore ?? 0);
    expect(results[0]?.combinedScore).toBeGreaterThan(results[1]?.combinedScore ?? 0);
    expect(telemetry.some((entry) => entry.category === 'retrieval' && entry.status === 'sqlite_exact')).toBe(true);

    db.close();
  });

  it('promotes auto vector mode and rolls back to exact after ANN query failures', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-memory-auto-ann-'));
    const workspacePath = path.join(root, 'workspace');
    fs.mkdirSync(workspacePath, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();

    const providerState = {
      failQueries: false
    };
    const provider = {
      name: 'voyage' as const,
      modelName: 'voyage-3-lite',
      embed: async (inputs: string[]) => {
        if (providerState.failQueries) {
          throw new Error('simulated ann query failure');
        }
        await new Promise((resolve) => setTimeout(resolve, 8));
        return inputs.map((value) => {
          const normalized = value.toLowerCase();
          if (normalized.includes('alpha')) {
            return [1, 0, 0];
          }
          if (normalized.includes('beta')) {
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
        minSamples: 1,
        stabilityWindowSec: 300,
        promoteP95Ms: 1,
        demoteP95Ms: 1,
        minCandidateVolume: 1,
        rollbackErrorThreshold: 1
      }
    });

    await service.remember({
      workspacePath,
      agentId: 'adaptive-agent',
      content: 'alpha routing memory anchor'
    });
    await service.remember({
      workspacePath,
      agentId: 'adaptive-agent',
      content: 'beta fallback memory anchor'
    });

    const firstSearch = await service.search({
      agentId: 'adaptive-agent',
      query: 'alpha routing',
      limit: 2
    });
    expect(firstSearch.length).toBe(2);

    const promoted = service.getEmbeddingBackendStatus();
    expect(promoted.requestedMode).toBe('auto');
    expect(promoted.activeMode).toBe('sqlite_ann');

    providerState.failQueries = true;
    const fallbackSearch = await service.search({
      agentId: 'adaptive-agent',
      query: 'alpha routing',
      limit: 2
    });
    expect(fallbackSearch.length).toBeGreaterThan(0);

    const rolledBack = service.getEmbeddingBackendStatus();
    expect(rolledBack.activeMode).toBe('sqlite_exact');
    expect(rolledBack.fallbackReason).toBe('ann_query_failed');
    expect(rolledBack.retrieval.annErrorStreak).toBe(0);

    db.close();
  });

  it('keeps requested ann mode but degrades active mode when ANN capability is unavailable', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-memory-ann-cap-'));
    const workspacePath = path.join(root, 'workspace');
    fs.mkdirSync(workspacePath, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(root, 'state.db'));
    db.migrate();

    const service = new MemoryService(db, {
      workspaceMemoryFile: 'MEMORY.md',
      dailyMemoryDir: '.ops/memory-daily',
      retentionDays: 30,
      writeStructured: true,
      provider: {
        name: 'voyage',
        modelName: 'voyage-3-lite',
        embed: async (inputs: string[]) => inputs.map(() => [0.2, 0.3, 0.5])
      },
      vectorMode: 'sqlite_ann',
      annAvailable: false
    });

    await service.remember({
      workspacePath,
      agentId: 'ann-capability-agent',
      content: 'embedding row for capability fallback'
    });

    const degraded = service.getEmbeddingBackendStatus();
    expect(degraded.requestedMode).toBe('sqlite_ann');
    expect(degraded.activeMode).toBe('sqlite_exact');
    expect(degraded.fallbackReason).toBe('ann_unavailable');

    service.setAnnCapability(true);
    const recovered = service.getEmbeddingBackendStatus();
    expect(recovered.activeMode).toBe('sqlite_ann');
    expect(recovered.fallbackReason).toBeNull();

    db.close();
  });
});
