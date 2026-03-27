export type ModuleStatus = 'running' | 'paused' | 'stopped' | string;
export type ModuleAction = 'start' | 'pause' | 'stop' | 'restart';

export interface Overview {
  readiness_score: number;
  uptime_sec: number;
  module_count: number;
  status_counts: Record<string, number>;
  active_incidents: number;
  event_count: number;
  last_event_at?: string | null;
}

export interface ReadinessCheck {
  name: string;
  ok: boolean;
}

export interface Readiness {
  score: number;
  tier: 'ready' | 'degraded' | 'blocked' | string;
  checks: ReadinessCheck[];
}

export interface ModuleRow {
  id: string;
  name: string;
  owner: string;
  category: string;
  description: string;
  status: ModuleStatus;
  health: string;
  queue_depth: number;
  cpu_pct: number;
  memory_mb: number;
  uptime_sec: number;
  last_event_at: string;
}

export interface EventRow {
  id: string;
  ts: string;
  source: string;
  type: string;
  level: string;
  message: string;
  data: Record<string, unknown>;
}

export interface ApiEnvelope {
  ok: boolean;
  error?: string;
}

export interface OverviewResponse extends ApiEnvelope {
  overview: Overview;
}

export interface ReadinessResponse extends ApiEnvelope {
  readiness: Readiness;
}

export interface ModulesResponse extends ApiEnvelope {
  modules: ModuleRow[];
}

export interface EventsResponse extends ApiEnvelope {
  events: EventRow[];
}
