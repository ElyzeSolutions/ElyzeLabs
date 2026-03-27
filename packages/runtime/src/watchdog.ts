import fs from 'node:fs/promises';

import type { RuntimeKind } from '@ops/shared';

import {
  matchRuntimeSignatures,
  type WatchdogHealthStatus,
  type WatchdogRecommendation
} from './error-taxonomy.js';

export interface WatchdogRunRegistration {
  runId: string;
  runtime: RuntimeKind;
  outputFile: string | null;
  staleOutputMs?: number;
  startedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface WatchdogConfig {
  scanIntervalMs: number;
  staleOutputMs: number;
  maxSignaturesPerScan: number;
}

export interface WatchdogHealthEvent {
  runId: string;
  runtime: RuntimeKind;
  status: WatchdogHealthStatus;
  detectedPattern: string | null;
  lastOutputAgeMs: number;
  matchedSignature: string | null;
  recommendation: WatchdogRecommendation;
  ts: string;
  metadata?: Record<string, unknown>;
}

interface WatchdogState {
  runId: string;
  runtime: RuntimeKind;
  outputFile: string | null;
  staleOutputMs: number | null;
  metadata: Record<string, unknown>;
  offset: number;
  startedAtMs: number;
  lastOutputAtMs: number;
  status: WatchdogHealthStatus;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  scanIntervalMs: 10_000,
  staleOutputMs: 300_000,
  maxSignaturesPerScan: 8
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseStartTime(raw: string | undefined): number {
  if (!raw) {
    return Date.now();
  }
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : Date.now();
}

function recommendationForStatus(status: WatchdogHealthStatus): WatchdogRecommendation {
  if (status === 'healthy') {
    return 'continue';
  }
  if (status === 'quota_exceeded') {
    return 'abort_and_switch_provider';
  }
  if (status === 'stuck_at_prompt') {
    return 'alert_human';
  }
  if (status === 'stalled_no_output') {
    return 'abort_and_retry';
  }
  if (status === 'context_overflow' || status === 'error_detected') {
    return 'abort_and_retry';
  }
  return 'alert_human';
}

interface RuntimeWatchdogOptions {
  config?: Partial<WatchdogConfig>;
  onHealthChange?: (event: WatchdogHealthEvent) => void;
  now?: () => number;
}

export class RuntimeWatchdog {
  private readonly onHealthChange: ((event: WatchdogHealthEvent) => void) | undefined;
  private readonly now: () => number;
  private readonly runs = new Map<string, WatchdogState>();
  private readonly history = new Map<string, WatchdogHealthEvent[]>();
  private config: WatchdogConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight = false;

  constructor(options: RuntimeWatchdogOptions = {}) {
    this.onHealthChange = options.onHealthChange;
    this.now = options.now ?? (() => Date.now());
    this.config = {
      ...DEFAULT_CONFIG,
      ...(options.config ?? {})
    };
  }

  updateConfig(patch: Partial<WatchdogConfig>): WatchdogConfig {
    if (patch.scanIntervalMs !== undefined) {
      this.config.scanIntervalMs = Math.max(1_000, Math.floor(patch.scanIntervalMs));
    }
    if (patch.staleOutputMs !== undefined) {
      this.config.staleOutputMs = Math.max(5_000, Math.floor(patch.staleOutputMs));
    }
    if (patch.maxSignaturesPerScan !== undefined) {
      this.config.maxSignaturesPerScan = Math.max(1, Math.min(128, Math.floor(patch.maxSignaturesPerScan)));
    }
    if (this.running) {
      this.stopTimer();
      this.startTimer();
    }
    return this.getConfig();
  }

  getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.startTimer();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.stopTimer();
  }

  registerRun(input: WatchdogRunRegistration): void {
    const startMs = parseStartTime(input.startedAt);
    const staleOverrideRaw = Number(input.staleOutputMs);
    const staleOverride =
      Number.isFinite(staleOverrideRaw) && staleOverrideRaw > 0
        ? Math.max(1_000, Math.min(86_400_000, Math.floor(staleOverrideRaw)))
        : null;
    this.runs.set(input.runId, {
      runId: input.runId,
      runtime: input.runtime,
      outputFile: input.outputFile,
      staleOutputMs: staleOverride,
      metadata: input.metadata ?? {},
      offset: 0,
      startedAtMs: startMs,
      lastOutputAtMs: startMs,
      status: 'healthy'
    });
    if (!this.history.has(input.runId)) {
      this.history.set(input.runId, []);
    }
  }

  unregisterRun(runId: string): void {
    this.runs.delete(runId);
  }

  getRunStatus(runId: string): WatchdogHealthEvent | null {
    const events = this.history.get(runId) ?? [];
    const latest = events.length > 0 ? events[events.length - 1] : null;
    return latest ?? null;
  }

  getStatus(): WatchdogHealthEvent[] {
    const output: WatchdogHealthEvent[] = [];
    for (const [runId] of this.runs) {
      const latest = this.getRunStatus(runId);
      if (latest) {
        output.push(latest);
      } else {
        const state = this.runs.get(runId);
        if (!state) {
          continue;
        }
        output.push({
          runId: state.runId,
          runtime: state.runtime,
          status: state.status,
          detectedPattern: null,
          lastOutputAgeMs: Math.max(0, this.now() - state.lastOutputAtMs),
          matchedSignature: null,
          recommendation: recommendationForStatus(state.status),
          ts: nowIso(),
          metadata: state.metadata
        });
      }
    }
    return output.sort((left, right) => left.runId.localeCompare(right.runId));
  }

  getHistory(runId?: string): WatchdogHealthEvent[] {
    if (runId) {
      return [...(this.history.get(runId) ?? [])];
    }
    const output: WatchdogHealthEvent[] = [];
    for (const events of this.history.values()) {
      output.push(...events);
    }
    return output.sort((left, right) => left.ts.localeCompare(right.ts));
  }

  async scanNow(): Promise<void> {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    try {
      const states = Array.from(this.runs.values());
      for (const state of states) {
        await this.scanRun(state);
      }
    } finally {
      this.inFlight = false;
    }
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      void this.scanNow();
    }, this.config.scanIntervalMs);
  }

  private stopTimer(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  private async scanRun(state: WatchdogState): Promise<void> {
    const current = this.runs.get(state.runId);
    if (!current) {
      return;
    }

    let detectedStatus: WatchdogHealthStatus = 'healthy';
    let detectedPattern: string | null = null;
    let matchedSignature: string | null = null;

    if (state.outputFile) {
      const chunk = await this.readChunk(state.outputFile, state.offset);
      if (chunk.chunk.length > 0) {
        state.offset = chunk.nextOffset;
        state.lastOutputAtMs = this.now();
        const matched = matchRuntimeSignatures(state.runtime, chunk.chunk, {
          maxMatches: this.config.maxSignaturesPerScan
        })[0];
        if (matched) {
          detectedStatus = matched.signature.status;
          detectedPattern = matched.match;
          matchedSignature = matched.signature.id;
        }
      }
    }

    if (detectedStatus === 'healthy') {
      const age = this.now() - state.lastOutputAtMs;
      const staleThresholdMs = state.staleOutputMs ?? this.config.staleOutputMs;
      if (age >= staleThresholdMs) {
        detectedStatus = 'stalled_no_output';
      }
    }

    if (detectedStatus !== state.status) {
      state.status = detectedStatus;
      const event: WatchdogHealthEvent = {
        runId: state.runId,
        runtime: state.runtime,
        status: detectedStatus,
        detectedPattern,
        lastOutputAgeMs: Math.max(0, this.now() - state.lastOutputAtMs),
        matchedSignature,
        recommendation: recommendationForStatus(detectedStatus),
        ts: nowIso(),
        metadata: state.metadata
      };
      const events = this.history.get(state.runId) ?? [];
      events.push(event);
      this.history.set(state.runId, events.slice(-200));
      this.onHealthChange?.(event);
    }
  }

  private async readChunk(outputFile: string, fromOffset: number): Promise<{ chunk: string; nextOffset: number }> {
    try {
      const stat = await fs.stat(outputFile);
      if (stat.size <= fromOffset) {
        return {
          chunk: '',
          nextOffset: fromOffset
        };
      }
      const file = await fs.open(outputFile, 'r');
      try {
        const length = stat.size - fromOffset;
        const buffer = Buffer.alloc(length);
        await file.read(buffer, 0, length, fromOffset);
        return {
          chunk: buffer.toString('utf8'),
          nextOffset: stat.size
        };
      } finally {
        await file.close();
      }
    } catch {
      return {
        chunk: '',
        nextOffset: fromOffset
      };
    }
  }
}
