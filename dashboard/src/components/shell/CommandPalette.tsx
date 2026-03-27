import type { ComponentType, RefObject } from 'react';
import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState, startTransition } from 'react';
import { useNavigate } from '@tanstack/react-router';

import type { IconProps } from '@phosphor-icons/react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  CaretDown,
  CaretUp,
  ClockCounterClockwise,
  DotsThreeCircle,
  GridFour,
  MagnifyingGlass,
  Robot,
  Rows,
  Sparkle,
  WarningCircle,
  Waveform
} from '@phosphor-icons/react';

import { FOOTER_NAV, NAV_SECTIONS } from '../../app/navigation';
import { useAppStore } from '../../app/store';
import type { BoardCard, SessionRow } from '../../app/types';
import { formatRelativeTime } from '../../lib/format';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  group: string;
  icon: ComponentType<IconProps>;
  action: () => void;
}

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

function sortByRecency(left: SessionRow, right: SessionRow): number {
  return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
}

function makeSessionAction(
  session: SessionRow,
  navigate: ReturnType<typeof useNavigate>,
  setSearch: (value: string) => void,
  onClose: () => void
): () => void {
  return () => {
    startTransition(() => {
      setSearch(session.sessionKey);
      navigate({ to: '/mission-control' });
    });
    onClose();
  };
}

function PaletteSearchField({
  query,
  inputRef,
  items,
  activeIndex,
  onQueryChange,
  onActiveIndexChange
}: {
  query: string;
  inputRef: RefObject<HTMLInputElement | null>;
  items: PaletteItem[];
  activeIndex: number;
  onQueryChange: (value: string) => void;
  onActiveIndexChange: (value: number | ((current: number) => number)) => void;
}) {
  return (
    <div className="border-b border-white/8 px-5 py-4">
      <label className="flex items-center gap-3 rounded-[1.25rem] border border-white/8 bg-white/4 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <MagnifyingGlass size={18} className="text-[var(--shell-muted)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              onActiveIndexChange((current) => (current + 1) % Math.max(items.length, 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              onActiveIndexChange((current) => (current - 1 + items.length) % Math.max(items.length, 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              items[activeIndex]?.action();
            }
          }}
          placeholder="Search pages, sessions, agents, or quick actions"
          className="w-full bg-transparent text-sm text-[var(--shell-text)] outline-none placeholder:text-[var(--shell-muted)]"
        />
        <span className="hidden rounded-full border border-white/10 bg-white/4 px-2 py-1 text-[0.65rem] font-medium tracking-[0.08em] text-[var(--shell-muted)] sm:inline-flex">
          ESC
        </span>
      </label>
    </div>
  );
}

function PaletteResultGroups({
  groups,
  activeIndex,
  resultsRef,
  onActiveIndexChange
}: {
  groups: Array<{ label: string; items: Array<PaletteItem & { globalIndex: number }> }>;
  activeIndex: number;
  resultsRef: RefObject<HTMLDivElement | null>;
  onActiveIndexChange: (value: number) => void;
}) {
  return (
    <div ref={resultsRef} className="max-h-[min(65dvh,44rem)] overflow-y-auto px-2 py-3">
      {groups.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[var(--shell-muted)]">
          <GridFour size={28} weight="duotone" />
          <div>
            <p className="font-medium text-[var(--shell-text)]">Nothing matched that query</p>
            <p className="mt-1">Try a route name, session key, agent name, or quick action.</p>
          </div>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="px-1 pb-2">
            <div className="px-3 pb-2 pt-1 text-[0.68rem] font-semibold tracking-[0.12em] text-[var(--shell-muted)]">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = item.globalIndex === activeIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    data-index={item.globalIndex}
                    onMouseEnter={() => onActiveIndexChange(item.globalIndex)}
                    onClick={item.action}
                    className={[
                      'flex w-full items-start gap-3 rounded-[1.15rem] px-3 py-3 text-left transition-all duration-200',
                      isActive
                        ? 'bg-[color:var(--shell-accent-soft)] text-[var(--shell-text)]'
                        : 'text-[var(--shell-text)] hover:bg-white/5'
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] border',
                        isActive
                          ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                          : 'border-white/8 bg-white/4 text-[var(--shell-muted)]'
                      ].join(' ')}
                    >
                      <Icon size={18} weight="duotone" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.label}</span>
                      <span className="mt-1 block truncate text-sm text-[var(--shell-muted)]">{item.hint}</span>
                    </span>
                    {isActive ? (
                      <span className="mt-1 flex items-center gap-1 text-[0.68rem] text-[var(--shell-muted)]">
                        <CaretUp size={10} />
                        <CaretDown size={10} />
                        <ArrowSquareOut size={12} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function PaletteFooter() {
  return (
    <div className="flex items-center justify-between border-t border-white/8 px-4 py-3 text-[0.72rem] text-[var(--shell-muted)]">
      <span className="inline-flex items-center gap-2">
        <ClockCounterClockwise size={14} />
        Use arrow keys to move and Enter to act
      </span>
      <span className="hidden items-center gap-2 sm:inline-flex">
        <Waveform size={14} />
        Mission control results scope to the selected session
      </span>
    </div>
  );
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const refreshAll = useAppStore((state) => state.refreshAll);
  const triggerReconnect = useAppStore((state) => state.triggerReconnect);
  const setSearch = useAppStore((state) => state.setSearch);
  const sessions = useAppStore((state) => state.sessions);
  const agentProfiles = useAppStore((state) => state.agentProfiles);
  const lanes = useAppStore((state) => state.lanes);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const needsAttention = useMemo(() => {
    const queued = [...lanes.waiting_input, ...lanes.failed];
    const seen = new Set<string>();
    return queued.filter((card) => {
      if (seen.has(card.session.id)) {
        return false;
      }
      seen.add(card.session.id);
      return true;
    });
  }, [lanes.failed, lanes.waiting_input]);

  const navItems = useMemo<PaletteItem[]>(() => {
    const entries = [...NAV_SECTIONS.flatMap((section) => section.items), ...FOOTER_NAV];
    return entries.map((item) => ({
      id: `nav:${item.to}`,
      label: item.label,
      hint: item.description,
      group: 'Navigate',
      icon: item.icon,
      action: () => {
        startTransition(() => navigate({ to: item.to as never }));
        onClose();
      }
    }));
  }, [navigate, onClose]);

  const actionItems = useMemo<PaletteItem[]>(
    () => [
      {
        id: 'action:refresh',
        label: 'Refresh everything',
        hint: 'Pull the latest board, chats, office, skills, tools, and vault state.',
        group: 'Actions',
        icon: ArrowsClockwise,
        action: () => {
          void refreshAll();
          onClose();
        }
      },
      {
        id: 'action:reconnect',
        label: 'Reconnect live stream',
        hint: 'Ask the realtime layer to start a new connection cycle.',
        group: 'Actions',
        icon: Sparkle,
        action: () => {
          triggerReconnect();
          onClose();
        }
      },
      {
        id: 'action:office',
        label: 'Open office',
        hint: 'Jump straight to live presence and activity hotspots.',
        group: 'Actions',
        icon: DotsThreeCircle,
        action: () => {
          startTransition(() => navigate({ to: '/office' }));
          onClose();
        }
      },
      {
        id: 'action:backlog',
        label: 'Open backlog',
        hint: 'Review scoped work, blockers, and delivery truth labels.',
        group: 'Actions',
        icon: Rows,
        action: () => {
          startTransition(() => navigate({ to: '/backlog', search: { query: '', states: [] } }));
          onClose();
        }
      }
    ],
    [navigate, onClose, refreshAll, triggerReconnect]
  );

  const sessionItems = useMemo<PaletteItem[]>(() => {
    const sorted = [...sessions].sort(sortByRecency);
    return sorted.slice(0, 24).map((session) => ({
      id: `session:${session.id}`,
      label: session.sessionKey,
      hint: `${session.agentId} • ${session.channel} • ${formatRelativeTime(session.lastActivityAt)}`,
      group: 'Sessions',
      icon: Waveform,
      action: makeSessionAction(session, navigate, setSearch, onClose)
    }));
  }, [navigate, onClose, sessions, setSearch]);

  const attentionItems = useMemo<PaletteItem[]>(() => {
    return needsAttention.map((card: BoardCard) => ({
      id: `attention:${card.session.id}`,
      label: card.session.sessionKey,
      hint:
        card.run?.status === 'waiting_input'
          ? 'Waiting for operator input'
          : card.run?.error?.trim() || 'Run failed and needs review',
      group: 'Needs attention',
      icon: WarningCircle,
      action: makeSessionAction(card.session, navigate, setSearch, onClose)
    }));
  }, [navigate, needsAttention, onClose, setSearch]);

  const agentItems = useMemo<PaletteItem[]>(() => {
    return agentProfiles.slice(0, 24).map((agent) => ({
      id: `agent:${agent.id}`,
      label: agent.name,
      hint: `${agent.title} • ${agent.defaultRuntime} • ${agent.enabled ? 'enabled' : 'disabled'}`,
      group: 'Agents',
      icon: Robot,
      action: () => {
        startTransition(() => navigate({ to: '/agents' }));
        onClose();
      }
    }));
  }, [agentProfiles, navigate, onClose]);

  const items = useMemo(() => {
    const allItems = [...attentionItems, ...actionItems, ...sessionItems, ...agentItems, ...navItems];
    if (!deferredQuery) {
      return allItems;
    }

    return allItems.filter((item) =>
      matchesQuery(`${item.label} ${item.hint} ${item.group}`, deferredQuery)
    );
  }, [actionItems, agentItems, attentionItems, deferredQuery, navItems, sessionItems]);

  const groups = useMemo(() => {
    const grouped: Array<{ label: string; items: Array<PaletteItem & { globalIndex: number }> }> = [];
    items.forEach((item, index) => {
      const existing = grouped.find((group) => group.label === item.group);
      if (existing) {
        existing.items.push({ ...item, globalIndex: index });
        return;
      }
      grouped.push({
        label: item.group,
        items: [{ ...item, globalIndex: index }]
      });
    });
    return grouped;
  }, [items]);

  const handleClose = useEffectEvent(() => {
    onClose();
  });

  const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
    if (!open) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
    }
  });

  useEffect(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(items.length - 1, 0)));
  }, [items.length]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const activeElement = resultsRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    activeElement?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-[rgba(15,18,24,0.56)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative mx-auto mt-[10dvh] w-[min(52rem,calc(100%-1.5rem))] overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(17,20,27,0.94)] shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
        <PaletteSearchField
          query={query}
          inputRef={inputRef}
          items={items}
          activeIndex={activeIndex}
          onQueryChange={setQuery}
          onActiveIndexChange={setActiveIndex}
        />
        <PaletteResultGroups
          groups={groups}
          activeIndex={activeIndex}
          resultsRef={resultsRef}
          onActiveIndexChange={setActiveIndex}
        />
        <PaletteFooter />
      </div>
    </div>
  );
}
