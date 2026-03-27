import { useEffect, useRef, type MutableRefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  invalidateBacklogReadQueries,
  invalidateBoardReadQueries,
  invalidateBrowserReadQueries,
  invalidateChatReadQueries,
  invalidateConfigReadQueries,
  invalidateHousekeepingReadQueries,
  invalidateLlmReadQueries,
  invalidateOnboardingReadQueries,
  invalidateOfficeReadQueries,
  invalidateScheduleReadQueries
} from './queryOptions';
import { useAppStore } from './store';
import type { RuntimeEventRow } from './types';

const EVENT_TYPES = [
  'run.queued',
  'run.accepted',
  'run.running',
  'run.waiting_input',
  'run.completed',
  'run.aborted',
  'run.failed',
  'queue.retry',
  'queue.dead_letter',
  'security.decision',
  'presence.updated',
  'skill.called',
  'skill.denied',
  'session.preference.updated',
  'tool.policy.updated',
  'trajectory.captured',
  'memory.compacted',
  'context_graph.projected',
  'remediation.signal.ingested',
  'remediation.plan.created',
  'remediation.plan.executed',
  'vault.status',
  'vault.secret.updated',
  'vault.secret.revoked',
  'terminal.session',
  'terminal.chunk',
  'terminal.closed',
  'system.info',
  'office',
  'backpressure'
] as const;

const MAX_RECONNECT_ATTEMPTS_BEFORE_COOLDOWN = 6;
const REALTIME_COOLDOWN_MS = 30_000;
const REALTIME_REFRESH_DEBOUNCE_MS = 250;

type RefreshActions = {
  refreshBoard: () => Promise<void>;
  refreshChats: () => Promise<void>;
  refreshOffice: () => Promise<void>;
  refreshVault: () => Promise<void>;
};

type InvalidateActions = {
  backlog: () => Promise<void>;
  board: () => Promise<void>;
  browser: () => Promise<void>;
  chats: () => Promise<void>;
  config: () => Promise<void>;
  office: () => Promise<void>;
  llm: () => Promise<void>;
  onboarding: () => Promise<void>;
  schedules: () => Promise<void>;
  housekeeping: () => Promise<void>;
};

function clearRealtimeTimer(timerRef: MutableRefObject<number | null>): void {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function shouldRefreshBoardFromSystemInfo(event: RuntimeEventRow): boolean {
  const message = typeof event.message === 'string' ? event.message.toLowerCase() : '';
  if (!message) {
    return false;
  }
  return [
    'session',
    'backlog',
    'cleanup',
    'pruned',
    'housekeeping',
    'agent profile',
    'runtime configuration updated'
  ].some((needle) => message.includes(needle));
}

function shouldRefreshSchedulesFromSystemInfo(event: RuntimeEventRow): boolean {
  const message = typeof event.message === 'string' ? event.message.toLowerCase() : '';
  if (!message) {
    return false;
  }
  return ['schedule', 'cron'].some((needle) => message.includes(needle));
}

function shouldRefreshHousekeepingFromSystemInfo(event: RuntimeEventRow): boolean {
  const message = typeof event.message === 'string' ? event.message.toLowerCase() : '';
  if (!message) {
    return false;
  }
  return ['cleanup', 'pruned', 'housekeeping', 'dead-letter', 'dead letter', 'retention', 'local session', 'scanner'].some((needle) =>
    message.includes(needle)
  );
}

function applyRealtimeRefresh(kind: string, event: RuntimeEventRow, actions: RefreshActions): void {
  if (
    kind.startsWith('run.') ||
    kind.startsWith('queue.') ||
    kind === 'session.preference.updated' ||
    (kind === 'system.info' && shouldRefreshBoardFromSystemInfo(event))
  ) {
    void actions.refreshBoard();
  }
  if (kind.startsWith('run.') || kind === 'session.preference.updated' || kind === 'system.info') {
    void actions.refreshChats();
  }
  if (kind === 'presence.updated' || kind === 'office') {
    void actions.refreshOffice();
  }
  if (kind.startsWith('vault.')) {
    void actions.refreshVault();
  }
}

function applyRealtimeInvalidation(
  kind: string,
  event: RuntimeEventRow,
  invalidate: InvalidateActions
): void {
  if (
    kind.startsWith('run.') ||
    kind.startsWith('queue.') ||
    kind === 'session.preference.updated' ||
    (kind === 'system.info' && shouldRefreshBoardFromSystemInfo(event))
  ) {
    void invalidate.backlog();
    void invalidate.board();
    void invalidate.browser();
    void invalidate.chats();
    void invalidate.llm();
    void invalidate.office();
    void invalidate.schedules();
    return;
  }
  if (kind.startsWith('vault.')) {
    void invalidate.browser();
    void invalidate.config();
    void invalidate.onboarding();
    return;
  }
  if (kind === 'presence.updated' || kind === 'office') {
    void invalidate.office();
    return;
  }
  if (kind === 'tool.policy.updated' || kind.startsWith('skill.')) {
    void invalidate.onboarding();
    return;
  }
  if (kind === 'queue.dead_letter' || (kind === 'system.info' && shouldRefreshHousekeepingFromSystemInfo(event))) {
    void invalidate.housekeeping();
    return;
  }
  if (kind.startsWith('remediation.')) {
    void invalidate.housekeeping();
    return;
  }
  if (kind === 'system.info' && shouldRefreshBoardFromSystemInfo(event)) {
    void invalidate.config();
    void invalidate.onboarding();
    return;
  }
  if (kind === 'system.info' && shouldRefreshSchedulesFromSystemInfo(event)) {
    void invalidate.schedules();
  }
}

function scheduleRealtimeRefresh(
  kind: string,
  event: RuntimeEventRow,
  refreshTimerRef: MutableRefObject<number | null>,
  actions: RefreshActions,
  invalidate: InvalidateActions
): void {
  clearRealtimeTimer(refreshTimerRef);
  refreshTimerRef.current = window.setTimeout(() => {
    refreshTimerRef.current = null;
    applyRealtimeRefresh(kind, event, actions);
    applyRealtimeInvalidation(kind, event, invalidate);
  }, REALTIME_REFRESH_DEBOUNCE_MS);
}

function computeReconnectDelayMs(attempt: number): number {
  const baseDelay = Math.min(20_000, 800 * 2 ** attempt);
  const jitteredDelay = Math.floor(baseDelay * (0.5 + Math.random() * 0.5));
  return Math.max(300, jitteredDelay);
}

function createRealtimeEventHandler(input: {
  type: string;
  upsertEvent: (event: RuntimeEventRow) => void;
  refreshTimerRef: MutableRefObject<number | null>;
  actions: RefreshActions;
  invalidate: InvalidateActions;
}): (event: Event) => void {
  return (event) => {
    if (!(event instanceof MessageEvent)) {
      return;
    }
    if (input.type === 'heartbeat' || input.type === 'backpressure') {
      return;
    }

    try {
      const rawPayload = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
      const payload = JSON.parse(rawPayload) as RuntimeEventRow;
      if (typeof payload.sequence !== 'number') {
        return;
      }
      input.upsertEvent(payload);
      scheduleRealtimeRefresh(input.type, payload, input.refreshTimerRef, input.actions, input.invalidate);
    } catch {
      // Ignore malformed event payloads.
    }
  };
}

function bindRealtimeEventListeners(
  source: EventSource,
  upsertEvent: (event: RuntimeEventRow) => void,
  refreshTimerRef: MutableRefObject<number | null>,
  actions: RefreshActions,
  invalidate: InvalidateActions
): void {
  for (const type of EVENT_TYPES) {
    source.addEventListener(
      type,
      createRealtimeEventHandler({
        type,
        upsertEvent,
        refreshTimerRef,
        actions,
        invalidate
      })
    );
  }

  source.addEventListener(
    'heartbeat',
    createRealtimeEventHandler({
      type: 'heartbeat',
      upsertEvent,
      refreshTimerRef,
      actions,
      invalidate
    })
  );
}

function scheduleRealtimeReconnect(input: {
  attempt: number;
  reconnectTimerRef: MutableRefObject<number | null>;
  cooldownTimerRef: MutableRefObject<number | null>;
  setConnection: (state: ReturnType<typeof useAppStore.getState>['connection']) => void;
  connect: () => void;
}): void {
  if (input.attempt + 1 >= MAX_RECONNECT_ATTEMPTS_BEFORE_COOLDOWN) {
    input.setConnection('cooldown');
    clearRealtimeTimer(input.cooldownTimerRef);
    input.cooldownTimerRef.current = window.setTimeout(() => {
      input.cooldownTimerRef.current = null;
      input.setConnection('manual_recover');
    }, REALTIME_COOLDOWN_MS);
    return;
  }

  clearRealtimeTimer(input.reconnectTimerRef);
  input.reconnectTimerRef.current = window.setTimeout(() => {
    input.reconnectTimerRef.current = null;
    input.connect();
  }, computeReconnectDelayMs(input.attempt));
}

export function useRealtimeSync(enabled = true, token?: string): void {
  const queryClient = useQueryClient();
  const setConnection = useAppStore((state) => state.setConnection);
  const reconnectNonce = useAppStore((state) => state.reconnectNonce);
  const upsertEvent = useAppStore((state) => state.upsertEvent);
  const refreshBoard = useAppStore((state) => state.refreshBoard);
  const refreshChats = useAppStore((state) => state.refreshChats);
  const refreshOffice = useAppStore((state) => state.refreshOffice);
  const refreshVault = useAppStore((state) => state.refreshVault);

  const reconnectAttemptRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      setConnection('disconnected');
      return;
    }

    let closed = false;
    let source: EventSource | null = null;
    const refreshActions: RefreshActions = {
      refreshBoard,
      refreshChats,
      refreshOffice,
      refreshVault
    };
    const invalidateActions = {
      backlog: () => invalidateBacklogReadQueries(queryClient, token),
      board: () => invalidateBoardReadQueries(queryClient, token),
      browser: () => invalidateBrowserReadQueries(queryClient, token),
      chats: () => invalidateChatReadQueries(queryClient, token),
      config: () => invalidateConfigReadQueries(queryClient, token),
      office: () => invalidateOfficeReadQueries(queryClient, token),
      llm: () => invalidateLlmReadQueries(queryClient, token),
      onboarding: () => invalidateOnboardingReadQueries(queryClient, token),
      schedules: () => invalidateScheduleReadQueries(queryClient, token),
      housekeeping: () => invalidateHousekeepingReadQueries(queryClient, token)
    };

    const connect = (): void => {
      if (closed) {
        return;
      }

      const since = useAppStore.getState().lastSequence;
      const params = new URLSearchParams({
        since: String(since),
        token
      });
      setConnection(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');
      source = new EventSource(`/api/events/stream?${params.toString()}`);

      source.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnection('connected');
        void refreshBoard();
        void refreshChats();
        void refreshOffice();
        void invalidateActions.backlog();
        void invalidateActions.board();
        void invalidateActions.browser();
        void invalidateActions.chats();
        void invalidateActions.config();
        void invalidateActions.llm();
        void invalidateActions.onboarding();
        void invalidateActions.office();
        void invalidateActions.schedules();
        void invalidateActions.housekeeping();
      };

      source.onerror = () => {
        setConnection('reconnecting');
        source?.close();

        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current += 1;
        scheduleRealtimeReconnect({
          attempt,
          reconnectTimerRef,
          cooldownTimerRef,
          setConnection,
          connect
        });
      };

      bindRealtimeEventListeners(source, upsertEvent, refreshTimerRef, refreshActions, invalidateActions);
    };

    connect();

    return () => {
      closed = true;
      setConnection('disconnected');
      source?.close();
      clearRealtimeTimer(reconnectTimerRef);
      clearRealtimeTimer(cooldownTimerRef);
      clearRealtimeTimer(refreshTimerRef);
    };
  }, [enabled, reconnectNonce, refreshBoard, refreshChats, refreshOffice, refreshVault, setConnection, token, upsertEvent]);
}
