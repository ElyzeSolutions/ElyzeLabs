import type { RuntimeKind } from '../../../packages/shared/src/index.ts';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  abortRun,
  bootstrapVault as apiBootstrapVault,
  clearAgentHistory as apiClearAgentHistory,
  createAgentProfile as apiCreateAgentProfile,
  createAgentSession as apiCreateAgentSession,
  createSession as apiCreateSession,
  createSessionLinkCode as apiCreateSessionLinkCode,
  createRun,
  deleteSessions as apiDeleteSessions,
  delegateSessionRun as apiDelegateSessionRun,
  disableAgentProfile as apiDisableAgentProfile,
  fetchAuthPrincipal,
  fetchAgentProfiles,
  fetchTools,
  fetchVaultSecrets,
  fetchVaultStatus,
  resetEmptyVault as apiResetEmptyVault,
  fetchBoard,
  fetchChats,
  fetchEvents,
  fetchMetrics,
  fetchOffice,
  fetchRuns,
  fetchSessions,
  fetchSkills,
  lockVault as apiLockVault,
  revokeVaultSecret as apiRevokeVaultSecret,
  rotateVaultMasterKey as apiRotateVaultMasterKey,
  rotateVaultSecret as apiRotateVaultSecret,
  setToolEnabled,
  startAgentHarness as apiStartAgentHarness,
  stopAgentHarness as apiStopAgentHarness,
  switchSessionRuntime,
  unlockVault as apiUnlockVault,
  updateAgentProfile as apiUpdateAgentProfile,
  updateSessionPreferences,
  upsertVaultSecret as apiUpsertVaultSecret
} from './api';
import type {
  AppNotification,
  AccessRole,
  AgentProfileRow,
  BoardLanes,
  CardMetric,
  MessageRow,
  OfficeLayout,
  OfficePresenceRow,
  RunRow,
  RuntimeEventRow,
  SessionRow,
  SkillRow,
  ToolRow,
  VaultSecretRow,
  VaultStatusRow
} from './types';
import { buildNotificationFromEvent } from '../lib/notifications';

const EMPTY_LANES: BoardLanes = {
  queued: [],
  running: [],
  waiting_input: [],
  failed: [],
  completed: []
};

const HIDDEN_EVENT_KINDS = new Set(['terminal.chunk']);
const MAX_NOTIFICATIONS = 80;
const MAX_NOTIFICATION_SUPPRESSIONS = 240;

function normalizeNotificationKeyPart(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function notificationSuppressionKey(notification: AppNotification): string {
  return [
    notification.source,
    notification.tone,
    notification.title,
    notification.detail,
    notification.route ?? '',
    notification.sessionId ?? '',
    notification.runId ?? ''
  ]
    .map((value) => normalizeNotificationKeyPart(value))
    .join('|');
}

function appendSuppressedNotificationKeys(keys: string[], notifications: AppNotification[]): string[] {
  const next = [...keys];
  for (const notification of notifications) {
    const key = notificationSuppressionKey(notification);
    if (!key || next.includes(key)) {
      continue;
    }
    next.push(key);
  }
  return next.slice(-MAX_NOTIFICATION_SUPPRESSIONS);
}

function isVisibleRuntimeEvent(event: RuntimeEventRow): boolean {
  return !HIDDEN_EVENT_KINDS.has(event.kind);
}

function upsertNotification(
  items: AppNotification[],
  notification: AppNotification,
  suppressedNotificationKeys: string[] = []
): AppNotification[] {
  if (suppressedNotificationKeys.includes(notificationSuppressionKey(notification))) {
    return items;
  }
  const existingIndex = items.findIndex((item) => item.id === notification.id);
  if (existingIndex >= 0) {
    const next = [...items];
    next[existingIndex] = {
      ...next[existingIndex],
      ...notification,
      read: next[existingIndex].read || notification.read
    };
    return next
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, MAX_NOTIFICATIONS);
  }

  return [notification, ...items]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, MAX_NOTIFICATIONS);
}

function buildSystemNotification(input: {
  id: string;
  title: string;
  detail: string;
  tone: AppNotification['tone'];
  route?: string | null;
}): AppNotification {
  return {
    id: input.id,
    title: input.title,
    detail: input.detail,
    tone: input.tone,
    createdAt: new Date().toISOString(),
    read: false,
    route: input.route ?? null,
    source: 'system'
  };
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'cooldown' | 'manual_recover';

interface UiSlice {
  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
  token: string;
  setToken: (token: string) => void;
  activeNav: string;
  setActiveNav: (nav: string) => void;
  search: string;
  setSearch: (search: string) => void;
  shiftNote: string;
  setShiftNote: (note: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  officeMode: 'map' | 'board' | 'org';
  setOfficeMode: (mode: 'map' | 'board' | 'org') => void;
  editingAgentId: string | null;
  setEditingAgentId: (id: string | null) => void;
}

interface NotificationSlice {
  notifications: AppNotification[];
  suppressedNotificationKeys: string[];
  pushNotification: (notification: AppNotification) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  dismissNotification: (notificationId: string) => void;
  clearNotifications: () => void;
}

interface DataSlice {
  loading: boolean;
  error: string | null;
  metrics: CardMetric[];
  agentProfiles: AgentProfileRow[];
  sessions: SessionRow[];
  runs: RunRow[];
  lanes: BoardLanes;
  chats: Array<{ session: SessionRow; messages: MessageRow[] }>;
  skills: SkillRow[];
  tools: ToolRow[];
  vaultStatus: VaultStatusRow | null;
  vaultSecrets: VaultSecretRow[];
  officeLayout: OfficeLayout | null;
  officePresence: OfficePresenceRow[];
  events: RuntimeEventRow[];
  lastSequence: number;
  connection: ConnectionState;
  principalRole: AccessRole;
  setConnection: (status: ConnectionState) => void;
  reconnectNonce: number;
  triggerReconnect: () => void;
  upsertEvent: (event: RuntimeEventRow) => void;
  refreshAll: () => Promise<void>;
  refreshBoard: () => Promise<void>;
  refreshChats: () => Promise<void>;
  refreshSkills: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  refreshTools: () => Promise<void>;
  refreshOffice: () => Promise<void>;
  refreshVault: () => Promise<void>;
  updateSessionPreferences: (
    sessionId: string,
    payload: { runtime?: RuntimeKind; model?: string | null; reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null }
  ) => Promise<void>;
  switchSessionRuntime: (
    sessionId: string,
    payload: {
      runtime?: RuntimeKind;
      model?: string | null;
      reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
      prompt?: string;
    }
  ) => Promise<void>;
  toggleTool: (toolName: string, enabled: boolean) => Promise<void>;
  bootstrapVault: (material: string) => Promise<void>;
  unlockVault: (material: string) => Promise<void>;
  lockVault: () => Promise<void>;
  resetEmptyVault: () => Promise<void>;
  saveVaultSecret: (name: string, payload: { value: string; category: string; approved: boolean }) => Promise<void>;
  rotateVaultSecret: (name: string, value: string) => Promise<void>;
  revokeVaultSecret: (name: string, mode: 'revoke' | 'delete') => Promise<void>;
  rotateVaultMaster: (material: string) => Promise<void>;
  submitRun: (
    sessionId: string,
    prompt: string,
    options?: {
      runtime?: RuntimeKind;
      model?: string | null;
      lane?: string;
      elevated?: boolean;
    }
  ) => Promise<void>;
  createSession: (payload: {
    label?: string;
    sessionKey?: string;
    agentId?: string;
    runtime?: RuntimeKind;
    model?: string | null;
  }) => Promise<SessionRow | null>;
  createAgentProfile: (payload: {
    name: string;
    title: string;
    systemPrompt: string;
    defaultRuntime: RuntimeKind;
    defaultModel?: string | null;
    executionMode?: 'on_demand' | 'persistent_harness' | 'dispatch_only';
    harnessRuntime?: RuntimeKind | null;
    harnessAutoStart?: boolean;
    harnessCommand?: string | null;
    harnessArgs?: string[];
    parentAgentId?: string | null;
    allowedRuntimes?: RuntimeKind[];
    skills?: string[];
    tools?: string[];
    metadata?: Record<string, unknown>;
  }) => Promise<AgentProfileRow | null>;
  updateAgentProfile: (
    agentId: string,
    payload: Partial<{
      name: string;
      title: string;
      systemPrompt: string;
      defaultRuntime: RuntimeKind;
      defaultModel: string | null;
      executionMode: 'on_demand' | 'persistent_harness' | 'dispatch_only';
      harnessRuntime: RuntimeKind | null;
      harnessAutoStart: boolean;
      harnessCommand: string | null;
      harnessArgs: string[];
      parentAgentId: string | null;
      allowedRuntimes: RuntimeKind[];
      skills: string[];
      tools: string[];
      enabled: boolean;
      metadata: Record<string, unknown>;
    }>
  ) => Promise<AgentProfileRow | null>;
  startAgentHarness: (agentId: string) => Promise<void>;
  stopAgentHarness: (agentId: string) => Promise<void>;
  disableAgentProfile: (agentId: string) => Promise<void>;
  clearAgentHistory: (agentId: string) => Promise<{
    agentId: string;
    activeRunsAborted: string[];
    cleared: {
      sessions: number;
      runs: number;
      messages: number;
      memoryItems: number;
      officePresence: number;
      realtimeEvents: number;
      llmUsageEvents: number;
    };
  } | null>;
  deleteSessions: (sessionIds: string[]) => Promise<{
    sessionIds: string[];
    activeRunsAborted: string[];
    cleared: {
      sessions: number;
      runs: number;
      messages: number;
      officePresence: number;
      realtimeEvents: number;
      llmUsageEvents: number;
    };
  } | null>;
  createAgentSession: (
    agentId: string,
    payload: { label?: string; runtime?: RuntimeKind; model?: string | null; firstPrompt?: string; sessionKey?: string }
  ) => Promise<SessionRow | null>;
  delegateSession: (
    sessionId: string,
    payload: { targetAgentId: string; prompt: string; runtime?: RuntimeKind; model?: string | null; mode?: string }
  ) => Promise<void>;
  createSessionLinkCode: (
    sessionId: string,
    ttlSec?: number
  ) => Promise<{ code: string; ttlSec: number; expiresAt: string; command: string } | null>;
  stopRun: (runId: string) => Promise<void>;
}

type AppStore = UiSlice & NotificationSlice & DataSlice;

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => {
      const setActionError = (error: unknown, fallback: string) => {
        set({ error: error instanceof Error ? error.message : fallback });
      };

      const runRefreshes = async (refreshers?: Array<() => Promise<void>>) => {
        if (!refreshers || refreshers.length === 0) {
          return;
        }
        await Promise.all(refreshers.map((refresh) => refresh()));
      };

      const runTokenAction = async <T>({
        missingAuthMessage,
        failureMessage,
        task,
        onSuccess,
        refreshers
      }: {
        missingAuthMessage: string;
        failureMessage: string;
        task: (token: string) => Promise<T>;
        onSuccess?: (result: T) => Promise<void> | void;
        refreshers?: Array<() => Promise<void>>;
      }): Promise<T | null> => {
        const token = get().token;
        if (!token) {
          set({ error: missingAuthMessage });
          return null;
        }

        try {
          const result = await task(token);
          if (onSuccess) {
            await onSuccess(result);
          }
          await runRefreshes(refreshers);
          set({ error: null });
          return result;
        } catch (error) {
          setActionError(error, failureMessage);
          return null;
        }
      };

      return {
        hasHydrated: false,
        setHasHydrated: (hasHydrated) => set({ hasHydrated }),
        token: '',
        setToken: (token) => set({ token }),
        activeNav: 'dashboard',
        setActiveNav: (activeNav) => set({ activeNav }),
        search: '',
        setSearch: (search) => set({ search }),
        shiftNote: '',
        setShiftNote: (shiftNote) => set({ shiftNote }),
        sidebarCollapsed: false,
        setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
        toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
        officeMode: 'map',
        setOfficeMode: (officeMode) => set({ officeMode }),
        editingAgentId: null,
        setEditingAgentId: (editingAgentId) => set({ editingAgentId }),
        notifications: [],
        suppressedNotificationKeys: [],
        pushNotification: (notification) =>
          set((state) => ({
            notifications: upsertNotification(state.notifications, notification, state.suppressedNotificationKeys)
          })),
        markNotificationRead: (notificationId) =>
          set((state) => {
            const notification = state.notifications.find((item) => item.id === notificationId);
            if (!notification || notification.read) {
              return state;
            }
            return {
              notifications: state.notifications.map((item) =>
                item.id === notificationId ? { ...item, read: true } : item
              )
            };
          }),
        markAllNotificationsRead: () =>
          set((state) => {
            if (!state.notifications.some((notification) => !notification.read)) {
              return state;
            }
            return {
              notifications: state.notifications.map((notification) =>
                notification.read ? notification : { ...notification, read: true }
              )
            };
          }),
        dismissNotification: (notificationId) =>
          set((state) => {
            const notification = state.notifications.find((item) => item.id === notificationId);
            if (!notification) {
              return state;
            }
            return {
              notifications: state.notifications.filter((item) => item.id !== notificationId),
              suppressedNotificationKeys: appendSuppressedNotificationKeys(
                state.suppressedNotificationKeys,
                [notification]
              )
            };
          }),
        clearNotifications: () =>
          set((state) => {
            if (state.notifications.length === 0) {
              return state;
            }
            return {
              notifications: [],
              suppressedNotificationKeys: appendSuppressedNotificationKeys(
                state.suppressedNotificationKeys,
                state.notifications
              )
            };
          }),

      loading: true,
      error: null,
      metrics: [],
      agentProfiles: [],
      sessions: [],
      runs: [],
      lanes: EMPTY_LANES,
      chats: [],
      skills: [],
      tools: [],
      vaultStatus: null,
      vaultSecrets: [],
      officeLayout: null,
      officePresence: [],
      events: [],
      lastSequence: 0,
      connection: 'disconnected',
      principalRole: 'operator',
      setConnection: (connection) => {
        const previous = get().connection;
        if (previous === connection) {
          return;
        }

        const nextState: Partial<AppStore> = { connection };
        const notificationId = `connection:${connection}`;

        if (connection === 'cooldown') {
          nextState.notifications = upsertNotification(
            get().notifications,
            buildSystemNotification({
              id: notificationId,
              title: 'Live stream cooling down',
              detail: 'Realtime updates hit repeated failures. The dashboard will wait before retrying.',
              tone: 'warning',
              route: '/mission-control'
            }),
            get().suppressedNotificationKeys
          );
        } else if (connection === 'manual_recover') {
          nextState.notifications = upsertNotification(
            get().notifications,
            buildSystemNotification({
              id: notificationId,
              title: 'Manual reconnect available',
              detail: 'The event stream paused after multiple retries. You can reconnect from the shell.',
              tone: 'critical',
              route: '/mission-control'
            }),
            get().suppressedNotificationKeys
          );
        } else if (connection === 'connected' && previous !== 'connecting' && previous !== 'reconnecting') {
          nextState.notifications = upsertNotification(
            get().notifications,
            buildSystemNotification({
              id: notificationId,
              title: 'Realtime restored',
              detail: 'Live events and refresh triggers are flowing again.',
              tone: 'success',
              route: '/mission-control'
            }),
            get().suppressedNotificationKeys
          );
        }

        set(nextState);
      },
      reconnectNonce: 0,
      triggerReconnect: () => set((state) => ({ reconnectNonce: state.reconnectNonce + 1 })),

      upsertEvent: (event) => {
        const priorLastSequence = get().lastSequence;
        const lastSequence = Math.max(priorLastSequence, event.sequence);
        if (!isVisibleRuntimeEvent(event)) {
          if (lastSequence !== priorLastSequence) {
            set({ lastSequence });
          }
          return;
        }

        const current = get().events;
        const existingIndex = current.findIndex((candidate) => candidate.sequence === event.sequence);

        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = event;
          set({ events: next, lastSequence });
          return;
        }

        const next = [...current, event].sort((a, b) => a.sequence - b.sequence).slice(-400);
        const eventNotification = buildNotificationFromEvent(event);
        set((state) => ({
          events: next,
          lastSequence,
          notifications: eventNotification
            ? upsertNotification(state.notifications, eventNotification, state.suppressedNotificationKeys)
            : state.notifications
        }));
      },

      refreshAll: async () => {
        const token = get().token;
        set({ loading: true, error: null });

        try {
          const [sessions, metrics, agentProfiles, runs, lanes, chats, skills, tools, office, events, vaultStatus, vaultSecrets, principal] =
            await Promise.all([
            fetchSessions(token),
            fetchMetrics(token),
            fetchAgentProfiles(token, true),
            fetchRuns(token),
            fetchBoard(token),
            fetchChats(token),
            fetchSkills(token),
            fetchTools(token),
            fetchOffice(token),
            fetchEvents(token, 0),
            fetchVaultStatus(token),
            fetchVaultSecrets(token, true),
            fetchAuthPrincipal(token)
          ]);

          const lastSequence = events.reduce((maxSequence, event) => Math.max(maxSequence, event.sequence), 0);
          const visibleEvents = events.filter(isVisibleRuntimeEvent);

          set({
            loading: false,
            error: null,
            metrics,
            agentProfiles,
            sessions,
            runs,
            lanes,
            chats,
            skills,
            tools,
            vaultStatus,
            vaultSecrets,
            officeLayout: office.layout,
            officePresence: office.presence,
            events: visibleEvents,
            lastSequence,
            principalRole: principal.role
          });
        } catch (error) {
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load dashboard data.'
          });
        }
      },

      refreshBoard: async () => {
        const token = get().token;
        try {
          const [metrics, sessions, runs, lanes] = await Promise.all([
            fetchMetrics(token),
            fetchSessions(token),
            fetchRuns(token),
            fetchBoard(token)
          ]);
          set({ metrics, sessions, runs, lanes, error: null });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to refresh board.' });
        }
      },

      refreshChats: async () => {
        const token = get().token;
        try {
          set({ chats: await fetchChats(token), error: null });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to refresh chats.' });
        }
      },

      refreshSkills: async () => {
        const token = get().token;
        try {
          set({ skills: await fetchSkills(token), error: null });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to refresh skills.' });
        }
      },

      refreshAgents: async () => {
        const token = get().token;
        try {
          set({ agentProfiles: await fetchAgentProfiles(token, true), error: null });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to refresh agent profiles.' });
        }
      },

      refreshTools: async () => {
        const token = get().token;
        try {
          set({ tools: await fetchTools(token), error: null });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to refresh tools.' });
        }
      },

      refreshOffice: async () => {
        const token = get().token;
        try {
          const office = await fetchOffice(token);
          set({ officeLayout: office.layout, officePresence: office.presence, error: null });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to refresh office view.' });
        }
      },

      refreshVault: async () => {
        const token = get().token;
        try {
          const [vaultStatus, vaultSecrets] = await Promise.all([fetchVaultStatus(token), fetchVaultSecrets(token, true)]);
          set({ vaultStatus, vaultSecrets, error: null });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to refresh vault state.' });
        }
      },

        updateSessionPreferences: async (sessionId, payload) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before changing runtime/model preferences.',
            failureMessage: 'Failed to update session preferences.',
            task: (token) => updateSessionPreferences(token, sessionId, payload),
            refreshers: [get().refreshBoard]
          });
        },

        switchSessionRuntime: async (sessionId, payload) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before switching runtime/model.',
            failureMessage: 'Failed to switch runtime/model.',
            task: (token) => switchSessionRuntime(token, sessionId, payload),
            refreshers: [get().refreshBoard]
          });
        },

        toggleTool: async (toolName, enabled) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before updating tool policies.',
            failureMessage: 'Failed to update tool policy.',
            task: (token) => setToolEnabled(token, toolName, enabled),
            refreshers: [get().refreshTools]
          });
        },

        bootstrapVault: async (material) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before bootstrapping vault.',
            failureMessage: 'Failed to bootstrap vault.',
            task: (token) => apiBootstrapVault(token, material),
            refreshers: [get().refreshVault]
          });
        },

        unlockVault: async (material) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before unlocking vault.',
            failureMessage: 'Failed to unlock vault.',
            task: (token) => apiUnlockVault(token, material),
            refreshers: [get().refreshVault]
          });
        },

        lockVault: async () => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before locking vault.',
            failureMessage: 'Failed to lock vault.',
            task: (token) => apiLockVault(token),
            refreshers: [get().refreshVault]
          });
        },

        resetEmptyVault: async () => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before resetting vault keys.',
            failureMessage: 'Failed to reset empty vault.',
            task: (token) => apiResetEmptyVault(token),
            refreshers: [get().refreshVault]
          });
        },

        saveVaultSecret: async (name, payload) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before writing vault secrets.',
            failureMessage: 'Failed to save vault secret.',
            task: (token) => apiUpsertVaultSecret(token, name, payload),
            refreshers: [get().refreshVault]
          });
        },

        rotateVaultSecret: async (name, value) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before rotating vault secrets.',
            failureMessage: 'Failed to rotate vault secret.',
            task: (token) => apiRotateVaultSecret(token, name, value),
            refreshers: [get().refreshVault]
          });
        },

        revokeVaultSecret: async (name, mode) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before revoking vault secrets.',
            failureMessage: 'Failed to revoke vault secret.',
            task: (token) => apiRevokeVaultSecret(token, name, mode),
            refreshers: [get().refreshVault]
          });
        },

        rotateVaultMaster: async (material) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before rotating vault master key.',
            failureMessage: 'Failed to rotate vault master key.',
            task: (token) => apiRotateVaultMasterKey(token, material),
            refreshers: [get().refreshVault]
          });
        },

        submitRun: async (sessionId, prompt, options) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before creating runs.',
            failureMessage: 'Failed to create run.',
            task: (token) =>
              createRun(token, sessionId, prompt, {
                runtime: options?.runtime,
                model: options?.model ?? null,
                lane: options?.lane,
                elevated: options?.elevated,
                source: 'dashboard'
              }),
            refreshers: [get().refreshBoard]
          });
        },

        createSession: async (payload) =>
          runTokenAction({
            missingAuthMessage: 'Set API token in Settings before creating a session.',
            failureMessage: 'Failed to create session.',
            task: (token) => apiCreateSession(token, payload),
            refreshers: [get().refreshBoard, get().refreshChats]
          }),

        createAgentProfile: async (payload) =>
          runTokenAction({
            missingAuthMessage: 'Set API token in Settings before creating agent profiles.',
            failureMessage: 'Failed to create agent profile.',
            task: (token) => apiCreateAgentProfile(token, payload),
            refreshers: [get().refreshAgents]
          }),

        updateAgentProfile: async (agentId, payload) =>
          runTokenAction({
            missingAuthMessage: 'Set API token in Settings before updating agent profiles.',
            failureMessage: 'Failed to update agent profile.',
            task: (token) => apiUpdateAgentProfile(token, agentId, payload),
            refreshers: [get().refreshAgents, get().refreshBoard]
          }),

        startAgentHarness: async (agentId) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before starting harness sessions.',
            failureMessage: 'Failed to start agent harness.',
            task: (token) => apiStartAgentHarness(token, agentId),
            refreshers: [get().refreshAgents]
          });
        },

        stopAgentHarness: async (agentId) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before stopping harness sessions.',
            failureMessage: 'Failed to stop agent harness.',
            task: (token) => apiStopAgentHarness(token, agentId),
            refreshers: [get().refreshAgents]
          });
        },

        disableAgentProfile: async (agentId) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before disabling agent profiles.',
            failureMessage: 'Failed to disable agent profile.',
            task: (token) => apiDisableAgentProfile(token, agentId),
            refreshers: [get().refreshAgents, get().refreshBoard]
          });
        },

        clearAgentHistory: async (agentId) =>
          runTokenAction({
            missingAuthMessage: 'Set API token in Settings before clearing agent history.',
            failureMessage: 'Failed to clear agent history.',
            task: (token) => apiClearAgentHistory(token, agentId),
            refreshers: [get().refreshAgents, get().refreshBoard, get().refreshChats, get().refreshOffice]
          }),

        deleteSessions: async (sessionIds) =>
          runTokenAction({
            missingAuthMessage: 'Set API token in Settings before deleting sessions.',
            failureMessage: 'Failed to delete sessions.',
            task: (token) => apiDeleteSessions(token, sessionIds),
            refreshers: [get().refreshBoard, get().refreshChats, get().refreshOffice]
          }),

        createAgentSession: async (agentId, payload) => {
          const response = await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before creating agent sessions.',
            failureMessage: 'Failed to create agent session.',
            task: (token) => apiCreateAgentSession(token, agentId, payload),
            refreshers: [get().refreshBoard, get().refreshChats]
          });
          return response?.session ?? null;
        },

        delegateSession: async (sessionId, payload) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before delegating work to subagents.',
            failureMessage: 'Failed to delegate session task.',
            task: (token) => apiDelegateSessionRun(token, sessionId, payload),
            refreshers: [get().refreshBoard, get().refreshChats, get().refreshOffice]
          });
        },

        createSessionLinkCode: async (sessionId, ttlSec = 600) =>
          runTokenAction({
            missingAuthMessage: 'Set API token in Settings before creating a Telegram link code.',
            failureMessage: 'Failed to create session link code.',
            task: (token) => apiCreateSessionLinkCode(token, sessionId, ttlSec)
          }),

        stopRun: async (runId) => {
          await runTokenAction({
            missingAuthMessage: 'Set API token in Settings before stopping runs.',
            failureMessage: 'Failed to abort run.',
            task: (token) => abortRun(token, runId),
            refreshers: [get().refreshBoard]
          });
        }
      };
    },
    {
      name: 'ops-dashboard-store',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        token: state.token,
        activeNav: state.activeNav,
        search: state.search,
        shiftNote: state.shiftNote,
        sidebarCollapsed: state.sidebarCollapsed,
        officeMode: state.officeMode,
        notifications: state.notifications,
        suppressedNotificationKeys: state.suppressedNotificationKeys,
        lastSequence: state.lastSequence
      })
    }
  )
);
