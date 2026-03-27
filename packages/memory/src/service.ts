import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import type { ControlPlaneDatabase } from '@ops/db';
import type { MemoryRecord } from '@ops/shared';
import { parseJsonSafe, utcNow } from '@ops/shared';

import { cosineSimilarity, type EmbeddingProvider, NoopEmbeddingProvider } from './providers.js';

export interface MemoryServiceOptions {
  workspaceMemoryFile: string;
  dailyMemoryDir: string;
  retentionDays: number;
  writeStructured: boolean;
  provider?: EmbeddingProvider;
  vectorMode?: 'sqlite_exact' | 'sqlite_ann' | 'auto';
  annAvailable?: boolean;
  adaptiveAnn?: {
    minSamples: number;
    stabilityWindowSec: number;
    promoteP95Ms: number;
    demoteP95Ms: number;
    minCandidateVolume: number;
    rollbackErrorThreshold: number;
  };
  autoRemember?: {
    enabled: boolean;
    triggerStatuses: Array<'completed' | 'failed' | 'aborted'>;
    minSignificance: number;
    maxEntryChars: number;
    dedupeWindowRuns: number;
    cooldownMinutes: number;
    includeChannels: Array<'telegram' | 'internal'>;
    includeAgents: string[];
    excludeAgents: string[];
  };
  onTelemetry?: (event: {
    category: 'embedding' | 'retrieval' | 'auto_remember';
    status: string;
    details?: Record<string, unknown>;
  }) => void;
}

export interface MemorySearchResult {
  item: MemoryRecord;
  lexicalScore: number;
  semanticScore: number;
  recencyScore: number;
  significanceScore: number;
  combinedScore: number;
  citations: string[];
}

export interface AutoRememberDecision {
  written: boolean;
  reason:
    | 'written'
    | 'disabled'
    | 'status_not_enabled'
    | 'policy_scope'
    | 'below_threshold'
    | 'duplicate'
    | 'cooldown'
    | 'empty'
    | 'remember_failed';
  significance: number;
  entryChars: number;
  rowId?: string;
}

export interface EmbeddingBackendStatus {
  provider: string;
  requestedMode: 'sqlite_exact' | 'sqlite_ann' | 'auto';
  activeMode: 'sqlite_exact' | 'sqlite_ann';
  annAvailable: boolean;
  fallbackReason: string | null;
  checkedAt: string;
  retrieval: {
    sampleCount: number;
    p95Ms: number;
    averageCandidates: number;
    annErrorStreak: number;
    lastSwitchAt: string | null;
    lastSwitchReason: string | null;
  };
}

export class MemoryService {
  private readonly provider: EmbeddingProvider;
  private readonly vectorMode: 'sqlite_exact' | 'sqlite_ann' | 'auto';
  private annAvailable: boolean;
  private readonly onTelemetry?: MemoryServiceOptions['onTelemetry'];
  private readonly autoRememberPolicy: NonNullable<MemoryServiceOptions['autoRemember']>;
  private readonly adaptiveAnnPolicy: Required<NonNullable<MemoryServiceOptions['adaptiveAnn']>>;
  private activeVectorMode: 'sqlite_exact' | 'sqlite_ann' = 'sqlite_exact';
  private fallbackReason: string | null = null;
  private annErrorStreak = 0;
  private retrievalSamples: Array<{ ts: number; ms: number; candidates: number }> = [];
  private lastModeSwitchAt: string | null = null;
  private lastModeSwitchReason: string | null = null;
  private annCheckedAt = utcNow();

  constructor(
    private readonly database: ControlPlaneDatabase,
    private readonly options: MemoryServiceOptions
  ) {
    this.provider = options.provider ?? new NoopEmbeddingProvider();
    this.vectorMode = options.vectorMode ?? 'sqlite_exact';
    this.annAvailable = Boolean(options.annAvailable);
    this.onTelemetry = options.onTelemetry;
    this.adaptiveAnnPolicy = {
      minSamples: options.adaptiveAnn?.minSamples ?? 24,
      stabilityWindowSec: options.adaptiveAnn?.stabilityWindowSec ?? 900,
      promoteP95Ms: options.adaptiveAnn?.promoteP95Ms ?? 140,
      demoteP95Ms: options.adaptiveAnn?.demoteP95Ms ?? 100,
      minCandidateVolume: options.adaptiveAnn?.minCandidateVolume ?? 40,
      rollbackErrorThreshold: options.adaptiveAnn?.rollbackErrorThreshold ?? 2
    };
    this.autoRememberPolicy = {
      enabled: options.autoRemember?.enabled ?? true,
      triggerStatuses: options.autoRemember?.triggerStatuses ?? ['completed'],
      minSignificance: options.autoRemember?.minSignificance ?? 6,
      maxEntryChars: options.autoRemember?.maxEntryChars ?? 2400,
      dedupeWindowRuns: options.autoRemember?.dedupeWindowRuns ?? 8,
      cooldownMinutes: options.autoRemember?.cooldownMinutes ?? 180,
      includeChannels: options.autoRemember?.includeChannels ?? [],
      includeAgents: options.autoRemember?.includeAgents ?? [],
      excludeAgents: options.autoRemember?.excludeAgents ?? []
    };
    this.activeVectorMode = this.resolveRequestedVectorMode();
  }

  setAnnCapability(available: boolean, reason?: string | null): void {
    this.annAvailable = available;
    this.annCheckedAt = utcNow();
    this.fallbackReason = available ? null : reason ?? 'ann_unavailable';
    const nextMode = this.resolveRequestedVectorMode();
    this.applyVectorMode(nextMode, available ? 'ann_probe_ok' : this.fallbackReason ?? 'ann_unavailable');
  }

  getEmbeddingBackendStatus(): EmbeddingBackendStatus {
    this.pruneRetrievalSamples();
    const p95Ms = percentile95(this.retrievalSamples.map((sample) => sample.ms));
    const avgCandidates =
      this.retrievalSamples.length > 0
        ? this.retrievalSamples.reduce((sum, sample) => sum + sample.candidates, 0) / this.retrievalSamples.length
        : 0;
    return {
      provider: this.provider.name,
      requestedMode: this.vectorMode,
      activeMode: this.activeVectorMode,
      annAvailable: this.annAvailable,
      fallbackReason: this.fallbackReason,
      checkedAt: this.annCheckedAt,
      retrieval: {
        sampleCount: this.retrievalSamples.length,
        p95Ms: Number(p95Ms.toFixed(3)),
        averageCandidates: Number(avgCandidates.toFixed(3)),
        annErrorStreak: this.annErrorStreak,
        lastSwitchAt: this.lastModeSwitchAt,
        lastSwitchReason: this.lastModeSwitchReason
      }
    };
  }

  async remember(input: {
    workspacePath: string;
    agentId: string;
    sessionId?: string;
    content: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<{ memoryFilePath: string; dailyFilePath: string; row?: MemoryRecord }> {
    const memoryFilePath = path.join(input.workspacePath, this.options.workspaceMemoryFile);
    const dailyDirectoryPath = path.join(input.workspacePath, this.options.dailyMemoryDir);
    const day = utcNow().slice(0, 10);
    const dailyFilePath = path.join(dailyDirectoryPath, `${day}.md`);

    await fs.mkdir(path.dirname(memoryFilePath), { recursive: true });
    await fs.mkdir(dailyDirectoryPath, { recursive: true });

    const heading = `\n## ${utcNow()}\n`;
    const tagsLabel = input.tags && input.tags.length > 0 ? `\nTags: ${input.tags.join(', ')}` : '';
    const block = `${heading}${input.content.trim()}${tagsLabel}\n`;

    await fs.appendFile(memoryFilePath, block, 'utf8');
    await fs.appendFile(dailyFilePath, block, 'utf8');

    let row: MemoryRecord | undefined;
    if (this.options.writeStructured) {
      row = this.database.insertMemory({
        sessionId: input.sessionId ?? null,
        agentId: input.agentId,
        source: 'structured',
        content: input.content,
        embeddingRef: this.provider.name === 'noop' ? null : this.embeddingRef(input.content),
        importance: input.tags?.includes('critical') ? 10 : 3,
        metadata: {
          tags: input.tags ?? [],
          memoryFilePath,
          dailyFilePath,
          ...(input.metadata ?? {})
        }
      });
      await this.persistEmbedding({
        row,
        content: input.content
      });
    }

    if (row) {
      return {
        memoryFilePath,
        dailyFilePath,
        row
      };
    }

    return {
      memoryFilePath,
      dailyFilePath
    };
  }

  async readWorkspaceMemory(workspacePath: string): Promise<string> {
    const memoryFilePath = path.join(workspacePath, this.options.workspaceMemoryFile);

    try {
      return await fs.readFile(memoryFilePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }

  async ingestWorkspaceMemory(input: {
    workspacePath: string;
    agentId: string;
    sessionId?: string;
  }): Promise<number> {
    const content = await this.readWorkspaceMemory(input.workspacePath);
    if (!content.trim()) {
      return 0;
    }

    const blocks = content
      .split(/\n##\s+/)
      .map((block) => block.trim())
      .filter(Boolean)
      .slice(-50);

    for (const block of blocks) {
      const row = this.database.insertMemory({
        sessionId: input.sessionId ?? null,
        agentId: input.agentId,
        source: 'memory_md',
        content: block,
        embeddingRef: this.provider.name === 'noop' ? null : this.embeddingRef(block),
        importance: 1,
        metadata: {
          ingestedAt: utcNow()
        }
      });
      await this.persistEmbedding({
        row,
        content: block
      });
    }

    return blocks.length;
  }

  async search(input: { agentId: string; query: string; limit: number }): Promise<MemorySearchResult[]> {
    const lexical = this.database.lexicalSearchMemory({
      agentId: input.agentId,
      query: input.query,
      limit: Math.max(input.limit * 3, input.limit)
    });

    if (lexical.length === 0) {
      return [];
    }

    const lexicalScored = lexical.map((item) => {
      const lower = item.content.toLowerCase();
      const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = terms.reduce((sum, term) => (lower.includes(term) ? sum + 1 : sum), 0);
      const lexicalScore = hits / Math.max(terms.length, 1);
      const ageMs = Date.now() - new Date(item.createdAt).getTime();
      const recencyScore = Number((1 / (1 + ageMs / (1000 * 60 * 60 * 24 * 30))).toFixed(6));
      const metadata = parseJsonSafe<Record<string, unknown>>(item.metadataJson, {});
      const rawSignificance =
        typeof metadata.significance === 'number'
          ? metadata.significance
          : typeof metadata.importance === 'number'
            ? metadata.importance
            : item.importance;
      const significanceScore = Number((Math.max(0, Math.min(10, rawSignificance)) / 10).toFixed(6));
      const citations = Array.isArray(metadata.citations) ? metadata.citations.map((value) => String(value)) : [];
      return {
        item,
        lexicalScore,
        semanticScore: 0,
        recencyScore,
        significanceScore,
        combinedScore: Number((lexicalScore * 0.5 + recencyScore * 0.2 + significanceScore * 0.3).toFixed(6)),
        citations
      };
    });

    const searchStartedAt = Date.now();
    if (this.provider.name === 'noop') {
      this.emitTelemetry('retrieval', 'lexical_only', { reason: 'provider_noop' });
      this.recordRetrievalSample(Date.now() - searchStartedAt, lexicalScored.length);
      return lexicalScored.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, input.limit);
    }

    const vectorMode = this.resolveRequestedVectorMode();
    if (vectorMode === 'sqlite_exact' && this.vectorMode !== 'sqlite_exact' && !this.annAvailable) {
      this.emitTelemetry('retrieval', 'fallback_exact', { reason: 'ann_unavailable' });
      this.fallbackReason = 'ann_unavailable';
    }

    const persisted = this.database.listMemoryEmbeddingsForAgent({
      agentId: input.agentId,
      statuses: ['ready'],
      limit: Math.max(lexical.length * 4, input.limit * 20)
    });
    if (persisted.length === 0) {
      this.emitTelemetry('retrieval', 'lexical_only', { reason: 'no_persisted_vectors' });
      this.recordRetrievalSample(Date.now() - searchStartedAt, lexicalScored.length);
      return lexicalScored.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, input.limit);
    }

    try {
      const queryEmbedding = (await this.provider.embed([input.query]))[0] ?? [];
      if (queryEmbedding.length === 0) {
        this.emitTelemetry('retrieval', 'lexical_only', { reason: 'empty_query_embedding' });
        this.recordRetrievalSample(Date.now() - searchStartedAt, lexicalScored.length);
        return lexicalScored.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, input.limit);
      }

      const lexicalById = new Map(lexicalScored.map((row) => [row.item.id, row]));
      const semanticRows: MemorySearchResult[] = [];
      for (const entry of persisted) {
        const vector = parseJsonSafe<number[]>(entry.embedding.vectorJson ?? '[]', []);
        const semanticScore = Math.max(0, cosineSimilarity(queryEmbedding, vector));
        const lexicalRow = lexicalById.get(entry.item.id);
        const lexicalScore = lexicalRow?.lexicalScore ?? 0;
        const recencyScore = lexicalRow?.recencyScore ?? this.recencyScore(entry.item.createdAt);
        const significanceScore =
          lexicalRow?.significanceScore ??
          Number((Math.max(0, Math.min(10, entry.item.importance)) / 10).toFixed(6));
        const citations = lexicalRow?.citations ?? parseMemoryCitations(entry.item);
        const combinedScore = Number(
          (lexicalScore * 0.3 + semanticScore * 0.4 + recencyScore * 0.15 + significanceScore * 0.15).toFixed(6)
        );
        semanticRows.push({
          item: entry.item,
          lexicalScore,
          semanticScore,
          recencyScore,
          significanceScore,
          combinedScore,
          citations
        });
      }

      this.emitTelemetry('retrieval', vectorMode, {
        candidates: semanticRows.length
      });
      this.recordRetrievalSample(Date.now() - searchStartedAt, semanticRows.length);
      if (vectorMode === 'sqlite_ann') {
        this.annErrorStreak = 0;
      }
      return semanticRows
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, input.limit);
    } catch (error) {
      if (vectorMode === 'sqlite_ann') {
        this.annErrorStreak += 1;
      }
      this.emitTelemetry('retrieval', 'lexical_only', {
        reason: 'query_embedding_failed',
        error: error instanceof Error ? error.message : String(error)
      });
      this.recordRetrievalSample(Date.now() - searchStartedAt, lexicalScored.length);
      return lexicalScored.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, input.limit);
    }
  }

  async compactTrajectories(input: {
    agentId: string;
    runIds?: string[];
    maxRuns?: number;
    minSignificance?: number;
  }): Promise<{ compactedRuns: number; memoryRows: number }> {
    const minSignificance = input.minSignificance ?? 4;
    const runs =
      input.runIds && input.runIds.length > 0
        ? input.runIds
            .map((runId) => this.database.getRunById(runId))
            .filter((run): run is NonNullable<typeof run> => run !== undefined)
        : this.database
            .listRuns({ limit: input.maxRuns ?? 50, offset: 0 })
            .rows.filter((run) => run.status === 'completed' || run.status === 'failed');

    let compactedRuns = 0;
    let memoryRows = 0;

    for (const run of runs) {
      const chapters = this.database.listTrajectoryChapters(run.id).filter((chapter) => chapter.significance >= minSignificance);
      if (chapters.length === 0) {
        continue;
      }

      const compacted = chapters
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 6)
        .map((chapter, index) => `${index + 1}. [${chapter.chapterKey}] ${chapter.summary}`)
        .join('\n');
      const topSignificance = chapters.reduce((max, chapter) => Math.max(max, chapter.significance), 0);
      const citations = chapters.flatMap((chapter) => parseJsonSafe<string[]>(chapter.citationsJson, []));

      const row = this.database.insertMemory({
        sessionId: run.sessionId,
        agentId: input.agentId,
        source: 'structured',
        content: `Compacted trajectory for run ${run.id}\n${compacted}`,
        embeddingRef: this.provider.name === 'noop' ? null : this.embeddingRef(compacted),
        importance: Number(topSignificance.toFixed(4)),
        metadata: {
          compactedFromRunId: run.id,
          compactedAt: utcNow(),
          significance: topSignificance,
          citations: Array.from(new Set(citations))
        }
      });
      await this.persistEmbedding({
        row,
        content: compacted
      });
      compactedRuns += 1;
      memoryRows += 1;
    }

    return { compactedRuns, memoryRows };
  }

  async autoRememberRun(input: {
    workspacePath: string;
    sessionId: string;
    agentId: string;
    channel: 'telegram' | 'internal';
    runId: string;
    status: 'completed' | 'failed' | 'aborted';
    runtime: string;
    model: string | null;
    summary: string;
  }): Promise<AutoRememberDecision> {
    const policy = this.autoRememberPolicy;
    if (!policy.enabled) {
      this.emitTelemetry('auto_remember', 'disabled');
      return { written: false, reason: 'disabled', significance: 0, entryChars: 0 };
    }

    if (!policy.triggerStatuses.includes(input.status)) {
      this.emitTelemetry('auto_remember', 'status_not_enabled', { status: input.status });
      return { written: false, reason: 'status_not_enabled', significance: 0, entryChars: 0 };
    }

    if (policy.includeChannels.length > 0 && !policy.includeChannels.includes(input.channel)) {
      this.emitTelemetry('auto_remember', 'policy_scope', { channel: input.channel });
      return { written: false, reason: 'policy_scope', significance: 0, entryChars: 0 };
    }
    if (policy.includeAgents.length > 0 && !policy.includeAgents.includes(input.agentId)) {
      this.emitTelemetry('auto_remember', 'policy_scope', { agentId: input.agentId, rule: 'includeAgents' });
      return { written: false, reason: 'policy_scope', significance: 0, entryChars: 0 };
    }
    if (policy.excludeAgents.includes(input.agentId)) {
      this.emitTelemetry('auto_remember', 'policy_scope', { agentId: input.agentId, rule: 'excludeAgents' });
      return { written: false, reason: 'policy_scope', significance: 0, entryChars: 0 };
    }

    const chapters = this.database.listTrajectoryChapters(input.runId);
    const chapterSignificance = chapters.reduce((max, chapter) => Math.max(max, chapter.significance), 0);
    const statusBase = input.status === 'completed' ? 7 : input.status === 'failed' ? 8 : 6;
    const significance = Number(Math.max(chapterSignificance, statusBase).toFixed(4));
    if (significance < policy.minSignificance) {
      this.emitTelemetry('auto_remember', 'below_threshold', {
        significance,
        threshold: policy.minSignificance
      });
      return { written: false, reason: 'below_threshold', significance, entryChars: 0 };
    }

    const chapterSummary = chapters
      .sort((a, b) => b.significance - a.significance)
      .slice(0, 3)
      .map((chapter, index) => `${index + 1}. [${chapter.chapterKey}] ${chapter.summary}`)
      .join('\n');

    const normalizedSummary = input.summary.trim();
    const composed = [
      `Run ${input.runId} (${input.status})`,
      `Runtime: ${input.runtime}${input.model ? ` / ${input.model}` : ''}`,
      '',
      normalizedSummary || '(no summary returned)',
      chapterSummary ? `\nHigh-signal chapters:\n${chapterSummary}` : ''
    ]
      .join('\n')
      .trim();
    const bounded = composed.slice(0, policy.maxEntryChars).trim();
    if (!bounded) {
      this.emitTelemetry('auto_remember', 'empty');
      return { written: false, reason: 'empty', significance, entryChars: 0 };
    }

    const fingerprint = createHash('sha256').update(bounded).digest('hex').slice(0, 24);
    const recent = this.database.listMemoryItemsByAgent(input.agentId, Math.max(24, policy.dedupeWindowRuns * 6));
    const cooldownMs = policy.cooldownMinutes * 60_000;
    const now = Date.now();
    const seenRunIds = new Set<string>();

    for (const item of recent) {
      const metadata = parseJsonSafe<Record<string, unknown>>(item.metadataJson, {});
      const autoMeta = isRecord(metadata.autoRemember) ? metadata.autoRemember : null;
      if (!autoMeta) {
        continue;
      }
      const runId = typeof autoMeta.runId === 'string' ? autoMeta.runId : null;
      if (runId) {
        seenRunIds.add(runId);
      }
      if (runId === input.runId) {
        this.emitTelemetry('auto_remember', 'duplicate', { runId: input.runId });
        return { written: false, reason: 'duplicate', significance, entryChars: bounded.length };
      }
      const existingFingerprint = typeof autoMeta.fingerprint === 'string' ? autoMeta.fingerprint : null;
      const createdAt = Date.parse(item.createdAt);
      if (
        existingFingerprint === fingerprint &&
        Number.isFinite(createdAt) &&
        cooldownMs > 0 &&
        now - createdAt < cooldownMs
      ) {
        this.emitTelemetry('auto_remember', 'cooldown', {
          fingerprint,
          cooldownMinutes: policy.cooldownMinutes
        });
        return { written: false, reason: 'cooldown', significance, entryChars: bounded.length };
      }
    }

    if (policy.dedupeWindowRuns > 0 && seenRunIds.size >= policy.dedupeWindowRuns && seenRunIds.has(input.runId)) {
      this.emitTelemetry('auto_remember', 'duplicate', {
        runId: input.runId,
        dedupeWindowRuns: policy.dedupeWindowRuns
      });
      return { written: false, reason: 'duplicate', significance, entryChars: bounded.length };
    }

    try {
      const rememberResult = await this.remember({
        workspacePath: input.workspacePath,
        sessionId: input.sessionId,
        agentId: input.agentId,
        content: bounded,
        tags: ['auto-remember', input.status],
        metadata: {
          significance,
          citations: chapters.flatMap((chapter) => parseJsonSafe<string[]>(chapter.citationsJson, [])),
          autoRemember: {
            runId: input.runId,
            status: input.status,
            fingerprint,
            wroteAt: utcNow()
          }
        }
      });
      this.emitTelemetry('auto_remember', 'written', {
        runId: input.runId,
        entryChars: bounded.length,
        rowId: rememberResult.row?.id ?? null
      });
      return {
        written: true,
        reason: 'written',
        significance,
        entryChars: bounded.length,
        rowId: rememberResult.row?.id
      };
    } catch (error) {
      this.emitTelemetry('auto_remember', 'remember_failed', {
        runId: input.runId,
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        written: false,
        reason: 'remember_failed',
        significance,
        entryChars: bounded.length
      };
    }
  }

  evaluateRecall(fixtures: Array<{ query: string; expectedContains: string[] }>, agentId: string): {
    fixtureCount: number;
    hitRate: number;
    coverage: number;
    failures: Array<{ query: string; missing: string[] }>;
  } {
    let hits = 0;
    let checks = 0;
    const failures: Array<{ query: string; missing: string[] }> = [];

    for (const fixture of fixtures) {
      const results = this.database.lexicalSearchMemory({
        agentId,
        query: fixture.query,
        limit: 12
      });
      const corpus = results.map((row) => row.content.toLowerCase()).join('\n');
      const missing: string[] = [];

      for (const expected of fixture.expectedContains) {
        checks += 1;
        if (corpus.includes(expected.toLowerCase())) {
          hits += 1;
        } else {
          missing.push(expected);
        }
      }

      if (missing.length > 0) {
        failures.push({ query: fixture.query, missing });
      }
    }

    const hitRate = checks > 0 ? hits / checks : 1;
    const coverage = fixtures.length > 0 ? (fixtures.length - failures.length) / fixtures.length : 1;
    return {
      fixtureCount: fixtures.length,
      hitRate: Number(hitRate.toFixed(4)),
      coverage: Number(coverage.toFixed(4)),
      failures
    };
  }

  async compactDailyLogs(workspacePath: string, retentionDaysOverride?: number): Promise<number> {
    const dailyDirectoryPath = path.join(workspacePath, this.options.dailyMemoryDir);
    const retentionDays = Number.isFinite(retentionDaysOverride) ? Math.max(1, Math.floor(retentionDaysOverride!)) : this.options.retentionDays;
    const retentionThreshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dailyDirectoryPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return 0;
      }
      throw error;
    }

    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      const filePath = path.join(dailyDirectoryPath, entry.name);
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < retentionThreshold) {
        await fs.unlink(filePath);
        removed += 1;
      }
    }

    return removed;
  }

  private resolveRequestedVectorMode(): 'sqlite_exact' | 'sqlite_ann' {
    if (this.vectorMode === 'sqlite_exact') {
      this.applyVectorMode('sqlite_exact', 'configured_exact');
      return 'sqlite_exact';
    }
    if (this.vectorMode === 'sqlite_ann') {
      if (this.annAvailable) {
        this.fallbackReason = null;
        this.applyVectorMode('sqlite_ann', 'configured_ann');
        return 'sqlite_ann';
      }
      this.fallbackReason = 'ann_unavailable';
      this.applyVectorMode('sqlite_exact', 'ann_unavailable');
      return 'sqlite_exact';
    }

    if (!this.annAvailable) {
      this.fallbackReason = 'ann_unavailable';
      this.applyVectorMode('sqlite_exact', 'ann_unavailable');
      return 'sqlite_exact';
    }

    this.evaluateAdaptiveSwitch('auto_tick');
    return this.activeVectorMode;
  }

  private applyVectorMode(next: 'sqlite_exact' | 'sqlite_ann', reason: string): void {
    if (this.activeVectorMode === next) {
      return;
    }
    this.activeVectorMode = next;
    this.lastModeSwitchAt = utcNow();
    this.lastModeSwitchReason = reason;
    this.emitTelemetry('retrieval', 'mode_switch', {
      activeMode: next,
      reason
    });
  }

  private pruneRetrievalSamples(): void {
    const cutoff = Date.now() - this.adaptiveAnnPolicy.stabilityWindowSec * 1000;
    this.retrievalSamples = this.retrievalSamples.filter((sample) => sample.ts >= cutoff);
    if (this.retrievalSamples.length > this.adaptiveAnnPolicy.minSamples * 8) {
      this.retrievalSamples = this.retrievalSamples.slice(-this.adaptiveAnnPolicy.minSamples * 8);
    }
  }

  private recordRetrievalSample(durationMs: number, candidates: number): void {
    this.retrievalSamples.push({
      ts: Date.now(),
      ms: Math.max(0, durationMs),
      candidates: Math.max(0, candidates)
    });
    this.pruneRetrievalSamples();
    if (this.vectorMode === 'auto') {
      this.evaluateAdaptiveSwitch('sample_added');
    }
  }

  private evaluateAdaptiveSwitch(trigger: string): void {
    if (this.vectorMode !== 'auto') {
      return;
    }
    this.pruneRetrievalSamples();
    if (!this.annAvailable) {
      this.fallbackReason = 'ann_unavailable';
      this.applyVectorMode('sqlite_exact', 'ann_unavailable');
      return;
    }

    if (this.activeVectorMode === 'sqlite_ann' && this.annErrorStreak >= this.adaptiveAnnPolicy.rollbackErrorThreshold) {
      this.fallbackReason = 'ann_query_failed';
      this.applyVectorMode('sqlite_exact', 'ann_query_failed');
      this.annErrorStreak = 0;
      return;
    }

    if (this.retrievalSamples.length < this.adaptiveAnnPolicy.minSamples) {
      return;
    }

    const p95Ms = percentile95(this.retrievalSamples.map((sample) => sample.ms));
    const avgCandidates =
      this.retrievalSamples.reduce((sum, sample) => sum + sample.candidates, 0) / this.retrievalSamples.length;

    if (
      this.activeVectorMode === 'sqlite_exact' &&
      p95Ms >= this.adaptiveAnnPolicy.promoteP95Ms &&
      avgCandidates >= this.adaptiveAnnPolicy.minCandidateVolume
    ) {
      this.fallbackReason = null;
      this.applyVectorMode('sqlite_ann', `auto_promote:${trigger}`);
      return;
    }

    if (
      this.activeVectorMode === 'sqlite_ann' &&
      p95Ms <= this.adaptiveAnnPolicy.demoteP95Ms &&
      avgCandidates <= Math.max(1, this.adaptiveAnnPolicy.minCandidateVolume * 0.5)
    ) {
      this.fallbackReason = 'auto_demote_low_load';
      this.applyVectorMode('sqlite_exact', `auto_demote:${trigger}`);
    }
  }

  private emitTelemetry(
    category: 'embedding' | 'retrieval' | 'auto_remember',
    status: string,
    details?: Record<string, unknown>
  ): void {
    this.onTelemetry?.({
      category,
      status,
      details
    });
  }

  private recencyScore(createdAt: string): number {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    return Number((1 / (1 + ageMs / (1000 * 60 * 60 * 24 * 30))).toFixed(6));
  }

  private async persistEmbedding(input: { row: MemoryRecord; content: string }): Promise<void> {
    if (this.provider.name === 'noop') {
      return;
    }

    const checksum = this.embeddingRef(input.content);
    const modelName = this.provider.modelName ?? 'default';
    const deduped = this.database.findMemoryEmbeddingByChecksum({
      checksum,
      provider: this.provider.name,
      model: modelName
    });
    if (deduped?.vectorJson) {
      const vector = parseJsonSafe<number[]>(deduped.vectorJson, []);
      this.database.upsertMemoryEmbedding({
        memoryItemId: input.row.id,
        checksum,
        provider: this.provider.name,
        model: modelName,
        dimension: vector.length,
        vector,
        status: 'ready',
        attempts: 0
      });
      this.emitTelemetry('embedding', 'deduped', {
        memoryItemId: input.row.id
      });
      return;
    }

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const embedded = (await this.provider.embed([input.content.slice(0, 4000)]))[0] ?? [];
        this.database.upsertMemoryEmbedding({
          memoryItemId: input.row.id,
          checksum,
          provider: this.provider.name,
          model: modelName,
          dimension: embedded.length,
          vector: embedded,
          status: 'ready',
          attempts: attempt
        });
        this.emitTelemetry('embedding', 'ready', {
          memoryItemId: input.row.id,
          attempt,
          dimension: embedded.length
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.database.upsertMemoryEmbedding({
          memoryItemId: input.row.id,
          checksum,
          provider: this.provider.name,
          model: modelName,
          dimension: 0,
          vector: null,
          status: 'failed',
          error: message,
          attempts: attempt
        });
        if (attempt >= maxAttempts) {
          this.emitTelemetry('embedding', 'failed', {
            memoryItemId: input.row.id,
            error: message,
            attempts: attempt
          });
          return;
        }
      }
    }
  }

  private embeddingRef(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 24);
  }
}

export function parseMemoryMetadata(item: MemoryRecord): Record<string, unknown> {
  return parseJsonSafe<Record<string, unknown>>(item.metadataJson, {});
}

function percentile95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index] ?? 0;
}

function parseMemoryCitations(item: MemoryRecord): string[] {
  const metadata = parseJsonSafe<Record<string, unknown>>(item.metadataJson, {});
  return Array.isArray(metadata.citations) ? metadata.citations.map((value) => String(value)) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
