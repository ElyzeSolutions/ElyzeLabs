import type { ControlPlaneDatabase } from '@ops/db';
import type { QueueItemRecord, RetryPolicy, RunStatus } from '@ops/shared';

export interface QueueEngineOptions {
  laneConcurrency: Record<string, number>;
  defaultLane: string;
  leaseMs: number;
  pollMs: number;
  retryPolicy: RetryPolicy;
}

export interface QueueEngineMetrics {
  inFlightByLane: Record<string, number>;
  activeSessions: number;
  retries: number;
  deadLetters: number;
  completed: number;
}

export type QueueWorkHandler = (item: QueueItemRecord) => Promise<void>;

const NON_REPLAYABLE_RUN_STATUSES = new Set<RunStatus>(['waiting_input', 'completed', 'aborted', 'failed']);

export class QueueEngine {
  private readonly laneInFlight = new Map<string, number>();
  private readonly sessionLocks = new Set<string>();
  private readonly metricsState: QueueEngineMetrics = {
    inFlightByLane: {},
    activeSessions: 0,
    retries: 0,
    deadLetters: 0,
    completed: 0
  };
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly database: ControlPlaneDatabase,
    private readonly options: QueueEngineOptions,
    private readonly handler: QueueWorkHandler
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.timer = setInterval(() => {
      this.tick();
    }, this.options.pollMs);
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  metrics(): QueueEngineMetrics {
    return {
      ...this.metricsState,
      inFlightByLane: { ...this.metricsState.inFlightByLane },
      activeSessions: this.sessionLocks.size
    };
  }

  private tick(): void {
    if (!this.running) {
      return;
    }

    this.database.releaseExpiredLeases();

    const lanes = new Set<string>([
      this.options.defaultLane,
      ...Object.keys(this.options.laneConcurrency),
      ...Object.keys(this.metricsState.inFlightByLane)
    ]);

    for (const lane of lanes) {
      const cap = this.options.laneConcurrency[lane] ?? this.options.laneConcurrency[this.options.defaultLane] ?? 1;
      const current = this.laneInFlight.get(lane) ?? 0;
      const availableSlots = Math.max(0, cap - current);
      if (availableSlots === 0) {
        continue;
      }

      const reservedSessions = new Set<string>(this.sessionLocks);
      const items = this.database.reserveDueQueueItems({
        lane,
        limit: availableSlots,
        leaseMs: this.options.leaseMs,
        skipSessionIds: [...this.sessionLocks]
      });

      for (const item of items) {
        if (reservedSessions.has(item.sessionId)) {
          const retryAt = new Date(Date.now() + 100).toISOString();
          this.database.releaseQueueItem(item.id, retryAt);
          continue;
        }
        reservedSessions.add(item.sessionId);

        this.runItem(lane, item).catch((error) => {
          const message = error instanceof Error ? error.message : 'unknown queue worker error';
          this.database.markQueueDeadLetter(item.id, message);
          this.metricsState.deadLetters += 1;
          this.releaseLaneSlot(lane, item.sessionId);
        });
      }
    }
  }

  private async runItem(lane: string, item: QueueItemRecord): Promise<void> {
    this.occupyLaneSlot(lane, item.sessionId);
    const leaseHeartbeat = this.startLeaseHeartbeat(item.id);

    try {
      if (this.shouldTreatItemAsHandled(item)) {
        this.database.markQueueDone(item.id);
        this.metricsState.completed += 1;
        return;
      }

      await this.handler(item);
      this.database.markQueueDone(item.id);
      this.metricsState.completed += 1;
    } catch (error) {
      if (this.shouldTreatItemAsHandled(item)) {
        this.database.markQueueDone(item.id);
        this.metricsState.completed += 1;
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      const delayMs = this.computeBackoff(item.attempt + 1);
      const retried = this.database.markQueueRetry({
        queueItemId: item.id,
        delayMs,
        error: message
      });

      if (retried.status === 'dead_letter') {
        this.metricsState.deadLetters += 1;
      } else {
        this.metricsState.retries += 1;
      }
    } finally {
      clearInterval(leaseHeartbeat);
      this.releaseLaneSlot(lane, item.sessionId);
    }
  }

  private startLeaseHeartbeat(queueItemId: string): NodeJS.Timeout {
    const intervalMs = Math.max(25, Math.floor(this.options.leaseMs / 2));
    return setInterval(() => {
      this.database.renewQueueLease(queueItemId, this.options.leaseMs);
    }, intervalMs);
  }

  private shouldTreatItemAsHandled(item: QueueItemRecord): boolean {
    const run = this.database.getRunById(item.runId);
    return run ? NON_REPLAYABLE_RUN_STATUSES.has(run.status) : false;
  }

  private computeBackoff(attempt: number): number {
    const exponential = this.options.retryPolicy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(exponential, this.options.retryPolicy.maxDelayMs);
  }

  private occupyLaneSlot(lane: string, sessionId: string): void {
    const current = this.laneInFlight.get(lane) ?? 0;
    this.laneInFlight.set(lane, current + 1);
    this.metricsState.inFlightByLane[lane] = current + 1;
    this.sessionLocks.add(sessionId);
    this.metricsState.activeSessions = this.sessionLocks.size;
  }

  private releaseLaneSlot(lane: string, sessionId: string): void {
    const current = this.laneInFlight.get(lane) ?? 0;
    const next = Math.max(0, current - 1);
    this.laneInFlight.set(lane, next);
    this.metricsState.inFlightByLane[lane] = next;
    this.sessionLocks.delete(sessionId);
    this.metricsState.activeSessions = this.sessionLocks.size;
  }
}
