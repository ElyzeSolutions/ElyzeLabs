import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LazyMotion, domAnimation, m, type Variants } from 'framer-motion';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  Ghost,
  StopCircle,
  WarningCircle,
} from '@phosphor-icons/react';

import { useAppStore } from '../app/store';
import { PageDisclosure, PageIntro } from '../components/ops/PageHeader';
import { boardQueryOptions, sessionsQueryOptions } from '../app/queryOptions';
import type { AppNotification, BoardCard, RunStatus, RuntimeEventRow, SessionRow } from '../app/types';
import { clampCount, formatCompactDateTime, formatRelativeTime } from '../lib/format';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 }
  }
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 180, damping: 24 }
  }
};

const SURFACE_CLASS = 'shell-panel rounded-[2rem]';
const BUTTON_GHOST_CLASS =
  'shell-button-ghost inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium';
const EMPTY_LANES = {
  queued: [],
  running: [],
  waiting_input: [],
  failed: [],
  completed: []
};
const EMPTY_SESSIONS: SessionRow[] = [];

function sortByActivity<T extends { session: SessionRow }>(left: T, right: T): number {
  return new Date(right.session.lastActivityAt).getTime() - new Date(left.session.lastActivityAt).getTime();
}

function sortSessionsByActivity(left: SessionRow, right: SessionRow): number {
  return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
}

function dedupeBoardCards(cards: BoardCard[]): BoardCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.session.id)) {
      return false;
    }
    seen.add(card.session.id);
    return true;
  });
}

function trimCopy(value?: string | null, maxLength = 140): string {
  if (!value) {
    return 'No prompt recorded yet.';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function toneClasses(status: RunStatus | undefined): string {
  switch (status) {
    case 'waiting_input':
      return 'shell-chip shell-chip-warn';
    case 'failed':
    case 'aborted':
      return 'shell-chip shell-chip-danger';
    case 'completed':
      return 'shell-chip shell-chip-accent';
    case 'queued':
      return 'shell-chip';
    case 'running':
    default:
      return 'shell-chip shell-chip-accent';
  }
}

function openCommandPalette(): void {
  window.dispatchEvent(new Event('open-command-palette'));
}

function AttentionRow({
  card,
  onOpen,
  onClear
}: {
  card: BoardCard;
  onOpen: (session: SessionRow) => void;
  onClear: (session: SessionRow) => void;
}) {
  const status = card.run?.status ?? 'running';
  const waiting = status === 'waiting_input';

  return (
    <article className="shell-panel-soft rounded-[1.3rem] px-4 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={['rounded-full border px-2.5 py-1 text-[0.7rem] font-medium', toneClasses(status)].join(' ')}>
            {status.replace('_', ' ')}
          </span>
          <span className="text-[0.74rem] text-[var(--shell-muted)]">{formatRelativeTime(card.session.lastActivityAt)}</span>
        </div>
        <h3 className="mt-3 text-sm font-semibold tracking-tight text-[var(--shell-text)]">{card.session.sessionKey}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--shell-muted)]">
          {waiting ? 'Needs operator input.' : trimCopy(card.run?.error || card.run?.resultSummary || card.run?.prompt, 110)}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button onClick={() => onOpen(card.session)} className={BUTTON_GHOST_CLASS}>
          Open
          <ArrowRight size={14} />
        </button>
        <button
          onClick={() => onClear(card.session)}
          className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-400/10 px-3.5 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/14"
        >
          Clear session
        </button>
      </div>
    </article>
  );
}

function LiveRunRow({
  card,
  onOpen,
  onStop
}: {
  card: BoardCard;
  onOpen: (session: SessionRow) => void;
  onStop: (runId: string) => void;
}) {
  const runId = card.run?.id ?? null;

  return (
    <article className="shell-panel-soft rounded-[1.4rem] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={['rounded-full border px-2.5 py-1 text-[0.7rem] font-medium', toneClasses(card.run?.status)].join(' ')}>
              {card.run?.status?.replace('_', ' ') ?? 'running'}
            </span>
            <span className="text-[0.74rem] text-[var(--shell-muted)]">{card.run?.runtime ?? 'process'}</span>
          </div>
          <h3 className="mt-3 text-sm font-semibold tracking-tight text-[var(--shell-text)]">{card.session.sessionKey}</h3>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--shell-muted)]">{trimCopy(card.run?.prompt, 120)}</p>
        </div>
        {runId ? (
          <button
            onClick={() => onStop(runId)}
            className="shell-button-warn inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full p-0 text-[var(--shell-text)]"
            aria-label={`Stop ${card.session.sessionKey}`}
          >
            <StopCircle size={18} weight="bold" />
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[0.76rem] text-[var(--shell-muted)]">
        <span>{card.session.agentId}</span>
        <span className="text-white/20">•</span>
        <span>{card.queue > 0 ? `Queue ${card.queue}` : 'Foreground lane'}</span>
        <span className="text-white/20">•</span>
        <span>{card.run?.startedAt ? formatRelativeTime(card.run.startedAt) : formatRelativeTime(card.session.lastActivityAt)}</span>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => onOpen(card.session)}
          className={BUTTON_GHOST_CLASS}
        >
          Open session
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

function NotificationPreview({
  notification,
  onOpen
}: {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
}) {
  return (
    <button
      onClick={() => onOpen(notification)}
      className="shell-panel-soft group flex w-full items-start justify-between gap-4 rounded-[1.2rem] px-3.5 py-3 text-left transition-all duration-200 hover:border-white/16 hover:bg-white/[0.04]"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--shell-text)]">{notification.title}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--shell-muted)]">{trimCopy(notification.detail, 105)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[0.7rem] text-[var(--shell-muted)]">{formatRelativeTime(notification.createdAt)}</p>
        <ArrowRight
          size={14}
          className="ml-auto mt-3 text-[var(--shell-muted)] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[var(--shell-text)]"
        />
      </div>
    </button>
  );
}

function HistoryRow({
  card,
  onOpen
}: {
  card: BoardCard;
  onOpen: (session: SessionRow) => void;
}) {
  const status = card.run?.status;

  return (
    <button
      onClick={() => onOpen(card.session)}
      className="shell-panel-soft grid w-full gap-3 rounded-[1.25rem] px-4 py-4 text-left transition-all duration-200 hover:border-white/16 hover:bg-white/[0.04] md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={['rounded-full border px-2.5 py-1 text-[0.7rem] font-medium', toneClasses(status)].join(' ')}>
            {status?.replace('_', ' ') ?? 'completed'}
          </span>
          <span className="text-[0.74rem] text-[var(--shell-muted)]">{formatCompactDateTime(card.session.lastActivityAt)}</span>
        </div>
        <h3 className="mt-3 text-sm font-semibold tracking-tight text-[var(--shell-text)]">{card.session.sessionKey}</h3>
        <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--shell-muted)]">
          {trimCopy(card.run?.resultSummary || card.run?.error || card.run?.prompt, 120)}
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm text-[var(--shell-muted)]">
        {status === 'completed' ? <CheckCircle size={18} weight="duotone" /> : <WarningCircle size={18} weight="duotone" />}
        <span>{card.session.agentId}</span>
      </div>
    </button>
  );
}

function SessionRowLink({
  session,
  onOpen
}: {
  session: SessionRow;
  onOpen: (session: SessionRow) => void;
}) {
  return (
    <button
      onClick={() => onOpen(session)}
      className="group flex w-full items-center justify-between gap-3 border-b border-white/8 py-3 text-left last:border-b-0 last:pb-0 first:pt-0"
    >
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-[var(--shell-text)]">{session.sessionKey}</h3>
        <p className="mt-1 truncate text-sm text-[var(--shell-muted)]">
          {session.agentId} • {session.channel} • {formatRelativeTime(session.lastActivityAt)}
        </p>
      </div>
      <ArrowRight
        size={14}
        className="shrink-0 text-[var(--shell-muted)] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[var(--shell-text)]"
      />
    </button>
  );
}

function EventRow({ event }: { event: RuntimeEventRow }) {
  return (
    <article className="border-b border-white/8 py-3 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[0.76rem] font-semibold tracking-[0.14em] text-[var(--shell-muted)]">{event.kind}</p>
        <span className="shrink-0 text-[0.72rem] text-[var(--shell-muted)]">{formatRelativeTime(event.ts)}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--shell-text)]">{trimCopy(event.message, 150)}</p>
    </article>
  );
}

function EmptyPanel({
  title,
  detail,
  actionLabel,
  onAction
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-36 flex-col items-start justify-center rounded-[1.5rem] border border-dashed border-white/12 bg-white/[0.025] px-5 py-6 sm:min-h-40">
      <Ghost size={28} className="text-[var(--shell-muted)]" weight="duotone" />
      <h3 className="mt-4 text-sm font-semibold text-[var(--shell-text)]">{title}</h3>
      <p className="mt-1 max-w-[48ch] text-sm leading-6 text-[var(--shell-muted)]">{detail}</p>
      {actionLabel && onAction ? (
        <button
          onClick={onAction}
          className={`mt-5 ${BUTTON_GHOST_CLASS}`}
        >
          {actionLabel}
          <ArrowRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

function OverviewHeroSection({
  attentionCount,
  liveCount,
  unreadCount,
  onOpenMissionControl,
  onClearAttention,
  onStopAllLiveRuns
}: {
  attentionCount: number;
  liveCount: number;
  unreadCount: number;
  onOpenMissionControl: () => void;
  onClearAttention: () => void;
  onStopAllLiveRuns: () => void;
}) {
  return (
    <PageIntro
      eyebrow="Operations"
      title="Immediate actions"
      description="Clear stalled sessions, stop live runs, or jump straight into the active queue."
      actions={
        <>
          <button onClick={onOpenMissionControl} className={BUTTON_GHOST_CLASS}>
            Open mission control
            <ArrowRight size={14} />
          </button>
          {attentionCount > 0 ? (
            <button
              onClick={onClearAttention}
              className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-400/10 px-3.5 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/14"
            >
              Clear stalled
            </button>
          ) : null}
          {liveCount > 0 ? (
            <button
              onClick={onStopAllLiveRuns}
              className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/12 px-3.5 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/16"
            >
              Stop live runs
            </button>
          ) : null}
        </>
      }
      stats={[
        {
          label: 'Stalled',
          value: clampCount(attentionCount),
          tone: attentionCount > 0 ? 'warn' : 'neutral'
        },
        {
          label: 'Live',
          value: clampCount(liveCount),
          tone: liveCount > 0 ? 'positive' : 'neutral'
        },
        {
          label: 'Unread',
          value: clampCount(unreadCount),
          tone: unreadCount > 0 ? 'warn' : 'neutral'
        }
      ]}
    />
  );
}

function AttentionSidebar({
  attentionCount,
  attentionCards,
  onOpenSession,
  onOpenOffice,
  onClearSession,
  onClearAll
}: {
  attentionCount: number;
  attentionCards: BoardCard[];
  onOpenSession: (session: SessionRow) => void;
  onOpenOffice: () => void;
  onClearSession: (session: SessionRow) => void;
  onClearAll: () => void;
}) {
  return (
    <aside className={`${SURFACE_CLASS} px-6 py-6 sm:px-7 sm:py-7`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-[var(--shell-text)]">Stalled sessions</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="shell-chip px-3 py-1 text-[0.74rem]">{clampCount(attentionCount)}</span>
          {attentionCards.length > 0 ? (
            <button
              onClick={onClearAll}
              className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-[0.76rem] font-medium text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/14"
            >
              Clear all
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {attentionCards.length === 0 ? (
          <EmptyPanel
            title="No active interventions"
            detail="Waiting-input and failed sessions land here first."
            actionLabel="Open office"
            onAction={onOpenOffice}
          />
        ) : (
          attentionCards.map((card) => (
            <AttentionRow
              key={card.session.id}
              card={card}
              onOpen={onOpenSession}
              onClear={onClearSession}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function LiveExecutionSection({
  liveCards,
  unreadNotifications,
  shiftNote,
  onShiftNoteChange,
  onOpenSession,
  onStopRun,
  onStopAll,
  onOpenMissionControl,
  onOpenBacklog,
  onOpenNotification
}: {
  liveCards: BoardCard[];
  unreadNotifications: AppNotification[];
  shiftNote: string;
  onShiftNoteChange: (value: string) => void;
  onOpenSession: (session: SessionRow) => void;
  onStopRun: (runId: string) => void;
  onStopAll: () => void;
  onOpenMissionControl: () => void;
  onOpenBacklog: () => void;
  onOpenNotification: (notification: AppNotification) => void;
}) {
  return (
    <m.section variants={sectionVariants} className={`${SURFACE_CLASS} overflow-hidden`}>
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.1fr)_minmax(23rem,0.9fr)]">
        <div className="min-w-0 px-6 py-6 sm:px-8 sm:py-8 xl:border-r xl:border-white/8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-medium tracking-tight text-[var(--shell-text)]">Live Runs</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {liveCards.length > 0 ? (
                <button
                  onClick={onStopAll}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/12 px-3.5 py-2 text-sm font-medium text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/16"
                >
                  Stop all
                </button>
              ) : null}
              <button onClick={onOpenMissionControl} className={BUTTON_GHOST_CLASS}>
                Open queue
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {liveCards.length === 0 ? (
              <EmptyPanel
                title="No active runs"
                detail="Everything is quiet right now."
                actionLabel="Open backlog"
                onAction={onOpenBacklog}
              />
            ) : (
              liveCards.map((card) => (
                <LiveRunRow
                  key={card.session.id}
                  card={card}
                  onOpen={onOpenSession}
                  onStop={onStopRun}
                />
              ))
            )}
          </div>
        </div>

        <div className="grid min-w-0 gap-0 border-t border-white/8 xl:border-t-0">
          <div className="min-w-0 px-6 py-6 sm:px-7 sm:py-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium tracking-tight text-[var(--shell-text)]">Unread signals</h3>
              </div>
              <button onClick={openCommandPalette} className={BUTTON_GHOST_CLASS}>
                Search
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {unreadNotifications.length === 0 ? (
                <EmptyPanel
                  title="No unread alerts"
                  detail="Critical runtime changes and intervention events will appear here."
                />
              ) : (
                unreadNotifications.map((notification) => (
                  <NotificationPreview
                    key={notification.id}
                    notification={notification}
                    onOpen={onOpenNotification}
                  />
                ))
              )}
            </div>
          </div>

          <div className="min-w-0 border-t border-white/8 px-6 py-6 sm:px-7 sm:py-7">
            <PageDisclosure
              title="Shift note"
              description="Keep a short handoff note nearby without holding the whole page open."
            >
              <textarea
                value={shiftNote}
                onChange={(event) => onShiftNoteChange(event.target.value)}
                placeholder="Capture a blocker, handoff note, or the next thing to verify."
                className="shell-field min-h-32 w-full rounded-[1.5rem] px-4 py-4 text-sm leading-7 outline-none"
              />
            </PageDisclosure>
          </div>
        </div>
      </div>
    </m.section>
  );
}

function HistoryPulseSection({
  recentHistory,
  recentSessions,
  latestEvents,
  onOpenSession,
  onOpenMissionControl
}: {
  recentHistory: BoardCard[];
  recentSessions: SessionRow[];
  latestEvents: RuntimeEventRow[];
  onOpenSession: (session: SessionRow) => void;
  onOpenMissionControl: () => void;
}) {
  return (
    <m.section variants={sectionVariants} className={`${SURFACE_CLASS} overflow-hidden`}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-0 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="px-6 py-6 sm:px-8 sm:py-8 xl:border-r xl:border-white/8">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div>
              <h2 className="text-xl font-medium tracking-tight text-[var(--shell-text)]">Recent History</h2>
            </div>
            <span className="text-sm text-[var(--shell-muted)]">{recentHistory.length} items</span>
          </div>

          <div className="mt-6 space-y-3">
            {recentHistory.length === 0 ? (
              <EmptyPanel
                title="No recent history"
                detail="Completed and failed runs will appear here."
              />
            ) : (
              recentHistory.map((card) => <HistoryRow key={card.session.id} card={card} onOpen={onOpenSession} />)
            )}
          </div>
        </div>

        <div className="grid gap-0 border-t border-white/8 xl:border-t-0">
          <div className="px-6 py-6 sm:px-7 sm:py-7">
            <h3 className="text-lg font-medium tracking-tight text-[var(--shell-text)]">Recent Sessions</h3>

            <div className="mt-4">
              {recentSessions.length === 0 ? (
                <EmptyPanel
                  title="No sessions yet"
                  detail="Newest sessions will appear here."
                />
              ) : (
                recentSessions.map((session) => <SessionRowLink key={session.id} session={session} onOpen={onOpenSession} />)
              )}
            </div>
          </div>

          <div className="border-t border-white/8 px-6 py-6 sm:px-7 sm:py-7">
            <h3 className="text-lg font-medium tracking-tight text-[var(--shell-text)]">Latest Events</h3>

            <div className="mt-4">
              {latestEvents.length === 0 ? (
                <EmptyPanel
                  title="No recent events"
                  detail="Live telemetry will stream here."
                />
              ) : (
                latestEvents.map((event) => <EventRow key={event.sequence} event={event} />)
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-[var(--shell-muted)]">
              <span className="shell-chip px-3 py-1.5">
                <ClockCounterClockwise size={14} />
                {latestEvents[0] ? formatCompactDateTime(latestEvents[0].ts) : 'No live events'}
              </span>
              <button onClick={onOpenMissionControl} className={BUTTON_GHOST_CLASS}>
                Full stream
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </m.section>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const events = useAppStore((state) => state.events);
  const notifications = useAppStore((state) => state.notifications);
  const token = useAppStore((state) => state.token);
  const deleteSessions = useAppStore((state) => state.deleteSessions);
  const stopRun = useAppStore((state) => state.stopRun);
  const setSearch = useAppStore((state) => state.setSearch);
  const shiftNote = useAppStore((state) => state.shiftNote);
  const setShiftNote = useAppStore((state) => state.setShiftNote);
  const lanes = useQuery(boardQueryOptions(token)).data ?? EMPTY_LANES;
  const sessions = useQuery(sessionsQueryOptions(token)).data ?? EMPTY_SESSIONS;

  const attentionCards = useMemo(
    () => dedupeBoardCards([...lanes.waiting_input, ...lanes.failed]).sort(sortByActivity).slice(0, 4),
    [lanes.failed, lanes.waiting_input]
  );
  const liveCards = useMemo(
    () => [...lanes.running, ...lanes.queued].sort(sortByActivity).slice(0, 4),
    [lanes.queued, lanes.running]
  );
  const recentHistory = useMemo(
    () => [...lanes.failed, ...lanes.completed].sort(sortByActivity).slice(0, 4),
    [lanes.completed, lanes.failed]
  );
  const recentSessions = useMemo(() => [...sessions].sort(sortSessionsByActivity).slice(0, 4), [sessions]);
  const latestEvents = useMemo(() => [...events].slice(-5).reverse(), [events]);
  const unreadNotifications = useMemo(() => notifications.filter((item) => !item.read).slice(0, 3), [notifications]);
  const clearableAttentionSessions = useMemo(() => attentionCards.map((card) => card.session), [attentionCards]);
  const liveRunIds = useMemo(
    () => liveCards.map((card) => card.run?.id ?? '').filter((runId) => runId.length > 0),
    [liveCards]
  );

  const openSession = (session: SessionRow): void => {
    setSearch(session.sessionKey);
    void navigate({ to: '/mission-control' });
  };

  const clearSessions = async (sessionsToClear: SessionRow[], scopeLabel: string): Promise<void> => {
    if (sessionsToClear.length === 0) {
      return;
    }
    const confirmed = window.confirm(
      `Clear ${sessionsToClear.length} ${scopeLabel} session${sessionsToClear.length === 1 ? '' : 's'} from the board? This removes the session thread and related telemetry.`
    );
    if (!confirmed) {
      return;
    }
    const result = await deleteSessions(sessionsToClear.map((session) => session.id));
    if (!result) {
      toast.error('Failed to clear the selected sessions.');
      return;
    }
    toast.success(`Cleared ${result.cleared.sessions} session${result.cleared.sessions === 1 ? '' : 's'}.`);
  };

  const stopAllLiveRuns = async (): Promise<void> => {
    if (liveRunIds.length === 0) {
      return;
    }
    const confirmed = window.confirm(
      `Stop ${liveRunIds.length} live run${liveRunIds.length === 1 ? '' : 's'}?`
    );
    if (!confirmed) {
      return;
    }
    await Promise.all(liveRunIds.map((runId) => stopRun(runId)));
    toast.success(`Stopped ${liveRunIds.length} run${liveRunIds.length === 1 ? '' : 's'}.`);
  };

  const openNotification = (notification: AppNotification): void => {
    if (notification.sessionId) {
      setSearch(notification.sessionId);
    }
    void navigate({ to: (notification.route ?? '/mission-control') as never });
  };

  const liveCount = lanes.running.length + lanes.queued.length;
  const attentionCount = lanes.waiting_input.length + lanes.failed.length;
  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <LazyMotion features={domAnimation}>
      <m.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6 pb-4">
        <m.section variants={sectionVariants} className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <OverviewHeroSection
            attentionCount={attentionCount}
            liveCount={liveCount}
            unreadCount={unreadCount}
            onOpenMissionControl={() => void navigate({ to: '/mission-control' })}
            onClearAttention={() => void clearSessions(clearableAttentionSessions, 'stalled')}
            onStopAllLiveRuns={() => void stopAllLiveRuns()}
          />
          <AttentionSidebar
            attentionCount={attentionCount}
            attentionCards={attentionCards}
            onOpenSession={openSession}
            onOpenOffice={() => void navigate({ to: '/office' })}
            onClearSession={(session) => void clearSessions([session], 'stalled')}
            onClearAll={() => void clearSessions(clearableAttentionSessions, 'stalled')}
          />
        </m.section>
        <LiveExecutionSection
          liveCards={liveCards}
          unreadNotifications={unreadNotifications}
          shiftNote={shiftNote}
          onShiftNoteChange={setShiftNote}
          onOpenSession={openSession}
          onStopRun={(runId) => void stopRun(runId)}
          onStopAll={() => void stopAllLiveRuns()}
          onOpenMissionControl={() => void navigate({ to: '/mission-control' })}
          onOpenBacklog={() => void navigate({ to: '/backlog', search: { query: '', states: [] } })}
          onOpenNotification={openNotification}
        />
        <PageDisclosure
          title="Recent history and events"
          description="Open the extended trail only when you need older runs, recent sessions, or the latest event stream."
        >
          <HistoryPulseSection
            recentHistory={recentHistory}
            recentSessions={recentSessions}
            latestEvents={latestEvents}
            onOpenSession={openSession}
            onOpenMissionControl={() => void navigate({ to: '/mission-control' })}
          />
        </PageDisclosure>
    </m.div>
    </LazyMotion>
  );
}
