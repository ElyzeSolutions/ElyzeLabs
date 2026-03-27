import type { RuntimeKind, RunStatus } from '@ops/shared';

export interface ProviderApiCallTrace {
  provider: 'openrouter' | 'google';
  model: string;
  status: 'completed' | 'failed';
  error?: string;
  raw?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export type RuntimeToolSessionEventType =
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  | 'tool_policy_blocked'
  | 'session_resumed';

export interface RuntimeToolSessionEvent {
  type: RuntimeToolSessionEventType;
  toolName: string;
  callId?: string;
  payload?: Record<string, unknown>;
  summary?: string;
  error?: string;
  native?: boolean;
}

export interface RuntimeToolSessionHandle {
  schema: 'ops.native-tool-session-handle.v1';
  id: string;
  runtime: RuntimeKind;
  provider: 'openrouter' | 'google' | null;
  model: string | null;
  transport: 'provider_bridge' | 'none';
  resumable: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  toolSessionMode: 'native_tool_session' | 'direct_runtime';
  lastToolName?: string | null;
  lastToolCallId?: string | null;
  eventCount: number;
}

export interface RuntimeAdapterInput {
  runId: string;
  sessionId: string;
  workspacePath: string;
  prompt: string;
  metadata?: Record<string, unknown>;
  onChunk?: (chunk: string, source: 'stdout' | 'stderr') => void;
  terminal?: {
    mode?: 'direct' | 'tmux';
    sessionName?: string | null;
    maxDurationMs?: number;
  };
}

export interface RuntimeAdapterResponse {
  status: RunStatus;
  summary?: string;
  error?: string;
  waitingPrompt?: string;
  raw?: string;
  toolSessionMode?: 'native_tool_session' | 'direct_runtime';
  toolEvents?: RuntimeToolSessionEvent[];
  toolSessionHandle?: RuntimeToolSessionHandle;
  providerApiCalls?: ProviderApiCallTrace[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface RuntimeAdapter {
  readonly kind: RuntimeKind;
  launch(request: RuntimeAdapterInput): Promise<RuntimeAdapterResponse>;
  send(request: RuntimeAdapterInput): Promise<RuntimeAdapterResponse>;
  abort(runId: string): Promise<void>;
  heartbeat(runId: string): Promise<'running' | 'waiting_input' | 'completed' | 'failed' | 'unknown'>;
  resume(request: RuntimeAdapterInput): Promise<RuntimeAdapterResponse>;
}

export interface RuntimeExecutionRequest extends RuntimeAdapterInput {
  runtime: RuntimeKind;
}

export type RuntimeExecutionResult = Omit<RuntimeAdapterResponse, 'status'> & {
  finalStatus: RunStatus;
};

export interface RuntimeLifecycleEvent {
  runId: string;
  sessionId: string;
  runtime: RuntimeKind;
  status: RunStatus;
  ts: string;
  data: Record<string, unknown>;
}
