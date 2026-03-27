import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import {
  agentProfilesQueryOptions,
  officeQueryOptions,
  runsQueryOptions,
  sessionsQueryOptions
} from '../app/queryOptions';
import { isMissionControlVisibleSession } from '../app/sessionVisibility';
import { useAppStore } from '../app/store';
import type { CardMetric } from '../app/types';
import { clampCount } from '../lib/format';
import { RetroOfficeSim } from '../components/office/RetroOfficeSim';
import { CyberOrgChart } from '../components/office/CyberOrgChart';
import { PageIntro } from '../components/ops/PageHeader';
import { useRouteHeaderMetrics } from '../components/shell/RouteHeaderContext';

const CEO_OFFICE_SESSION_KEY = 'office:ceo-hq';

function mapRunStatusToPresence(status: string | null | undefined): 'active' | 'waiting_input' | 'blocked' | 'permission_needed' | 'offline' {
  if (status === 'running' || status === 'accepted') {
    return 'active';
  }
  if (status === 'waiting_input') {
    return 'waiting_input';
  }
  if (status === 'failed' || status === 'aborted') {
    return 'blocked';
  }
  return 'offline';
}

function buildSyntheticActivityLabel(status: string | null | undefined): string {
  switch (status) {
    case 'running':
      return 'Run running';
    case 'accepted':
      return 'Run accepted';
    case 'queued':
      return 'Queued work';
    case 'waiting_input':
      return 'Need your input';
    case 'failed':
      return 'Need intervention';
    case 'aborted':
      return 'Run stopped';
    default:
      return 'Awaiting work';
  }
}

function buildAgentFallbackActivityLabel(hasSession: boolean): string {
  return hasSession ? 'Standing by' : 'No active session';
}

function useOfficePageModel() {
  const navigate = useNavigate();
  const token = useAppStore((state) => state.token);
  const officeMode = useAppStore((state) => state.officeMode);
  const setOfficeMode = useAppStore((state) => state.setOfficeMode);
  const officeData = useQuery(officeQueryOptions(token)).data;
  const officeLayout = officeData?.layout ?? null;
  const officePresence = officeData?.presence ?? [];
  const agentProfiles = useQuery(agentProfilesQueryOptions(token)).data ?? [];
  const sessions = useQuery(sessionsQueryOptions(token)).data ?? [];
  const runs = useQuery(runsQueryOptions(token)).data ?? [];
  const primaryCeoAgentId = useMemo(
    () =>
      agentProfiles.find((profile) => profile.protectedDefault && profile.parentAgentId === null)?.id ??
      agentProfiles.find((profile) => {
        const metadata = profile.metadata ?? {};
        const archetype = typeof metadata.archetype === 'string' ? metadata.archetype.toLowerCase() : '';
        return archetype === 'orchestrator' && profile.parentAgentId === null;
      })?.id ??
      null,
    [agentProfiles]
  );
  const ceoDisplayName = useMemo(() => {
    if (primaryCeoAgentId) {
      const profile = agentProfiles.find((entry) => entry.id === primaryCeoAgentId);
      if (profile?.name?.trim()) {
        return profile.name.trim();
      }
    }
    const fallbackProfile = agentProfiles.find((entry) => {
      const id = entry.id.toLowerCase();
      return id.includes('ceo') || id.includes('orchestrator');
    });
    if (fallbackProfile?.name?.trim()) {
      return fallbackProfile.name.trim();
    }
    return 'CEO';
  }, [agentProfiles, primaryCeoAgentId]);

  const normalizeActivityLabel = useCallback(
    (
      value: string | null | undefined,
      state: (typeof officePresence)[number]['state'],
      options: { navigable: boolean; isCeo: boolean }
    ): string => {
      if (options.isCeo) {
        if (state === 'waiting_input' || state === 'permission_needed') {
          return 'Need your input';
        }
        if (state === 'blocked') {
          return 'Need intervention';
        }
        if (state === 'active') {
          return 'Working my ass off';
        }
        return 'Online';
      }
      const label = (value ?? '').trim();
      if (!label) {
        return 'Idle';
      }
      const normalized = label.toLowerCase();
      if (
        normalized.includes('dispatch-only') ||
        normalized.includes('orchestrator delegated work') ||
        (normalized.includes('orchestrator') && normalized.includes('delegated'))
      ) {
        return 'Mission Control: Delegating';
      }
      if (
        state !== 'active' &&
        (normalized === 'run completed' ||
          normalized === 'completed' ||
          normalized === 'run finished' ||
          normalized === 'done')
      ) {
        return 'Idle';
      }
      return label;
    },
    []
  );

  const ceoAgentIds = useMemo(() => {
    const computed = new Set(
      agentProfiles
        .filter((profile) => {
          const metadata = profile.metadata ?? {};
          const archetype = typeof metadata.archetype === 'string' ? metadata.archetype.toLowerCase() : '';
          if (archetype === 'orchestrator') {
            return true;
          }
          if (profile.parentAgentId !== null) {
            return false;
          }
          const identity = `${profile.name} ${profile.title}`.toLowerCase();
          return identity.includes('ceo') || identity.includes('chief executive') || identity.includes('orchestrator');
        })
        .map((profile) => profile.id)
    );
    if (primaryCeoAgentId) {
      computed.add(primaryCeoAgentId);
    }
    return computed;
  }, [agentProfiles, primaryCeoAgentId]);

  const isCeoOrchestrator = useCallback((agentId: string): boolean => {
    if (ceoAgentIds.has(agentId)) {
      return true;
    }
    const id = agentId.toLowerCase();
    return id.includes('ceo') || id.includes('orchestrator');
  }, [ceoAgentIds]);

  const preferredCeoSessionId = useMemo(() => {
    if (ceoAgentIds.size === 0) {
      return CEO_OFFICE_SESSION_KEY;
    }
    const ceoSessions = [...sessions]
      .filter((session) => ceoAgentIds.has(session.agentId) && isMissionControlVisibleSession(session))
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    const activeTelegramSession = ceoSessions.find(
      (session) => session.channel.toLowerCase().includes('telegram') && session.state === 'active'
    );
    const telegramSession = ceoSessions.find((session) => session.channel.toLowerCase().includes('telegram'));
    const activeSession = ceoSessions.find((session) => session.state === 'active');
    return activeTelegramSession?.id ?? telegramSession?.id ?? activeSession?.id ?? ceoSessions[0]?.id ?? CEO_OFFICE_SESSION_KEY;
  }, [ceoAgentIds, sessions]);

  const navigableSessionIds = useMemo(
    () => new Set(sessions.filter(isMissionControlVisibleSession).map((session) => session.id)),
    [sessions]
  );

  const latestVisibleSessionByAgent = useMemo(() => {
    const byAgent = new Map<string, (typeof sessions)[number]>();
    const visibleSessions = [...sessions]
      .filter(isMissionControlVisibleSession)
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

    for (const session of visibleSessions) {
      if (!byAgent.has(session.agentId)) {
        byAgent.set(session.agentId, session);
      }
    }

    return byAgent;
  }, [sessions]);

  const latestRunBySessionId = useMemo(() => {
    const bySession = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      const current = bySession.get(run.sessionId);
      if (
        !current ||
        new Date(run.updatedAt).getTime() > new Date(current.updatedAt).getTime()
      ) {
        bySession.set(run.sessionId, run);
      }
    }
    return bySession;
  }, [runs]);

  const isSessionNavigable = useCallback(
    (sessionId: string): boolean => navigableSessionIds.has(sessionId),
    [navigableSessionIds]
  );

  const enabledAgentIds = useMemo(
    () => new Set(agentProfiles.filter((profile) => profile.enabled).map((profile) => profile.id)),
    [agentProfiles]
  );
  const agentProfileById = useMemo(
    () => new Map(agentProfiles.map((profile) => [profile.id, profile])),
    [agentProfiles]
  );

  const officePresencePinned = useMemo(() => {
    const next = [...officePresence];
    const visibleAgentIds = new Set<string>([...enabledAgentIds, ...ceoAgentIds]);
    const presentAgentIds = new Set(officePresence.map((entry) => entry.agentId));

    for (const agentId of Array.from(visibleAgentIds)) {
      if (presentAgentIds.has(agentId)) {
        continue;
      }
      const session = latestVisibleSessionByAgent.get(agentId);
      const run = session ? latestRunBySessionId.get(session.id) : undefined;
      const profile = agentProfileById.get(agentId);
      const fallbackSessionId = session?.id ?? `office-agent:${agentId}`;
      const isCeo = isCeoOrchestrator(agentId);
      next.unshift({
        id: `synthetic-${agentId}-${fallbackSessionId}`,
        agentId,
        sessionId: isCeo ? preferredCeoSessionId : fallbackSessionId,
        runId: run?.id ?? null,
        state: isCeo ? 'active' : session ? mapRunStatusToPresence(run?.status) : 'offline',
        activityLabel: isCeo
          ? 'Online'
          : session
            ? buildSyntheticActivityLabel(run?.status)
            : buildAgentFallbackActivityLabel(Boolean(session)),
        sequence: -1,
        updatedAt: run?.updatedAt ?? session?.lastActivityAt ?? profile?.updatedAt ?? new Date().toISOString()
      });
    }

    return next;
  }, [
    agentProfileById,
    ceoAgentIds,
    enabledAgentIds,
    isCeoOrchestrator,
    latestRunBySessionId,
    latestVisibleSessionByAgent,
    officePresence,
    preferredCeoSessionId
  ]);

  const officePresenceVisible = useMemo(
    () =>
      officePresencePinned
        .filter((entry) => {
          if (entry.agentId === 'operator') {
            return false;
          }
          if (isCeoOrchestrator(entry.agentId)) {
            return true;
          }
          return enabledAgentIds.has(entry.agentId);
        })
        .map((entry) => {
          const isCeo = isCeoOrchestrator(entry.agentId);
          const resolvedSessionId = isCeo ? preferredCeoSessionId : entry.sessionId;
          const resolvedState = isCeo && entry.state === 'offline' ? ('active' as const) : entry.state;
          return {
            ...entry,
            state: resolvedState,
            sessionId: resolvedSessionId,
            activityLabel: normalizeActivityLabel(entry.activityLabel, resolvedState, {
              navigable: isSessionNavigable(resolvedSessionId),
              isCeo
            })
          };
        }),
    [enabledAgentIds, officePresencePinned, isSessionNavigable, isCeoOrchestrator, preferredCeoSessionId, normalizeActivityLabel]
  );

  const latestPresenceByAgent = useMemo(() => {
    const byAgent = new Map<string, (typeof officePresenceVisible)[number]>();
    for (const entry of officePresenceVisible) {
      const current = byAgent.get(entry.agentId);
      if (!current) {
        byAgent.set(entry.agentId, entry);
        continue;
      }
      if (entry.sequence > current.sequence) {
        byAgent.set(entry.agentId, entry);
        continue;
      }
      if (entry.sequence === current.sequence && entry.updatedAt > current.updatedAt) {
        byAgent.set(entry.agentId, entry);
      }
    }
    return [...byAgent.values()];
  }, [officePresenceVisible]);

  const orderedPresence = useMemo(() => {
    return [...latestPresenceByAgent].sort((a, b) => {
      const aIsCeo = isCeoOrchestrator(a.agentId);
      const bIsCeo = isCeoOrchestrator(b.agentId);
      if (aIsCeo && !bIsCeo) return -1;
      if (!aIsCeo && bIsCeo) return 1;
      return 0;
    });
  }, [latestPresenceByAgent, isCeoOrchestrator]);

  const byState = useMemo(() => {
    return latestPresenceByAgent.reduce<Record<string, number>>((acc, item) => {
      acc[item.state] = (acc[item.state] ?? 0) + 1;
      return acc;
    }, {});
  }, [latestPresenceByAgent]);

  const nonNavigableCount = latestPresenceByAgent.filter((entry) => !isSessionNavigable(entry.sessionId)).length;

  const headerMetrics = useMemo<CardMetric[]>(
    () => [
      {
        id: 'office_visible_agents',
        label: 'Visible Agents',
        value: orderedPresence.length,
        displayValue: clampCount(orderedPresence.length),
        tone: orderedPresence.length > 0 ? 'positive' : 'neutral'
      },
      {
        id: 'office_active_floor',
        label: 'Active Floor',
        value: byState.active ?? 0,
        displayValue: clampCount(byState.active ?? 0),
        tone: (byState.active ?? 0) > 0 ? 'positive' : 'neutral'
      },
      {
        id: 'office_need_input',
        label: 'Need Input',
        value: (byState.waiting_input ?? 0) + (byState.blocked ?? 0) + (byState.permission_needed ?? 0),
        displayValue: clampCount((byState.waiting_input ?? 0) + (byState.blocked ?? 0) + (byState.permission_needed ?? 0)),
        tone: (byState.waiting_input ?? 0) + (byState.blocked ?? 0) + (byState.permission_needed ?? 0) > 0 ? 'warn' : 'neutral'
      },
      {
        id: 'office_offline',
        label: 'Offline',
        value: byState.offline ?? 0,
        displayValue: clampCount(byState.offline ?? 0),
        tone: (byState.offline ?? 0) > 0 ? 'critical' : 'neutral'
      }
    ],
    [byState, orderedPresence.length]
  );

  useRouteHeaderMetrics(headerMetrics);

  const focusSession = useCallback(
    (sessionId: string) => {
      if (!isSessionNavigable(sessionId)) {
        return;
      }
      useAppStore.getState().setSearch(sessionId);
      void navigate({ to: '/sessions' });
    },
    [isSessionNavigable, navigate]
  );

  return {
    officeLayout,
    nonNavigableCount,
    officeMode,
    setOfficeMode,
    byState,
    orderedPresence,
    ceoAgentIds,
    isSessionNavigable,
    focusSession,
    agentProfiles,
    ceoDisplayName,
    isCeoOrchestrator
  };
}

export function OfficePage() {
  const {
    officeLayout,
    nonNavigableCount,
    officeMode,
    setOfficeMode,
    byState,
    orderedPresence,
    ceoAgentIds,
    isSessionNavigable,
    focusSession,
    agentProfiles,
    ceoDisplayName,
    isCeoOrchestrator
  } = useOfficePageModel();

  return (
    <section className="shell-page shell-page-wide">
      <PageIntro
        eyebrow="Operations"
        title="Office"
        description={`Presence projection from runtime and queue events. Layout: ${officeLayout?.name ?? 'Main Ops Floor'}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setOfficeMode('map')}
              className={`rounded-full px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-all ${
                officeMode === 'map'
                  ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                  : 'shell-button-ghost text-[var(--shell-muted)]'
              }`}
            >
              Basic map
            </button>
            <button
              type="button"
              onClick={() => setOfficeMode('org')}
              className={`rounded-full px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-all ${
                officeMode === 'org'
                  ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                  : 'shell-button-ghost text-[var(--shell-muted)]'
              }`}
            >
              Org chart
            </button>
            <button
              type="button"
              onClick={() => setOfficeMode('board')}
              className={`rounded-full px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-all ${
                officeMode === 'board'
                  ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                  : 'shell-button-ghost text-[var(--shell-muted)]'
              }`}
            >
              Board mode
            </button>
          </div>
        }
        stats={[
          { label: 'Active', value: byState.active ?? 0, tone: (byState.active ?? 0) > 0 ? 'positive' : 'neutral' },
          { label: 'Waiting', value: byState.waiting_input ?? 0, tone: (byState.waiting_input ?? 0) > 0 ? 'warn' : 'neutral' },
          { label: 'Blocked', value: byState.blocked ?? 0, tone: (byState.blocked ?? 0) > 0 ? 'critical' : 'neutral' },
          { label: 'Permissions', value: byState.permission_needed ?? 0, tone: (byState.permission_needed ?? 0) > 0 ? 'warn' : 'neutral' },
          { label: 'Offline', value: byState.offline ?? 0, tone: (byState.offline ?? 0) > 0 ? 'critical' : 'neutral' }
        ]}
      />

      {nonNavigableCount > 0 ? (
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {nonNavigableCount} presence node{nonNavigableCount > 1 ? 's are' : ' is'} context-only and intentionally not openable in Sessions.
        </div>
      ) : null}

      {officeMode === 'map' ? (
        <RetroOfficeSim
          presence={orderedPresence}
          ceoAgentIds={Array.from(ceoAgentIds)}
          isSessionNavigable={isSessionNavigable}
          onSelectSession={focusSession}
        />
      ) : officeMode === 'org' ? (
        <CyberOrgChart
          presence={orderedPresence}
          agentProfiles={agentProfiles}
          ceoAgentIds={Array.from(ceoAgentIds)}
          ceoDisplayName={ceoDisplayName}
          isSessionNavigable={isSessionNavigable}
          onSelectSession={focusSession}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:max-h-[calc(100dvh-16rem)] md:grid-cols-2 md:overflow-y-auto md:pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {orderedPresence.map((presence) => {
            const navigable = isSessionNavigable(presence.sessionId);
            const isCeo = isCeoOrchestrator(presence.agentId);
            const stateLabel = !navigable && !isCeo ? 'context only' : presence.state.replace('_', ' ');
            const stateDotClass = navigable
              ? presence.state === 'active'
                ? 'bg-emerald-500'
                : presence.state === 'waiting_input' || presence.state === 'permission_needed'
                  ? 'bg-amber-500'
                  : 'bg-slate-700'
              : isCeo
                ? 'bg-emerald-500'
                : 'bg-amber-500';
            return (
              <article key={presence.id} className="shell-panel rounded-[2rem] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--shell-accent)]">
                  {isCeoOrchestrator(presence.agentId) ? 'CEO' : presence.agentId}
                </p>
                <p className="mt-1 text-xs text-[var(--shell-muted)]">
                  {agentProfiles.find((profile) => profile.id === presence.agentId)?.title ?? 'Unlabeled role'}
                </p>
                <p className="mt-1 text-sm text-[var(--shell-text)]">Session {presence.sessionId}</p>
                <p className="mt-1 text-xs text-[var(--shell-muted)]">{presence.activityLabel ?? 'No activity label'}</p>
                <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[var(--shell-muted)]">
                  <span className="flex items-center gap-1.5 truncate">
                    <div className={`w-1.5 h-1.5 rounded-full ${stateDotClass}`} />
                    {stateLabel}
                  </span>
                  <button
                    type="button"
                    disabled={!navigable}
                    onClick={() => focusSession(presence.sessionId)}
                    className={`rounded-lg border px-2 py-1 ${
                      navigable
                        ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                        : 'cursor-not-allowed border-white/8 text-[var(--shell-muted)]'
                    }`}
                    title={navigable ? 'Open session in Sessions page' : 'Context-only session; not listed in Sessions'}
                  >
                    {navigable ? 'Focus session' : 'Context only'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
