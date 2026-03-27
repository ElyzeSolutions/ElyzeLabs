import type { RuntimeKind } from '@ops/shared';
import { utcNow } from '@ops/shared';

import type {
  RuntimeAdapter,
  RuntimeAdapterInput,
  RuntimeAdapterResponse,
  RuntimeExecutionRequest,
  RuntimeExecutionResult,
  RuntimeLifecycleEvent
} from './types.js';

export interface RuntimeManagerOptions {
  adapters: Record<RuntimeKind, RuntimeAdapter>;
  defaultRuntime: RuntimeKind;
  onEvent?: (event: RuntimeLifecycleEvent) => void;
}

type RuntimeCommand = 'launch' | 'send' | 'resume';

export class RuntimeManager {
  private readonly adapters: Record<RuntimeKind, RuntimeAdapter>;
  private readonly defaultRuntime: RuntimeKind;
  private readonly onEvent: ((event: RuntimeLifecycleEvent) => void) | undefined;

  constructor(options: RuntimeManagerOptions) {
    this.adapters = options.adapters;
    this.defaultRuntime = options.defaultRuntime;
    this.onEvent = options.onEvent;
  }

  availableRuntimes(): Array<{
    kind: RuntimeKind;
    healthy: boolean;
    capabilities: Array<'launch' | 'send' | 'abort' | 'resume' | 'heartbeat'>;
  }> {
    return Object.values(this.adapters).map((adapter) => ({
      kind: adapter.kind,
      healthy: true,
      capabilities: ['launch', 'send', 'abort', 'resume', 'heartbeat']
    }));
  }

  async execute(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    const runtime = request.runtime ?? this.defaultRuntime;
    const adapter = this.getAdapter(runtime);
    if (!adapter) {
      return this.missingAdapterResult(runtime);
    }

    this.emitLifecycle(request, runtime, 'accepted');
    this.emitLifecycle(request, runtime, 'running', {
      workspacePath: request.workspacePath
    });

    return this.runAdapterCommand({
      adapter,
      request,
      runtime,
      command: 'launch'
    });
  }

  async abort(runId: string, runtime: RuntimeKind): Promise<void> {
    const adapter = this.adapters[runtime];
    if (!adapter) {
      return;
    }
    await adapter.abort(runId);
  }

  async send(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    const runtime = request.runtime ?? this.defaultRuntime;
    const adapter = this.getAdapter(runtime);
    if (!adapter) {
      return this.missingAdapterResult(runtime);
    }

    return this.runAdapterCommand({
      adapter,
      request,
      runtime,
      command: 'send',
      eventData: {
        steered: true
      }
    });
  }

  async heartbeat(
    runId: string,
    runtime: RuntimeKind
  ): Promise<'running' | 'waiting_input' | 'completed' | 'failed' | 'unknown'> {
    const adapter = this.adapters[runtime];
    if (!adapter) {
      return 'unknown';
    }
    return adapter.heartbeat(runId);
  }

  async resume(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    const runtime = request.runtime ?? this.defaultRuntime;
    const adapter = this.getAdapter(runtime);
    if (!adapter) {
      return this.missingAdapterResult(runtime);
    }

    return this.runAdapterCommand({
      adapter,
      request,
      runtime,
      command: 'resume',
      eventData: {
        resumed: true
      }
    });
  }

  private getAdapter(runtime: RuntimeKind): RuntimeAdapter | null {
    return this.adapters[runtime] ?? null;
  }

  private toExecutionResult(response: RuntimeAdapterResponse): RuntimeExecutionResult {
    const { status, ...rest } = response;
    return {
      finalStatus: status,
      ...rest
    };
  }

  private missingAdapterResult(runtime: RuntimeKind): RuntimeExecutionResult {
    return {
      finalStatus: 'failed',
      error: `Runtime adapter not found: ${runtime}`
    };
  }

  private emitLifecycle(
    request: Pick<RuntimeExecutionRequest, 'runId' | 'sessionId'>,
    runtime: RuntimeKind,
    status: RuntimeLifecycleEvent['status'],
    data: Record<string, unknown> = {}
  ): void {
    this.emit({
      runId: request.runId,
      sessionId: request.sessionId,
      runtime,
      status,
      ts: utcNow(),
      data
    });
  }

  private async invokeAdapter(
    adapter: RuntimeAdapter,
    request: RuntimeExecutionRequest,
    command: RuntimeCommand
  ): Promise<RuntimeAdapterResponse> {
    const adapterInput: RuntimeAdapterInput = {
      runId: request.runId,
      sessionId: request.sessionId,
      workspacePath: request.workspacePath,
      prompt: request.prompt,
      metadata: request.metadata,
      onChunk: request.onChunk,
      terminal: request.terminal
    };
    if (command === 'launch') {
      return adapter.launch(adapterInput satisfies RuntimeAdapterInput);
    }
    if (command === 'send') {
      return adapter.send(adapterInput satisfies RuntimeAdapterInput);
    }
    return adapter.resume(adapterInput satisfies RuntimeAdapterInput);
  }

  private async runAdapterCommand(input: {
    adapter: RuntimeAdapter;
    request: RuntimeExecutionRequest;
    runtime: RuntimeKind;
    command: RuntimeCommand;
    eventData?: Record<string, unknown>;
  }): Promise<RuntimeExecutionResult> {
    try {
      const response = await this.invokeAdapter(input.adapter, input.request, input.command);
      this.emitLifecycle(input.request, input.runtime, response.status, {
        summary: response.summary,
        error: response.error,
        waitingPrompt: response.waitingPrompt,
        usage: response.usage,
        ...(input.eventData ?? {})
      });
      return this.toExecutionResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitLifecycle(input.request, input.runtime, 'failed', {
        error: message,
        ...(input.eventData ?? {})
      });
      return {
        finalStatus: 'failed',
        error: message
      };
    }
  }

  private emit(event: RuntimeLifecycleEvent): void {
    this.onEvent?.(event);
  }
}
