import { randomUUID } from 'node:crypto';

import pino from 'pino';

import type { RuntimeEvent } from '@ops/shared';
import { utcNow } from '@ops/shared';

export interface ObservabilityOptions {
  bufferSize: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  metricsWindowSec: number;
}

export interface MetricSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, { count: number; avg: number; p95: number }>;
  windowSec: number;
  window: {
    counters: Record<string, number>;
    histograms: Record<string, { count: number; avg: number; p95: number }>;
  };
  generatedAt: string;
}

export type RuntimeEventSubscriber = (event: RuntimeEvent) => void;

export class ObservabilityHub {
  readonly logger: pino.Logger;

  private readonly buffer: RuntimeEvent[] = [];
  private readonly subscribers = new Set<RuntimeEventSubscriber>();
  private readonly counters = new Map<string, number>();
  private readonly counterBuckets = new Map<string, Map<number, number>>();
  private readonly histograms = new Map<string, Array<{ ts: number; value: number }>>();

  constructor(private readonly options: ObservabilityOptions) {
    this.logger = pino({
      level: options.level,
      base: null,
      timestamp: () => `,"ts":"${utcNow()}"`
    });
  }

  correlationId(prefix = 'corr'): string {
    return `${prefix}_${randomUUID()}`;
  }

  increment(metric: string, delta = 1): void {
    this.counters.set(metric, (this.counters.get(metric) ?? 0) + delta);
    const bucket = Math.floor(Date.now() / 1000);
    const series = this.counterBuckets.get(metric) ?? new Map<number, number>();
    series.set(bucket, (series.get(bucket) ?? 0) + delta);
    this.counterBuckets.set(metric, series);
  }

  observe(metric: string, value: number): void {
    const values = this.histograms.get(metric) ?? [];
    values.push({
      ts: Date.now(),
      value
    });
    if (values.length > 4096) {
      values.shift();
    }
    this.histograms.set(metric, values);
  }

  push(event: RuntimeEvent): RuntimeEvent {
    this.buffer.push(event);
    if (this.buffer.length > this.options.bufferSize) {
      this.buffer.shift();
    }

    this.increment(`events.${event.kind}`);
    this.increment(`events.level.${event.level}`);

    for (const subscriber of this.subscribers) {
      subscriber(event);
    }

    this.logger.info(
      {
        eventId: event.id,
        sequence: event.sequence,
        lane: event.lane,
        sessionId: event.sessionId,
        runId: event.runId,
        kind: event.kind,
        level: event.level,
        data: event.data
      },
      event.message
    );

    return event;
  }

  listEvents(sinceSequence = 0, limit = 200): RuntimeEvent[] {
    return this.buffer.filter((event) => event.sequence > sinceSequence).slice(-limit);
  }

  subscribe(subscriber: RuntimeEventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  metrics(): MetricSnapshot {
    const histogramSnapshot: MetricSnapshot['histograms'] = {};
    const windowHistogramSnapshot: MetricSnapshot['window']['histograms'] = {};
    const windowCounterSnapshot: MetricSnapshot['window']['counters'] = {};
    const nowSec = Math.floor(Date.now() / 1000);
    const cutoffSec = nowSec - this.options.metricsWindowSec;
    const cutoffMs = cutoffSec * 1000;

    for (const [name, total] of this.counters.entries()) {
      windowCounterSnapshot[name] = this.windowCounterValue(name, cutoffSec);
      if (total < 0) {
        continue;
      }
    }

    for (const [name, values] of this.histograms.entries()) {
      histogramSnapshot[name] = this.summarizeHistogram(values.map((entry) => entry.value));
      const windowValues = values.filter((entry) => entry.ts >= cutoffMs).map((entry) => entry.value);
      windowHistogramSnapshot[name] = this.summarizeHistogram(windowValues);
    }

    return {
      counters: Object.fromEntries(this.counters.entries()),
      histograms: histogramSnapshot,
      windowSec: this.options.metricsWindowSec,
      window: {
        counters: windowCounterSnapshot,
        histograms: windowHistogramSnapshot
      },
      generatedAt: utcNow()
    };
  }

  private summarizeHistogram(values: number[]): { count: number; avg: number; p95: number } {
    if (values.length === 0) {
      return { count: 0, avg: 0, p95: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const avg = values.reduce((sum, current) => sum + current, 0) / values.length;

    return {
      count: values.length,
      avg: Number(avg.toFixed(2)),
      p95: Number(sorted[p95Index]!.toFixed(2))
    };
  }

  private windowCounterValue(metric: string, cutoffSec: number): number {
    const buckets = this.counterBuckets.get(metric);
    if (!buckets) {
      return 0;
    }

    let total = 0;
    for (const [timestampSec, value] of buckets.entries()) {
      if (timestampSec < cutoffSec) {
        buckets.delete(timestampSec);
        continue;
      }
      total += value;
    }

    return total;
  }
}
