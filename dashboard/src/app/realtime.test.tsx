// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDashboardQueryClient } from './queryClient';
import type { RuntimeEventRow } from './types';

type MockStoreState = {
  connection: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'cooldown' | 'manual_recover';
  lastSequence: number;
  reconnectNonce: number;
  setConnection: ReturnType<typeof vi.fn>;
  upsertEvent: ReturnType<typeof vi.fn>;
  refreshBoard: ReturnType<typeof vi.fn>;
  refreshChats: ReturnType<typeof vi.fn>;
  refreshOffice: ReturnType<typeof vi.fn>;
  refreshVault: ReturnType<typeof vi.fn>;
};

const storeState: MockStoreState = {
  connection: 'disconnected',
  lastSequence: 7,
  reconnectNonce: 0,
  setConnection: vi.fn(),
  upsertEvent: vi.fn(),
  refreshBoard: vi.fn(async () => undefined),
  refreshChats: vi.fn(async () => undefined),
  refreshOffice: vi.fn(async () => undefined),
  refreshVault: vi.fn(async () => undefined)
};

const useAppStoreMock = Object.assign(
  <T,>(selector: (state: MockStoreState) => T): T => selector(storeState),
  {
    getState: (): MockStoreState => storeState
  }
);

vi.mock('./store', () => ({
  useAppStore: useAppStoreMock
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  readonly close = vi.fn();
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, payload: RuntimeEventRow): void {
    const event = new MessageEvent('message', {
      data: JSON.stringify(payload)
    });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function resetRealtimeMocks(): void {
  storeState.connection = 'disconnected';
  storeState.lastSequence = 7;
  storeState.reconnectNonce = 0;
  storeState.setConnection.mockReset();
  storeState.upsertEvent.mockReset();
  storeState.refreshBoard.mockReset();
  storeState.refreshChats.mockReset();
  storeState.refreshOffice.mockReset();
  storeState.refreshVault.mockReset();
  MockEventSource.instances = [];
}

describe('useRealtimeSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
    vi.spyOn(Math, 'random').mockReturnValue(1);
    resetRealtimeMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the event stream, upserts runtime events, and refreshes dependent slices', async () => {
    const { useRealtimeSync } = await import('./realtime');

    function Harness() {
      useRealtimeSync(true, 'token-123');
      return null;
    }

    const view = render(
      <QueryClientProvider client={createDashboardQueryClient()}>
        <Harness />
      </QueryClientProvider>
    );
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe('/api/events/stream?since=7&token=token-123');
    expect(storeState.setConnection).toHaveBeenCalledWith('connecting');

    act(() => {
      MockEventSource.instances[0]?.onopen?.(new Event('open'));
    });
    expect(storeState.setConnection).toHaveBeenCalledWith('connected');
    expect(storeState.refreshBoard).toHaveBeenCalledTimes(1);
    expect(storeState.refreshChats).toHaveBeenCalledTimes(1);
    expect(storeState.refreshOffice).toHaveBeenCalledTimes(1);

    act(() => {
      MockEventSource.instances[0]?.emit('run.completed', {
        sequence: 8,
        kind: 'run.completed',
        lane: 'default',
        level: 'info',
        message: 'done',
        ts: '2026-03-15T12:00:00.000Z',
        data: {}
      });
      vi.advanceTimersByTime(250);
    });

    expect(storeState.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: 8,
        kind: 'run.completed'
      })
    );
    expect(storeState.refreshBoard).toHaveBeenCalledTimes(2);
    expect(storeState.refreshChats).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(MockEventSource.instances[0]?.close).toHaveBeenCalled();
    expect(storeState.setConnection).toHaveBeenCalledWith('disconnected');
  });

  it('enters cooldown after repeated stream failures and exposes manual recovery state', async () => {
    const { useRealtimeSync } = await import('./realtime');

    function Harness() {
      useRealtimeSync(true, 'token-123');
      return null;
    }

    render(
      <QueryClientProvider client={createDashboardQueryClient()}>
        <Harness />
      </QueryClientProvider>
    );
    const source = MockEventSource.instances[0];
    expect(source).toBeTruthy();

    act(() => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        source?.onerror?.(new Event('error'));
      }
    });

    expect(storeState.setConnection).toHaveBeenCalledWith('cooldown');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(storeState.setConnection).toHaveBeenCalledWith('manual_recover');
  });
});
