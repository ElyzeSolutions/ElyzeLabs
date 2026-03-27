import {
  ArrowsClockwise,
  Broadcast,
  CaretRight,
  ChatCircleText,
  Cpu,
  Fingerprint,
  Gear,
  Hash,
  TerminalWindow,
  Waveform,
  PaperPlaneTilt,
  Link,
  Browsers,
  Ghost,
  ArrowUpRight,
  MagnifyingGlass,
  Trash,
  X
} from '@phosphor-icons/react';
import type { Variants } from 'framer-motion';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, memo } from 'react';
import { toast } from 'sonner';
import { setSessionBrowserAuthProfile } from '../app/api';
import { resolveConversationInteractionMode, resolveInteractionModeCopy } from '../app/interactionMode';
import {
  browserSessionVaultQueryOptions,
  chatsQueryOptions,
  invalidateBoardReadQueries,
  invalidateBrowserReadQueries,
  invalidateChatReadQueries,
  runTerminalQueryOptions,
  runWatchdogDetailQueryOptions,
  runsQueryOptions,
  sessionsQueryOptions,
  watchdogStatusQueryOptions
} from '../app/queryOptions';
import { useAppStore } from '../app/store';
import { isMissionControlVisibleSession } from '../app/sessionVisibility';
import type {
  BrowserSessionProfileSummaryRow,
  BrowserSessionVaultState,
  SessionRow,
  MessageRow,
  WatchdogHistoryRow,
  WatchdogStatusRow
} from '../app/types';
import { PageIntro } from '../components/ops/PageHeader';

/* ── Types & Constants ─────────────────────────────────────────────── */

interface TerminalRunState {
  text: string;
  nextOffset: number;
  status: 'active' | 'completed' | 'failed' | 'aborted' | 'unknown';
  mode: 'direct' | 'tmux' | 'api' | null;
  loading: boolean;
  error: string | null;
}

type MissionTelemetryState = {
  followTerminalByRun: Record<string, boolean>;
  terminalByRun: Record<string, TerminalRunState>;
  watchdogByRun: Record<string, WatchdogStatusRow>;
  watchdogHistoryByRun: Record<string, WatchdogHistoryRow[]>;
  browserVault: BrowserSessionVaultState | null;
  browserProfileBusyBySession: Record<string, boolean>;
};

type MissionTelemetryAction =
  | { type: 'set_browser_vault'; browserVault: BrowserSessionVaultState | null }
  | { type: 'set_browser_profile_busy'; sessionId: string; busy: boolean }
  | { type: 'set_follow_terminal'; runId: string; followed: boolean }
  | { type: 'set_terminal_run'; runId: string; terminal: TerminalRunState }
  | { type: 'patch_terminal_run'; runId: string; patch: Partial<TerminalRunState> }
  | { type: 'reset_watchdog_statuses' }
  | { type: 'set_watchdog_statuses'; statuses: Record<string, WatchdogStatusRow> }
  | { type: 'set_watchdog_detail'; runId: string; current: WatchdogStatusRow | null; history: WatchdogHistoryRow[] };

const INITIAL_MISSION_TELEMETRY_STATE: MissionTelemetryState = {
  followTerminalByRun: {},
  terminalByRun: {},
  watchdogByRun: {},
  watchdogHistoryByRun: {},
  browserVault: null,
  browserProfileBusyBySession: {}
};

function missionTelemetryReducer(
  state: MissionTelemetryState,
  action: MissionTelemetryAction
): MissionTelemetryState {
  switch (action.type) {
    case 'set_browser_vault':
      return { ...state, browserVault: action.browserVault };
    case 'set_browser_profile_busy':
      return {
        ...state,
        browserProfileBusyBySession: {
          ...state.browserProfileBusyBySession,
          [action.sessionId]: action.busy
        }
      };
    case 'set_follow_terminal':
      return {
        ...state,
        followTerminalByRun: {
          ...state.followTerminalByRun,
          [action.runId]: action.followed
        }
      };
    case 'set_terminal_run':
      return {
        ...state,
        terminalByRun: {
          ...state.terminalByRun,
          [action.runId]: action.terminal
        }
      };
    case 'patch_terminal_run': {
      const existing = state.terminalByRun[action.runId];
      if (!existing) {
        return state;
      }
      return {
        ...state,
        terminalByRun: {
          ...state.terminalByRun,
          [action.runId]: {
            ...existing,
            ...action.patch
          }
        }
      };
    }
    case 'reset_watchdog_statuses':
      return {
        ...state,
        watchdogByRun: {}
      };
    case 'set_watchdog_statuses':
      return {
        ...state,
        watchdogByRun: action.statuses
      };
    case 'set_watchdog_detail':
      return {
        ...state,
        watchdogByRun: action.current
          ? {
              ...state.watchdogByRun,
              [action.runId]: action.current
            }
          : state.watchdogByRun,
        watchdogHistoryByRun: {
          ...state.watchdogHistoryByRun,
          [action.runId]: action.history
        }
      };
    default:
      return state;
  }
}

const RUNTIME_OPTIONS = ['codex', 'claude', 'gemini', 'process'] as const;
type RuntimeOption = (typeof RUNTIME_OPTIONS)[number];
const REASONING_OPTIONS = ['low', 'medium', 'high', 'xhigh'] as const;
const RUNTIME_REASONING_HINTS: Record<string, { levels: string[]; hint: string }> = {
  codex: {
    levels: ['low', 'medium', 'high', 'xhigh'],
    hint: 'Codex supports reasoning control through workspace config.toml injection.'
  },
  claude: {
    levels: [],
    hint: 'Claude reasoning control is currently advisory only.'
  },
  gemini: {
    levels: [],
    hint: 'Gemini reasoning controls are provider-dependent and may be unavailable.'
  },
  process: {
    levels: [],
    hint: 'Process runtime ignores reasoning effort and uses standard execution.'
  }
};

/* ── Animation Variants ────────────────────────────────────────────── */

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 200, damping: 25 } }
};

const viewportVariants: Variants = {
  hidden: { opacity: 0, scale: 0.99, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 30 } }
};

const pulseVariants: Variants = {
  initial: { opacity: 0.4, scale: 0.8 },
  animate: {
    opacity: [0.4, 1, 0.4],
    scale: [0.8, 1.2, 0.8],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
  }
};

const PAGE_PANEL_CLASS = 'shell-panel';
const PANEL_CLASS = 'shell-panel';
const PANEL_MUTED_CLASS = 'shell-panel-muted';
const GHOST_BUTTON_CLASS =
  'shell-button-ghost inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em]';
const ACCENT_BUTTON_CLASS =
  'shell-button-accent inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em]';
const WARN_BUTTON_CLASS =
  'shell-button-warn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.16em]';
const INPUT_CLASS =
  'shell-field w-full rounded-[1.35rem] px-4 py-3 text-sm outline-none';

function sessionStateBadgeTone(state: string): string {
  return state === 'active' ? 'shell-chip shell-chip-accent' : 'shell-chip';
}

function sessionStateDotTone(state: string): string {
  return state === 'active' ? 'bg-[color:var(--shell-accent)]' : 'bg-white/25';
}

function channelBadgeTone(channel: string): string {
  const normalized = channel.toLowerCase();
  if (normalized.includes('telegram')) {
    return 'shell-chip shell-chip-accent';
  }
  if (normalized.includes('api')) {
    return 'shell-chip';
  }
  return 'shell-chip';
}

function runToneClass(status: string | null | undefined): string {
  switch (status) {
    case 'waiting_input':
      return 'text-amber-100';
    case 'failed':
    case 'aborted':
      return 'text-rose-100';
    case 'running':
    case 'accepted':
      return 'text-[var(--shell-accent)]';
    default:
      return 'text-[var(--shell-text)]';
  }
}

/* ── Sub-Components ────────────────────────────────────────────────── */

const StatusBadge = memo(({ state }: { state: string }) => {
  const isActive = state === 'active';
  return (
      <div className={`${sessionStateBadgeTone(state)} px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]`}>
      <m.div
        variants={isActive ? pulseVariants : {}}
        initial="initial"
        animate="animate"
        className={`h-1.5 w-1.5 rounded-full ${sessionStateDotTone(state)}`}
      />
      {state}
    </div>
  );
});
StatusBadge.displayName = 'StatusBadge';

const ChannelTag = memo(({ channel }: { channel: string }) => {
  const isTelegram = channel.toLowerCase().includes('telegram');
  const isApi = channel.toLowerCase().includes('api');

  return (
    <div className={`${channelBadgeTone(channel)} px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]`}>
      {isTelegram ? <Link size={11} weight="bold" /> :
       isApi ? <Fingerprint size={11} weight="bold" /> :
       <Broadcast size={11} weight="bold" />}
      {channel}
    </div>
  );
});
ChannelTag.displayName = 'ChannelTag';

const ConversationBriefRow = memo(
  ({
    icon: Icon,
    label,
    value,
    detail,
    toneClass = 'text-[var(--shell-text)]'
  }: {
    icon: React.ElementType;
    label: string;
    value: string;
    detail?: string;
    toneClass?: string;
  }) => (
    <div className="flex items-start gap-3 p-6">
      <span className="shell-panel-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
        <Icon size={15} weight="duotone" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">{label}</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className={`text-sm ${toneClass}`}>{value}</span>
          {detail ? <span className="text-sm text-[var(--shell-muted)]">{detail}</span> : null}
        </div>
      </div>
    </div>
  )
);
ConversationBriefRow.displayName = 'ConversationBriefRow';

function resolveDeleteSessionsErrorMessage(error: string | null | undefined): string {
  if (!error) {
    return 'Failed to clear Telegram peers.';
  }
  if (error.includes('Peer cleanup exists in source')) {
    return error;
  }
  if (error.includes('Route POST:/api/sessions/bulk-delete not found')) {
    return 'Peer cleanup exists in source, but the running gateway has not loaded that route yet. Restart ElyzeLabs and try again.';
  }
  return error;
}

function resolveClearSessionErrorMessage(error: string | null | undefined): string {
  if (!error) {
    return 'Failed to clear the session.';
  }
  if (error.includes('Route POST:/api/sessions/bulk-delete not found')) {
    return 'Session clearing exists in source, but the running gateway has not loaded that route yet. Restart ElyzeLabs and try again.';
  }
  return error;
}

/* ── Main Page Component ───────────────────────────────────────────── */

function useMissionControlPageModel() {
  const deleteSessions = useAppStore((state) => state.deleteSessions);
  const token = useAppStore((state) => state.token);
  const search = useAppStore((state) => state.search);
  const setSearch = useAppStore((state) => state.setSearch);
  const queryClient = useQueryClient();
  const sessions = useQuery(sessionsQueryOptions(token)).data ?? [];
  const runs = useQuery(runsQueryOptions(token)).data ?? [];
  const chats = useQuery(chatsQueryOptions(token)).data ?? [];
  const browserVaultQuery = useQuery(browserSessionVaultQueryOptions(token));
  const watchdogStatuses = useQuery(watchdogStatusQueryOptions(token)).data ?? [];

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'intelligence' | 'telemetry'>('intelligence');
  const [activeFilter, setActiveFilter] = useState<'all' | 'telegram' | 'api' | 'active'>('all');
  const [clearingPeerSessions, setClearingPeerSessions] = useState(false);
  const [clearingSelectedSession, setClearingSelectedSession] = useState(false);
  const [telemetryState, dispatchTelemetry] = useReducer(
    missionTelemetryReducer,
    INITIAL_MISSION_TELEMETRY_STATE
  );
  const {
    followTerminalByRun,
    terminalByRun,
    watchdogByRun,
    watchdogHistoryByRun,
    browserVault,
    browserProfileBusyBySession
  } = telemetryState;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const refreshMissionReads = useCallback(async () => {
    if (!token) {
      return;
    }
    await Promise.all([
      invalidateBoardReadQueries(queryClient, token),
      invalidateChatReadQueries(queryClient, token)
    ]);
  }, [queryClient, token]);

  useEffect(() => {
    void refreshMissionReads();
  }, [refreshMissionReads]);

  useEffect(() => {
    dispatchTelemetry({ type: 'set_browser_vault', browserVault: browserVaultQuery.data ?? null });
  }, [browserVaultQuery.data]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const reconcile = (): void => {
      if (document.hidden) {
        return;
      }
      void refreshMissionReads();
    };

    const interval = window.setInterval(reconcile, 15_000);
    const onFocus = (): void => reconcile();
    const onVisibility = (): void => {
      if (!document.hidden) {
        reconcile();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshMissionReads, token]);

  // Keyboard shortcut for search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  const followedRunIds = useMemo(
    () =>
      Object.entries(followTerminalByRun)
        .filter(([, followed]) => followed)
        .map(([runId]) => runId),
    [followTerminalByRun]
  );
  const followedTerminalQueries = useQueries({
    queries: followedRunIds.map((runId) => ({
      ...runTerminalQueryOptions(token, runId, { since: 0, limit: 1200 }),
      refetchInterval: 1_200,
      refetchIntervalInBackground: false
    }))
  });

  useEffect(() => {
    followedRunIds.forEach((runId, index) => {
      const terminalQuery = followedTerminalQueries[index];
      if (!terminalQuery) {
        return;
      }
      if (terminalQuery.error) {
        dispatchTelemetry({
          type: 'patch_terminal_run',
          runId,
          patch: {
            loading: false,
            error: terminalQuery.error instanceof Error ? terminalQuery.error.message : 'Failed to load terminal.'
          }
        });
        return;
      }
      if (!terminalQuery.data) {
        return;
      }
      const payload = terminalQuery.data;
      const status =
        (payload.terminal?.status as TerminalRunState['status']) ??
        (payload.run.status === 'running' ? 'active' : 'unknown');
      dispatchTelemetry({
        type: 'set_terminal_run',
        runId,
        terminal: {
          text: payload.chunks.map((chunk) => chunk.chunk).join('').slice(-14_000),
          nextOffset: payload.nextOffset,
          status,
          mode: (payload.terminal?.mode as TerminalRunState['mode']) ?? null,
          loading: terminalQuery.isFetching,
          error: null
        }
      });
      if (payload.terminal && payload.terminal.status !== 'active') {
        dispatchTelemetry({ type: 'set_follow_terminal', runId, followed: false });
      }
    });
  }, [followedRunIds, followedTerminalQueries]);

  useEffect(() => {
    if (!token) {
      dispatchTelemetry({ type: 'reset_watchdog_statuses' });
      return;
    }
    dispatchTelemetry({
      type: 'set_watchdog_statuses',
      statuses: Object.fromEntries(watchdogStatuses.map((entry) => [entry.runId, entry]))
    });
  }, [token, watchdogStatuses]);

  const filteredSessions = useMemo(() => {
    let result = sessions.filter(isMissionControlVisibleSession);
    
    // Domain Filter
    if (activeFilter === 'telegram') result = result.filter(s => s.channel.toLowerCase().includes('telegram'));
    if (activeFilter === 'api') result = result.filter(s => s.channel.toLowerCase().includes('api'));
    if (activeFilter === 'active') result = result.filter(s => s.state === 'active');

    // Query Search
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (s) =>
          s.sessionKey.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.agentId.toLowerCase().includes(q)
      );
    }
    
    return result.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  }, [search, sessions, activeFilter]);

  const selectedSession = useMemo(() => 
    filteredSessions.find(s => s.id === selectedSessionId) || filteredSessions[0] || null
  , [filteredSessions, selectedSessionId]);

  const selectedAgentTelegramSessions = useMemo(
    () =>
      selectedSession
        ? sessions.filter(
            (session) => isMissionControlVisibleSession(session) && session.agentId === selectedSession.agentId && session.channel.toLowerCase().includes('telegram')
          )
        : [],
    [selectedSession, sessions]
  );
  const selectedSessionBrowserProfiles = useMemo(
    () =>
      selectedSession
        ? (browserVault?.sessionProfiles ?? []).filter(
            (profile) =>
              profile.enabled &&
              (profile.visibility === 'shared' || profile.allowedSessionIds.includes(selectedSession.id))
          )
        : [],
    [browserVault?.sessionProfiles, selectedSession]
  );

  const selectedChat = useMemo(() => 
    chats.find(c => c.session.id === selectedSession?.id) || null
  , [chats, selectedSession]);

  const selectedConversation = useMemo(() => {
    const messages = selectedChat?.messages ?? [];
    const inboundCount = messages.filter((message) => message.direction === 'inbound').length;
    const outboundCount = messages.length - inboundCount;
    const latestMessage = messages[messages.length - 1] ?? null;

    return {
      messages,
      inboundCount,
      outboundCount,
      latestMessage
    };
  }, [selectedChat]);

  // Keep the chat feed pinned without scrolling the outer shell.
  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (viewMode === 'intelligence' && viewport && selectedConversation.messages.length > 0) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [selectedConversation.messages.length, selectedSession?.id, viewMode]);

  const latestRun = useMemo(() => 
    runs.find((r) => r.sessionId === selectedSession?.id)
  , [runs, selectedSession?.id]);
  const latestRunWatchdog = useQuery(runWatchdogDetailQueryOptions(token, latestRun?.id ?? null));
  const handleSessionBrowserProfileChange = useCallback(
    async (session: SessionRow, sessionProfileId: string | null) => {
      if (!token) {
        toast.error('Set API token in Settings before assigning browser auth profiles.');
        return;
      }
      dispatchTelemetry({ type: 'set_browser_profile_busy', sessionId: session.id, busy: true });
      try {
        await setSessionBrowserAuthProfile(token, session.id, sessionProfileId);
        await Promise.all([refreshMissionReads(), invalidateBrowserReadQueries(queryClient, token)]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update the browser auth profile.');
      } finally {
        dispatchTelemetry({ type: 'set_browser_profile_busy', sessionId: session.id, busy: false });
      }
    },
    [queryClient, refreshMissionReads, token]
  );

  useEffect(() => {
    if (!latestRun?.id || !latestRunWatchdog.data) {
      return;
    }
    dispatchTelemetry({
      type: 'set_watchdog_detail',
      runId: latestRun.id,
      current: latestRunWatchdog.data.current ?? null,
      history: latestRunWatchdog.data.history
    });
  }, [latestRun?.id, latestRunWatchdog.data]);

  useEffect(() => {
    if (selectedSession && selectedSessionId !== selectedSession.id) {
      setSelectedSessionId(selectedSession.id);
    }
  }, [selectedSession, selectedSessionId]);

  const headerStats = useMemo(() => {
    const filteredSessionIds = new Set(filteredSessions.map((session) => session.id));
    let liveRunCount = 0;
    let waitingInputCount = 0;
    let failedRunCount = 0;
    for (const run of runs) {
      if (!filteredSessionIds.has(run.sessionId)) {
        continue;
      }
      if (run.status === 'running' || run.status === 'waiting_input' || run.status === 'accepted') {
        liveRunCount += 1;
      }
      if (run.status === 'waiting_input') {
        waitingInputCount += 1;
      }
      if (run.status === 'failed') {
        failedRunCount += 1;
      }
    }
    return {
      activeSessionCount: filteredSessions.filter((session) => session.state === 'active').length,
      liveRunCount,
      waitingInputCount,
      failedRunCount
    };
  }, [filteredSessions, runs]);
  const liveRunCount = headerStats.liveRunCount;

  const handleClearPeers = useCallback(async (): Promise<void> => {
    if (!selectedSession || selectedAgentTelegramSessions.length === 0 || clearingPeerSessions) {
      return;
    }

    const count = selectedAgentTelegramSessions.length;
    const confirmed = window.confirm(
      `Delete ${count} Telegram session${count === 1 ? '' : 's'} for ${selectedSession.agentProfile?.name || selectedSession.agentId}? This removes those threads, runs, and related telemetry, but keeps the agent profile.`
    );
    if (!confirmed) {
      return;
    }

    setClearingPeerSessions(true);
    try {
      const result = await deleteSessions(selectedAgentTelegramSessions.map((session) => session.id));
      if (!result) {
        toast.error(resolveDeleteSessionsErrorMessage(useAppStore.getState().error));
        return;
      }
      await refreshMissionReads();
      toast.success(`Cleared ${result.cleared.sessions} Telegram session${result.cleared.sessions === 1 ? '' : 's'}.`);
    } finally {
      setClearingPeerSessions(false);
    }
  }, [clearingPeerSessions, deleteSessions, refreshMissionReads, selectedAgentTelegramSessions, selectedSession]);

  const handleClearSelectedSession = useCallback(async (): Promise<void> => {
    if (!selectedSession || clearingSelectedSession) {
      return;
    }

    const confirmed = window.confirm(
      `Clear session ${selectedSession.sessionKey}? This removes the thread, related runs, and telemetry from the board.`
    );
    if (!confirmed) {
      return;
    }

    setClearingSelectedSession(true);
    try {
      const result = await deleteSessions([selectedSession.id]);
      if (!result) {
        toast.error(resolveClearSessionErrorMessage(useAppStore.getState().error));
        return;
      }
      await refreshMissionReads();
      toast.success(`Cleared ${selectedSession.sessionKey}.`);
    } finally {
      setClearingSelectedSession(false);
    }
  }, [clearingSelectedSession, deleteSessions, refreshMissionReads, selectedSession]);

  const handleRefreshMission = useCallback(() => {
    void refreshMissionReads();
  }, [refreshMissionReads]);

  const handleSetFollowTerminal = useCallback(
    (runId: string, followed: boolean) => {
      dispatchTelemetry({ type: 'set_follow_terminal', runId, followed });
    },
    []
  );

  const handleRefreshLatestRunTerminal = useCallback(async () => {
    if (!latestRun || !token) {
      return;
    }
    const existing = terminalByRun[latestRun.id] || {
      text: '',
      nextOffset: 0,
      status: 'unknown',
      mode: null,
      loading: false,
      error: null
    };
    dispatchTelemetry({
      type: 'set_terminal_run',
      runId: latestRun.id,
      terminal: {
        ...existing,
        loading: true
      }
    });
    try {
      const payload = await queryClient.fetchQuery(runTerminalQueryOptions(token, latestRun.id, { since: 0, limit: 1200 }));
      dispatchTelemetry({
        type: 'set_terminal_run',
        runId: latestRun.id,
        terminal: {
          text: payload.chunks.map((c) => c.chunk).join(''),
          nextOffset: payload.nextOffset,
          status: 'active',
          mode: 'api',
          loading: false,
          error: null
        }
      });
    } catch {
      dispatchTelemetry({
        type: 'patch_terminal_run',
        runId: latestRun.id,
        patch: {
          loading: false,
          error: 'Refresh failed'
        }
      });
    }
  }, [latestRun, queryClient, terminalByRun, token]);

  return {
    activeFilter,
    browserProfileBusyBySession,
    clearingSelectedSession,
    clearingPeerSessions,
    filteredSessions,
    followTerminalByRun,
    handleClearPeers,
    handleClearSelectedSession,
    handleRefreshLatestRunTerminal,
    handleRefreshMission,
    handleSessionBrowserProfileChange,
    handleSetFollowTerminal,
    latestRun,
    liveRunCount,
    messagesEndRef,
    messagesViewportRef,
    search,
    searchInputRef,
    selectedAgentTelegramSessions,
    selectedConversation,
    selectedSession,
    selectedSessionBrowserProfiles,
    selectedSessionId,
    setActiveFilter,
    setSearch,
    setSelectedSessionId,
    setViewMode,
    terminalByRun,
    viewMode,
    watchdogByRun,
    watchdogHistoryByRun
  };
}

export function MissionControlPage() {
  const model = useMissionControlPageModel();

  return (
    <LazyMotion features={domAnimation}>
      <section className="shell-page shell-page-wide min-h-full flex-1 gap-4 pb-10">
        <MissionHeaderSection model={model} />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)]">
          <MissionRailSection model={model} />
          <main className={`${PAGE_PANEL_CLASS} relative flex min-h-[38rem] min-w-0 w-full flex-col overflow-hidden 2xl:h-[calc(100dvh-12rem)] 2xl:max-h-[calc(100dvh-12rem)]`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 hidden" />
            <AnimatePresence mode="wait">
              {model.selectedSession ? <MissionSelectedWorkspace model={model} /> : <MissionEmptyWorkspace />}
            </AnimatePresence>
          </main>
        </div>
      </section>
    </LazyMotion>
  );
}

type MissionControlModel = ReturnType<typeof useMissionControlPageModel>;

function MissionHeaderSection({ model }: { model: MissionControlModel }) {
  return (
    <PageIntro
      eyebrow="Operations"
      title="Find a session fast"
      description="Search the rail, pick a session, and the conversation opens on the right."
      actions={
        <div className="flex w-full max-w-[30rem] items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlass
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--shell-muted)] transition-colors focus-within:text-[var(--shell-accent)]"
              size={17}
            />
            <input
              ref={model.searchInputRef}
              value={model.search}
              onChange={(event) => model.setSearch(event.target.value)}
              placeholder="Search sessions or agent ids"
              className={`${INPUT_CLASS} h-12 pl-11 pr-11`}
            />
            {model.search ? (
              <button
                onClick={() => model.setSearch('')}
                className="shell-button-ghost absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full p-0 text-[var(--shell-muted)]"
                aria-label="Clear session query"
              >
                <X size={13} weight="bold" />
              </button>
            ) : null}
          </div>
          <button
            onClick={model.handleRefreshMission}
            className="shell-button-ghost inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.35rem] p-0 text-[var(--shell-muted)]"
            aria-label="Refresh mission control"
          >
            <ArrowsClockwise size={18} weight="bold" />
          </button>
        </div>
      }
    />
  );
}

function MissionRailSection({ model }: { model: MissionControlModel }) {
  return (
    <aside className={`${PAGE_PANEL_CLASS} flex min-h-0 min-w-0 w-full flex-col p-4 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-13rem)]`}>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <FilterBtn active={model.activeFilter === 'all'} label="All" onClick={() => model.setActiveFilter('all')} />
        <FilterBtn active={model.activeFilter === 'telegram'} label="Telegram" onClick={() => model.setActiveFilter('telegram')} />
        <FilterBtn active={model.activeFilter === 'api'} label="API" onClick={() => model.setActiveFilter('api')} />
        <FilterBtn active={model.activeFilter === 'active'} label="Live" onClick={() => model.setActiveFilter('active')} />
      </div>

      <div className="mt-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--shell-accent)]" />
          <h3 className="text-sm font-medium text-white">Sessions</h3>
        </div>
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--shell-muted)]">
          {model.filteredSessions.length} threads
        </span>
      </div>

      <div className="mt-4 space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        <AnimatePresence mode="popLayout">
          {model.filteredSessions.map((session) => (
            <StreamListItem
              key={session.id}
              session={session}
              isSelected={model.selectedSessionId === session.id}
              onClick={() => model.setSelectedSessionId(session.id)}
            />
          ))}
          {model.filteredSessions.length === 0 ? (
            <div className="shell-panel-soft rounded-[1.8rem] border-dashed px-6 py-16 text-center">
              <Ghost size={30} className="mx-auto mb-4 text-[var(--shell-muted)]/55" weight="thin" />
              <p className="shell-eyebrow">No Streams Detected</p>
              <button
                onClick={() => {
                  model.setSearch('');
                  model.setActiveFilter('all');
                }}
                className="mt-4 text-[0.72rem] font-medium text-[var(--shell-accent)] transition-colors hover:brightness-110"
              >
                Reset filters
              </button>
            </div>
          ) : null}
        </AnimatePresence>
      </div>
    </aside>
  );
}

function MissionSelectedWorkspace({ model }: { model: MissionControlModel }) {
  const selectedSession = model.selectedSession;
  if (!selectedSession) {
    return null;
  }
  const latestRun = model.latestRun;
  const selectedInteraction = resolveConversationInteractionMode(model.selectedConversation.messages, latestRun);
  const selectedInteractionCopy = resolveInteractionModeCopy(selectedInteraction.mode);

  return (
    <m.div
      key={selectedSession.id}
      variants={viewportVariants}
      initial="hidden"
      animate="show"
      exit="hidden"
      className="relative z-10 flex h-full min-h-0 flex-col"
    >
      <header className="shrink-0 border-b border-white/8 bg-white/[0.02] p-4 sm:p-5 backdrop-blur-xl">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-white truncate">
              {selectedSession.agentProfile?.name || selectedSession.agentId}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge state={selectedSession.state} />
              <ChannelTag channel={selectedSession.channel} />
              {selectedInteractionCopy ? (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] ${selectedInteractionCopy.chipClassName}`}>
                  {selectedInteractionCopy.shortLabel}
                </span>
              ) : null}
              <span className="text-sm text-[var(--shell-muted)]">
                {selectedSession.id.slice(0, 8)}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--shell-muted)]">
              {model.viewMode === 'intelligence'
                ? 'Conversation is visible below. Switch to Terminal for runtime output.'
                : 'Terminal output is visible below. Switch to Chat for the session thread.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {model.selectedAgentTelegramSessions.length > 0 ? (
              <button
                onClick={() => void model.handleClearPeers()}
                disabled={model.clearingPeerSessions}
                className={`${WARN_BUTTON_CLASS} min-h-10 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <Trash size={13} weight="bold" />
                {model.clearingPeerSessions
                  ? 'Clearing peers'
                  : `Clear ${model.selectedAgentTelegramSessions.length} peer${model.selectedAgentTelegramSessions.length === 1 ? '' : 's'}`}
              </button>
            ) : null}

            <button
              onClick={() => void model.handleClearSelectedSession()}
              disabled={model.clearingSelectedSession}
              className={`${WARN_BUTTON_CLASS} min-h-10 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <Trash size={13} weight="bold" />
              {model.clearingSelectedSession ? 'Clearing session' : 'Clear session'}
            </button>

            <div className="shell-panel-muted inline-flex items-center gap-1 rounded-full p-1">
              <button
                onClick={() => model.setViewMode('intelligence')}
                className={[
                  'inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] transition-all',
                  model.viewMode === 'intelligence'
                    ? 'bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                    : 'text-[var(--shell-muted)] hover:text-[var(--shell-text)]'
                ].join(' ')}
              >
                <ChatCircleText size={14} weight="duotone" />
                Chat
              </button>
              <button
                onClick={() => model.setViewMode('telemetry')}
                className={[
                  'inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] transition-all',
                  model.viewMode === 'telemetry'
                    ? 'bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                    : 'text-[var(--shell-muted)] hover:text-[var(--shell-text)]'
                ].join(' ')}
              >
                <TerminalWindow size={14} weight="duotone" />
                Terminal
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
        <AnimatePresence mode="wait">
          {model.viewMode === 'intelligence' ? (
            <MissionIntelligenceWorkspace model={model} selectedSession={selectedSession} latestRun={latestRun} />
          ) : (
            <MissionTelemetryWorkspace model={model} selectedSession={selectedSession} latestRun={latestRun} />
          )}
        </AnimatePresence>
      </div>

      {model.viewMode === 'telemetry' ? (
        <footer className="shrink-0 border-t border-white/8 bg-white/[0.02] p-6">
          <DispatchArea
            session={selectedSession}
            browserProfiles={model.selectedSessionBrowserProfiles}
            selectedBrowserProfileId={selectedSession.browserSessionProfile?.id ?? null}
            browserProfileBusy={model.browserProfileBusyBySession[selectedSession.id] === true}
            onBrowserProfileChange={model.handleSessionBrowserProfileChange}
          />
        </footer>
      ) : null}
    </m.div>
  );
}

function MissionIntelligenceWorkspace({
  model,
  selectedSession,
  latestRun
}: {
  model: MissionControlModel;
  selectedSession: SessionRow;
  latestRun: MissionControlModel['latestRun'];
}) {
  const selectedInteraction = resolveConversationInteractionMode(model.selectedConversation.messages, latestRun);
  const selectedInteractionCopy = resolveInteractionModeCopy(selectedInteraction.mode);

  return (
    <m.div
      key="intelligence"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="grid min-h-0 flex-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <section className={`${PANEL_CLASS} flex min-h-[26rem] min-w-0 flex-col overflow-hidden lg:max-h-[34rem] 2xl:max-h-none xl:min-h-0`}>
        <div className="shrink-0 border-b border-white/8 p-4 sm:p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-medium text-white">Conversation</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--shell-muted)]">
                <span>{model.selectedConversation.messages.length} packets</span>
                <span className="h-1 w-1 rounded-full bg-white/15" />
                <span>Sync {new Date(selectedSession.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <p className="text-sm text-[var(--shell-muted)]">
              {model.selectedConversation.latestMessage
                ? `Latest packet ${new Date(model.selectedConversation.latestMessage.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })} from ${model.selectedConversation.latestMessage.source}. ${model.selectedConversation.inboundCount} inbound and ${model.selectedConversation.outboundCount} operator messages are visible below.`
                : 'The live chat feed appears below as soon as the session receives its first packet.'}
            </p>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-[linear-gradient(180deg,rgba(15,18,24,0.92),rgba(15,18,24,0))]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-[linear-gradient(0deg,rgba(15,18,24,0.92),rgba(15,18,24,0))]" />
          <div
            ref={model.messagesViewportRef}
            className="min-h-[16rem] max-h-[24rem] flex-1 overflow-y-auto overscroll-contain px-4 py-4 pr-2 [scrollbar-gutter:stable] lg:min-h-[18rem] lg:max-h-[28rem] 2xl:min-h-0 2xl:max-h-none sm:px-5"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {model.selectedConversation.messages.length === 0 ? (
              <div className="flex min-h-[16rem] flex-col items-center justify-center text-center opacity-50">
                <ChatCircleText size={42} weight="thin" className="mb-4" />
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--shell-muted)]">
                  Awaiting inbound dialogue
                </p>
              </div>
            ) : (
              <>
                {model.selectedConversation.messages.map((msg, idx) => (
                  <MessagePacket key={msg.id} message={msg} isLast={idx === model.selectedConversation.messages.length - 1} />
                ))}
                <div ref={model.messagesEndRef} />
              </>
            )}
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-4 2xl:overflow-y-auto 2xl:pr-1">
        <section className={`${PANEL_CLASS} overflow-hidden`}>
          <div className="border-b border-white/8 p-6">
            <h3 className="text-lg font-medium text-white">Thread Posture</h3>
          </div>
          <div className="divide-y divide-white/8">
            <ConversationBriefRow
              icon={Hash}
              label="Packets in thread"
              value={String(model.selectedConversation.messages.length)}
              detail={`${model.selectedConversation.inboundCount}/${model.selectedConversation.outboundCount}`}
            />
            <ConversationBriefRow
              icon={Broadcast}
              label="Session channel"
              value={selectedSession.channel}
              detail={selectedSession.state}
              toneClass={selectedSession.state === 'active' ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text)]'}
            />
            <ConversationBriefRow
              icon={Cpu}
              label="Runtime posture"
              value={selectedSession.preferredRuntime || 'process'}
              detail={latestRun?.status || 'idle'}
              toneClass={runToneClass(latestRun?.status)}
            />
            <ConversationBriefRow
              icon={PaperPlaneTilt}
              label="Interaction lane"
              value={selectedInteractionCopy?.label || 'Undetermined'}
              detail={selectedInteractionCopy?.detail || 'No classified assistant/execution signal yet'}
              toneClass={selectedInteractionCopy?.toneClass || 'text-[var(--shell-text)]'}
            />
            <ConversationBriefRow
              icon={Fingerprint}
              label="Latest sender"
              value={model.selectedConversation.latestMessage?.sender || 'No packets yet'}
              detail={
                model.selectedConversation.latestMessage
                  ? new Date(model.selectedConversation.latestMessage.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : undefined
              }
            />
          </div>
          <div className="border-t border-white/8 p-6">
            <div className={`${PANEL_MUTED_CLASS} p-4`}>
              <h4 className="text-sm font-medium text-white">Latest Packet Preview</h4>
              <p className="mt-2 max-h-28 overflow-hidden text-sm leading-6 text-[var(--shell-text)]">
                {model.selectedConversation.latestMessage?.content || 'No visible thread copy yet.'}
              </p>
            </div>
          </div>
        </section>

        <section className={`${PANEL_CLASS} p-6`}>
          <div className="mb-4">
            <h3 className="text-lg font-medium text-white">Dispatch Queue</h3>
          </div>
          <DispatchArea
            session={selectedSession}
            browserProfiles={model.selectedSessionBrowserProfiles}
            selectedBrowserProfileId={selectedSession.browserSessionProfile?.id ?? null}
            browserProfileBusy={model.browserProfileBusyBySession[selectedSession.id] === true}
            onBrowserProfileChange={model.handleSessionBrowserProfileChange}
          />
        </section>
      </aside>
    </m.div>
  );
}

function MissionTelemetryWorkspace({
  model,
  selectedSession,
  latestRun
}: {
  model: MissionControlModel;
  selectedSession: SessionRow;
  latestRun: MissionControlModel['latestRun'];
}) {
  return (
    <m.div
      key="telemetry"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 space-y-5 [scrollbar-gutter:stable]"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <TelemetryConsole
        terminalState={latestRun ? model.terminalByRun[latestRun.id] : undefined}
        isFollowing={latestRun ? !!model.followTerminalByRun[latestRun.id] : false}
        onFollow={(followed) => {
          if (latestRun) {
            model.handleSetFollowTerminal(latestRun.id, followed);
          }
        }}
        onRefresh={model.handleRefreshLatestRunTerminal}
      />
      <WatchdogPanel
        status={latestRun ? model.watchdogByRun[latestRun.id] ?? null : null}
        history={latestRun ? model.watchdogHistoryByRun[latestRun.id] ?? [] : []}
      />
      <SessionSettings session={selectedSession} />
    </m.div>
  );
}

function MissionEmptyWorkspace() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-20 text-center opacity-50">
      <Waveform size={56} weight="thin" className="mb-5 text-[var(--shell-text)]" />
      <h3 className="text-xl font-semibold tracking-tight text-[var(--shell-text)]">No active stream selected</h3>
      <p className="mt-2 text-sm text-[var(--shell-muted)]">
        Choose a session from the left rail to inspect messages, telemetry, and dispatch controls.
      </p>
    </div>
  );
}

/* ── UI Components ────────────────────────────────────────────────── */

const FilterBtn = memo(({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`min-h-10 w-full rounded-full px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-all sm:flex-1 ${
      active
        ? 'shell-chip shell-chip-accent'
        : 'shell-chip justify-center border-transparent bg-white/[0.02] text-[var(--shell-muted)] hover:border-white/8 hover:text-[var(--shell-text)]'
    }`}
  >
    {label}
  </button>
));
FilterBtn.displayName = 'FilterBtn';

function StreamListItem({ session, isSelected, onClick }: { session: SessionRow, isSelected: boolean, onClick: () => void }) {
  return (
    <m.button
      variants={itemVariants}
      layout
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-[1.85rem] border px-4 py-4 text-left transition-all duration-300 ${
        isSelected
          ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] shadow-[0_18px_45px_-30px_rgba(0,0,0,0.55)]'
          : 'border-white/8 bg-white/[0.02] hover:border-white/14 hover:bg-white/[0.04]'
      }`}
    >
      {isSelected && (
        <m.div layoutId="selection-border" className="absolute left-0 top-1/2 h-12 w-1 -translate-y-1/2 rounded-r-full bg-[color:var(--shell-accent)]" />
      )}
      <div className="mb-4 flex items-center justify-between">
         <ChannelTag channel={session.channel} />
         <div className="flex items-center gap-2">
           {session.channel.toLowerCase().includes('telegram') && session.state === 'active' ? (
             <span className="shell-chip shell-chip-accent px-2 py-1 text-[0.62rem] uppercase tracking-[0.16em]">
               Streaming
             </span>
           ) : null}
           <div className={`h-1.5 w-1.5 rounded-full ${session.state === 'active' ? 'bg-[color:var(--shell-accent)] animate-pulse' : 'bg-white/25'}`} />
         </div>
      </div>
      <h4 className={`truncate text-[1rem] font-semibold tracking-tight select-text ${isSelected ? 'text-[var(--shell-text)]' : 'text-[var(--shell-text)]/88 group-hover:text-[var(--shell-text)]'}`}>
        {session.agentProfile?.name || session.agentId}
      </h4>
      <p className="mt-1 truncate text-[0.72rem] text-[var(--shell-muted)] select-text">{session.sessionKey}</p>
      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
         <span className="truncate text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--shell-muted)] select-text">{session.agentId}</span>
         <span className="shrink-0 text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--shell-muted)]">{new Date(session.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </m.button>
  );
}

function MessagePacket({ message, isLast }: { message: MessageRow; isLast: boolean }) {
  const isInbound = message.direction === 'inbound';
  const interactionCopy = !isInbound ? resolveInteractionModeCopy(message.interactionMode ?? null) : null;
  return (
    <div className={`group relative flex flex-col py-3 sm:py-4 ${isInbound ? 'items-start' : 'items-end'}`}>
      {!isLast && <div className={`absolute bottom-0 top-9 w-px bg-white/8 ${isInbound ? 'left-5' : 'right-5'}`} />}
      <div className={`flex w-full max-w-[min(100%,52rem)] flex-col ${isInbound ? 'items-start' : 'items-end'}`}>
        <div className={`mb-2 flex items-center gap-2.5 px-1 ${isInbound ? 'flex-row' : 'flex-row-reverse'}`}>
           <div className={`flex h-7 w-7 items-center justify-center rounded-xl border ${isInbound ? 'border-white/8 bg-white/[0.03] text-[var(--shell-muted)]' : 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'}`}>
             {isInbound ? <Fingerprint size={16} /> : <TerminalWindow size={16} weight="bold" />}
           </div>
           <div className={isInbound ? 'text-left' : 'text-right'}>
              <span className="shell-eyebrow block mb-0.5 text-[0.62rem]">{message.sender || (isInbound ? 'Remote node' : 'Command center')}</span>
              <div className={`flex items-center gap-2 ${isInbound ? 'justify-start' : 'justify-end'}`}>
                <span className="text-[0.68rem] text-[var(--shell-muted)]">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {message.source}</span>
                {interactionCopy ? (
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.16em] ${interactionCopy.chipClassName}`}>
                    {interactionCopy.shortLabel}
                  </span>
                ) : null}
              </div>
           </div>
        </div>
        <div className={`relative overflow-hidden rounded-[1.55rem] border px-4 py-3.5 sm:px-5 sm:py-4 ${isInbound ? 'rounded-tl-none border-white/8 bg-white/[0.03] text-[var(--shell-text)]' : 'rounded-tr-none border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-text)]'}`}>
          <div className="select-text whitespace-pre-wrap break-words font-sans text-[0.92rem] leading-7">
            {message.content}
          </div>
          <div className={`mt-3 flex items-center gap-2 text-[0.66rem] font-medium text-[var(--shell-muted)] ${isInbound ? 'justify-start' : 'justify-end'}`}>
             <ArrowUpRight size={10} className={isInbound ? 'rotate-180' : ''} /> {isInbound ? 'Inbound message' : 'Operator dispatch'}
          </div>
        </div>
      </div>
    </div>
  );
}

function TelemetryConsole({ terminalState, isFollowing, onFollow, onRefresh }: { terminalState?: TerminalRunState, isFollowing: boolean, onFollow: (s: boolean) => void, onRefresh: () => void }) {
  const terminalViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = terminalViewportRef.current;
    if (isFollowing && terminalState?.text && viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [terminalState?.text, isFollowing]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1">
         <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-lg font-medium text-white">Telemetry</h3>
         </div>
         <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="shell-button-ghost inline-flex h-10 w-10 items-center justify-center rounded-full p-0 text-[var(--shell-muted)]"
            >
               <ArrowsClockwise size={16} weight="bold" className={terminalState?.loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => onFollow(!isFollowing)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-all ${
                isFollowing
                  ? 'shell-chip shell-chip-accent'
                  : 'shell-chip text-[var(--shell-muted)] hover:text-[var(--shell-text)]'
              }`}
            >
               <Broadcast size={14} weight={isFollowing ? 'fill' : 'bold'} /> {isFollowing ? 'Tracking live' : 'Monitor live'}
            </button>
         </div>
      </header>
      <div className={`${PANEL_CLASS} relative overflow-hidden`}>
         <div ref={terminalViewportRef} className="h-[240px] overflow-y-auto p-6 font-mono text-[11px] leading-relaxed text-[var(--shell-muted)]">
            {terminalState?.text ? (
              <pre className="whitespace-pre-wrap break-words select-text">{terminalState.text}<span className="ml-1 inline-block h-3 w-1.5 align-middle animate-pulse bg-[color:var(--shell-accent)]" /></pre>
            ) : <p className="italic text-[var(--shell-muted)]/65">Awaiting secure uplink payload...</p>}
         </div>
      </div>
    </div>
  );
}

function DispatchArea({
  session,
  compact = false,
  browserProfiles,
  selectedBrowserProfileId,
  browserProfileBusy,
  onBrowserProfileChange
}: {
  session: SessionRow;
  compact?: boolean;
  browserProfiles: BrowserSessionProfileSummaryRow[];
  selectedBrowserProfileId: string | null;
  browserProfileBusy: boolean;
  onBrowserProfileChange: (session: SessionRow, sessionProfileId: string | null) => Promise<void>;
}) {
  const submitRun = useAppStore(state => state.submitRun);
  const [prompt, setPrompt] = useState('');
  const [expanded, setExpanded] = useState(false);
  const promptId = useId();
  
  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    void submitRun(session.id, prompt, { runtime: session.preferredRuntime || 'process' });
    setPrompt('');
    setExpanded(false);
  };

  const isExpanded = expanded || prompt.length > 0 || !compact;

  return (
    <form onSubmit={handleDispatch} className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
      <div className={`${PANEL_MUTED_CLASS} min-w-0 px-3 py-3`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={promptId} className="shell-eyebrow">Dispatch queue</label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--shell-accent)]/75">
              Ready :: {session.preferredRuntime || 'process'}
            </span>
            {compact ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="shell-button-ghost inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[var(--shell-muted)]"
              >
                <CaretRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                {isExpanded ? 'Condense' : 'Expand'}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="min-w-0 space-y-2">
            <span className="shell-eyebrow flex items-center gap-2">
              <Browsers size={12} weight="bold" />
              Browser auth
            </span>
            <select
              value={selectedBrowserProfileId ?? ''}
              onChange={(event) => {
                void onBrowserProfileChange(session, event.currentTarget.value || null);
              }}
              disabled={browserProfileBusy}
              className="shell-field w-full rounded-[1.1rem] px-3 py-2 text-[0.72rem] outline-none"
            >
              <option value="">No sticky login</option>
              {browserProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label} · {profile.health.state.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <div className="text-[0.68rem] leading-5 text-[var(--shell-muted)]">
            {selectedBrowserProfileId ? 'Authenticated web requests in this session will reuse the selected login.' : 'Pick a saved login when this chat needs private or logged-in browsing.'}
          </div>
        </div>
        <textarea
          id={promptId}
          value={prompt}
          onFocus={() => {
            if (compact) {
              setExpanded(true);
            }
          }}
          onChange={(e) => setPrompt(e.target.value)}
          rows={isExpanded ? 4 : 2}
          className={`shell-field w-full resize-y rounded-[1.45rem] px-4 py-3 text-sm outline-none transition-[min-height] duration-200 ${
            isExpanded ? 'min-h-[6.5rem] max-h-48' : 'min-h-[3.35rem] max-h-28'
          }`}
          placeholder="Dispatch a follow-up command sequence..."
        />
      </div>
      <button
        type="submit"
        disabled={!prompt.trim()}
        className={`${ACCENT_BUTTON_CLASS} min-h-[3.35rem] px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-45`}
      >
        <PaperPlaneTilt size={18} weight="fill" />
        Send command
      </button>
    </form>
  );
}

function WatchdogPanel({ status, history }: { status: WatchdogStatusRow | null; history: WatchdogHistoryRow[] }) {
  const toneClass =
    !status || status.status === 'healthy'
      ? 'shell-chip shell-chip-accent'
      : status.status === 'stalled_no_output'
        ? 'shell-chip shell-chip-warn'
        : 'shell-chip shell-chip-danger';
  return (
    <div className={`${PANEL_CLASS} p-6`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium text-white">Runtime Watchdog</h3>
        <span className={`${toneClass} px-3 py-1 text-xs font-medium`}>{status?.status ?? 'healthy'}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--shell-text)]">
        recommendation: {status?.recommendation ?? 'continue'} · ageMs: {status?.lastOutputAgeMs ?? 0}
      </p>
      {status?.detectedPattern ? <p className="mt-1 text-[0.76rem] text-[var(--shell-muted)] truncate">pattern: {status.detectedPattern}</p> : null}
      <div className="mt-4 space-y-2">
        {history.slice(0, 4).map((entry) => (
          <p key={entry.id} className="text-[0.76rem] text-[var(--shell-muted)]">
            {new Date(entry.createdAt).toLocaleTimeString()} · {entry.status} · {entry.action ?? entry.recommendation}
          </p>
        ))}
        {history.length === 0 ? <p className="text-[0.76rem] text-[var(--shell-muted)]">No watchdog transitions recorded.</p> : null}
      </div>
    </div>
  );
}

function SessionSettings({ session }: { session: SessionRow }) {
  const [runtime, setRuntime] = useState<RuntimeOption>(session.preferredRuntime ?? 'process');
  const [model, setModel] = useState(session.preferredModel || '');
  const [reasoningEffort, setReasoningEffort] = useState(session.preferredReasoningEffort || '');
  const [expanded, setExpanded] = useState(false);
  const runtimeId = useId();
  const modelId = useId();
  const reasoningId = useId();
  const updateSessionPreferences = useAppStore(state => state.updateSessionPreferences);
  const switchSessionRuntime = useAppStore(state => state.switchSessionRuntime);
  const runtimeHint = RUNTIME_REASONING_HINTS[runtime] ?? RUNTIME_REASONING_HINTS.process;
  const supportsReasoning = runtimeHint.levels.length > 0;

  return (
    <div className={`${PANEL_CLASS} space-y-5 p-6`}>
       <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
             <Gear size={18} className="text-[var(--shell-muted)]" weight="duotone" />
             <h3 className="text-lg font-medium text-white">Unit Preferences</h3>
          </div>
          <CaretRight size={14} className={`text-[var(--shell-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`} />
       </button>
       
       <AnimatePresence>
          {expanded && (
            <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-5">
               <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="space-y-2">
                    <label htmlFor={runtimeId} className="shell-eyebrow ml-1">Fleet Runtime</label>
                    <select id={runtimeId} value={runtime} onChange={(e) => setRuntime(e.target.value as RuntimeOption)} className="shell-field w-full rounded-[1.2rem] px-4 py-3 text-[11px] outline-none appearance-none font-mono">
                       {RUNTIME_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={modelId} className="shell-eyebrow ml-1">Model Signature</label>
                    <input id={modelId} value={model} onChange={(e) => setModel(e.target.value)} className="shell-field w-full rounded-[1.2rem] px-4 py-3 text-[11px] outline-none font-mono" placeholder="Auto-detect" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={reasoningId} className="shell-eyebrow ml-1">Reasoning Effort</label>
                    <select
                      id={reasoningId}
                      value={reasoningEffort}
                      onChange={(e) => setReasoningEffort(e.target.value)}
                      disabled={!supportsReasoning}
                      className="shell-field w-full rounded-[1.2rem] px-4 py-3 text-[11px] outline-none appearance-none font-mono disabled:opacity-50"
                    >
                      <option value="">default</option>
                      {REASONING_OPTIONS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
               </div>
               <p className="text-[0.76rem] leading-5 text-[var(--shell-muted)]">{runtimeHint.hint}</p>
               <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() =>
                      void updateSessionPreferences(session.id, {
                        runtime,
                        model: model.trim() || null,
                        reasoningEffort: reasoningEffort ? (reasoningEffort as typeof REASONING_OPTIONS[number]) : null
                      })
                    }
                    className={`${GHOST_BUTTON_CLASS} flex-1`}
                  >
                    Save Config
                  </button>
                  <button
                    onClick={() =>
                      void switchSessionRuntime(session.id, {
                        runtime,
                        model: model.trim() || null,
                        reasoningEffort: reasoningEffort ? (reasoningEffort as typeof REASONING_OPTIONS[number]) : null
                      })
                    }
                    className={`${WARN_BUTTON_CLASS} flex-1`}
                  >
                    Force Restart
                  </button>
               </div>
            </m.div>
          )}
       </AnimatePresence>
    </div>
  );
}
