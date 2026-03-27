import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useMatchRoute } from '@tanstack/react-router';

import {
  ArrowsClockwise,
  Bell,
  CaretLeft,
  CaretRight,
  Command,
  List,
  MagnifyingGlass,
  Sparkle,
  Waveform
} from '@phosphor-icons/react';

import { FOOTER_NAV, NAV_SECTIONS, getRouteMeta, type NavIcon } from '../../app/navigation';
import { useAppStore, type ConnectionState } from '../../app/store';
import { clampCount } from '../../lib/format';
import { CommandPalette } from '../shell/CommandPalette';
import { NotificationCenter } from '../shell/NotificationCenter';
import { RouteHeaderMetricsContext } from '../shell/RouteHeaderContext';

const CONNECTION_COPY: Record<
  ConnectionState,
  { label: string; detail: string; tone: string; dot: string }
> = {
  connected: {
    label: 'Live',
    detail: 'Realtime updates are flowing.',
    tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
    dot: 'bg-emerald-300'
  },
  connecting: {
    label: 'Connecting',
    detail: 'Opening a fresh event stream.',
    tone: 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]',
    dot: 'bg-[color:var(--shell-accent)]'
  },
  reconnecting: {
    label: 'Reconnecting',
    detail: 'Retrying after a dropped stream.',
    tone: 'border-amber-300/20 bg-amber-300/10 text-amber-50',
    dot: 'bg-amber-200'
  },
  cooldown: {
    label: 'Cooldown',
    detail: 'Retry limit reached. Waiting before the next attempt.',
    tone: 'border-amber-300/20 bg-amber-300/10 text-amber-50',
    dot: 'bg-amber-200'
  },
  manual_recover: {
    label: 'Reconnect',
    detail: 'Use the reconnect action to restore live updates.',
    tone: 'border-rose-400/20 bg-rose-400/10 text-rose-100',
    dot: 'bg-rose-300'
  },
  disconnected: {
    label: 'Offline',
    detail: 'Realtime sync is paused.',
    tone: 'border-white/10 bg-white/5 text-[var(--shell-text)]',
    dot: 'bg-white/30'
  }
};

interface ShellProps {
  children: ReactNode;
  connection: ConnectionState;
  mode?: 'default' | 'onboarding';
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}

function useIsCompactHeight(): boolean {
  return useMediaQuery('(max-height: 900px)');
}

function ShellNavItem({
  to,
  label,
  icon: Icon,
  collapsed,
  compact,
  onNavigate
}: {
  to: string;
  label: string;
  icon: NavIcon;
  collapsed: boolean;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const matchRoute = useMatchRoute();
  const isActive = Boolean(matchRoute({ to, fuzzy: to !== '/' }));

  return (
    <Link
      to={to}
      preload="intent"
      onClick={onNavigate}
      className={[
        'group flex items-center transition-all duration-300 outline-none',
        collapsed ? 'mx-auto h-11 w-11 justify-center rounded-2xl' : compact ? 'gap-2.5 rounded-xl px-2.5 py-1.5' : 'gap-3 rounded-2xl px-3 py-2.5',
        isActive
          ? 'bg-[var(--shell-text)] text-[var(--shell-bg)]'
          : 'text-[var(--shell-muted)] hover:bg-white/5 hover:text-[var(--shell-text)] focus-visible:bg-white/5 focus-visible:text-[var(--shell-text)] focus-visible:ring-2 focus-visible:ring-white/20'
      ].join(' ')}
    >
      <span className="flex shrink-0 items-center justify-center">
        <Icon size={18} weight={isActive ? 'fill' : 'regular'} />
      </span>
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.85rem] font-medium tracking-wide">{label}</span>
        </span>
      ) : null}
    </Link>
  );
}

function useShellModel({
  connection,
  mode = 'default'
}: Omit<ShellProps, 'children'>) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const isMobile = useIsMobile();
  const isCompactHeight = useIsCompactHeight();
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebarCollapsed = useAppStore((state) => state.toggleSidebarCollapsed);
  const refreshAll = useAppStore((state) => state.refreshAll);
  const triggerReconnect = useAppStore((state) => state.triggerReconnect);
  const notifications = useAppStore((state) => state.notifications);
  const lanes = useAppStore((state) => state.lanes);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const unreadCount = notifications.filter((item) => !item.read).length;
  const routeMeta = getRouteMeta(pathname);
  const onboardingMode = mode === 'onboarding';
  const collapsed = !isMobile && sidebarCollapsed;
  const connectionCopy = CONNECTION_COPY[connection];
  const signalCount = lanes.waiting_input.length + lanes.failed.length;
  const liveCount = lanes.running.length + lanes.queued.length;
  const setHeaderMetricsOverride = useCallback(() => {}, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
    }
  }, [isMobile]);

  const openPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);

  const openNotifications = useCallback(() => {
    setNotificationOpen(true);
  }, []);

  useEffect(() => {
    const handleGlobalKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openNotifications();
      }
    };

    const handleOpenPaletteEvent: EventListener = () => {
      openPalette();
    };

    const handleOpenNotificationsEvent: EventListener = () => {
      openNotifications();
    };

    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('open-command-palette', handleOpenPaletteEvent);
    window.addEventListener('open-notifications', handleOpenNotificationsEvent);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('open-command-palette', handleOpenPaletteEvent);
      window.removeEventListener('open-notifications', handleOpenNotificationsEvent);
    };
  }, [openNotifications, openPalette]);

  return {
    connectionCopy,
    onboardingMode,
    routeMeta,
    setHeaderMetricsOverride,
    isMobile,
    isCompactHeight,
    mobileNavOpen,
    setMobileNavOpen,
    collapsed,
    toggleSidebarCollapsed,
    openPalette,
    openNotifications,
    unreadCount,
    refreshAll,
    triggerReconnect,
    paletteOpen,
    setPaletteOpen,
    notificationOpen,
    setNotificationOpen,
    signalCount,
    liveCount
  };
}

export function Shell({ children, connection, mode = 'default' }: ShellProps) {
  const {
    connectionCopy,
    onboardingMode,
    routeMeta,
    setHeaderMetricsOverride,
    isMobile,
    isCompactHeight,
    mobileNavOpen,
    setMobileNavOpen,
    collapsed,
    toggleSidebarCollapsed,
    openPalette,
    openNotifications,
    unreadCount,
    refreshAll,
    triggerReconnect,
    paletteOpen,
    setPaletteOpen,
    notificationOpen,
    setNotificationOpen,
    signalCount,
    liveCount
  } = useShellModel({ connection, mode });

  if (onboardingMode) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden bg-[var(--shell-bg)] text-[var(--shell-text)]">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(130,200,160,0.14),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(222,190,120,0.12),transparent_28%)]" />
        <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[72rem] flex-col px-5 py-8 sm:px-8 lg:px-10">
          <header className="mb-8 flex items-center justify-between rounded-[1.6rem] border border-white/8 bg-white/[0.03] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div>
              <p className="text-[0.72rem] font-semibold tracking-[0.18em] text-[var(--shell-muted)]">ELYZE LABS</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">Control plane setup</h1>
            </div>
            <span className={['inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.78rem]', connectionCopy.tone].join(' ')}>
              <span className={['h-2 w-2 rounded-full', connectionCopy.dot].join(' ')} />
              {connectionCopy.label}
            </span>
          </header>
          <main id="app-main" className="flex-1">
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[var(--shell-bg)] text-[var(--shell-text)]">
      <RouteHeaderMetricsContext.Provider value={setHeaderMetricsOverride}>
        <a
          href="#app-main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full bg-white px-4 py-2 text-black"
        >
          Skip to content
        </a>

        <div className="relative mx-auto flex h-[100dvh] min-h-0 w-full">
          {isMobile && mobileNavOpen ? (
            <button
              type="button"
              aria-label="Close navigation"
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
          ) : null}

          <aside
            className={[
              'fixed inset-y-0 left-0 z-40 flex min-h-[100dvh] flex-col border-r border-white/5 bg-[var(--shell-bg)] transition-all duration-300 lg:sticky',
              collapsed ? 'w-[5.5rem]' : isMobile ? 'w-[min(88vw,19rem)]' : 'w-[17rem]',
              isMobile
                ? mobileNavOpen
                  ? 'translate-x-0'
                  : '-translate-x-full'
                : 'translate-x-0',
              isMobile && mobileNavOpen ? 'shadow-[0_18px_60px_rgba(0,0,0,0.42)]' : ''
            ].join(' ')}
          >
            <div className="flex h-[3.75rem] shrink-0 items-center border-b border-white/6 px-4 py-3">
              <div
                className={[
                  'flex items-center gap-2.5',
                  collapsed ? 'mx-auto justify-center' : 'w-full'
                ].join(' ')}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <Waveform size={14} weight="bold" />
                </span>
                {!collapsed ? (
                  <h2 className="truncate text-[0.9rem] font-semibold tracking-tight text-white">Elyze</h2>
                ) : null}
              </div>
            </div>

            <div className={['shell-sidebar-nav flex-1 overflow-y-auto px-3 pb-4 pt-2', isCompactHeight ? 'pr-1' : 'pr-2'].join(' ')}>
              <div className={['mb-4 flex items-center', collapsed ? 'justify-center' : isCompactHeight ? 'gap-2 px-1' : 'gap-2 px-1 mt-2'].join(' ')}>
                {!isMobile ? (
                  <button
                    onClick={toggleSidebarCollapsed}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--shell-muted)] hover:bg-white/5 hover:text-[var(--shell-text)] transition-colors"
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    {collapsed ? <CaretRight size={16} /> : <CaretLeft size={16} />}
                  </button>
                ) : null}
                {!collapsed && !isCompactHeight ? (
                  <button
                    onClick={openPalette}
                    className="flex flex-1 items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-left text-[0.8rem] text-[var(--shell-muted)] hover:bg-white/10 hover:text-[var(--shell-text)] transition-colors"
                  >
                    <MagnifyingGlass size={14} />
                    <span className="flex-1">Search...</span>
                    <span className="inline-flex items-center gap-0.5 rounded text-[0.65rem] font-medium tracking-widest text-[var(--shell-muted)] opacity-70">
                      <Command size={10} />
                      K
                    </span>
                  </button>
                ) : null}
              </div>

              {!collapsed && !isCompactHeight ? (
                <div className="mb-6 grid grid-cols-2 gap-2 px-1">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--shell-muted)] opacity-60">Attention</p>
                    <p className="mt-0.5 text-lg font-medium text-white">{clampCount(signalCount)}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--shell-muted)] opacity-60">Live</p>
                    <p className="mt-0.5 text-lg font-medium text-white">{clampCount(liveCount)}</p>
                  </div>
                </div>
              ) : null}

              <nav className={collapsed ? 'space-y-3' : isCompactHeight ? 'space-y-4' : 'space-y-7'}>
                {NAV_SECTIONS.map((section) => (
                  <section key={section.id}>
                    {!collapsed ? (
                      <h3 className={['px-3 font-semibold uppercase tracking-[0.15em] text-[var(--shell-muted)] opacity-70', isCompactHeight ? 'mb-1.5 text-[0.6rem]' : 'mb-3 text-[0.65rem]'].join(' ')}>
                        {section.label}
                      </h3>
                    ) : null}
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <ShellNavItem
                          key={item.to}
                          to={item.to}
                          label={item.label}
                          icon={item.icon}
                          collapsed={collapsed}
                          compact={isCompactHeight}
                          onNavigate={() => setMobileNavOpen(false)}
                        />
                      ))}
                    </div>
                  </section>
                ))}

                <section>
                  {!collapsed ? (
                    <h3 className={['mt-5 px-3 font-semibold uppercase tracking-[0.15em] text-[var(--shell-muted)] opacity-70', isCompactHeight ? 'mb-1.5 text-[0.6rem]' : 'mb-3 text-[0.65rem]'].join(' ')}>
                      System
                    </h3>
                  ) : <div className="mt-6" />}
                  <div className="space-y-1">
                    {FOOTER_NAV.map((item) => (
                      <ShellNavItem
                        key={item.to}
                        to={item.to}
                        label={item.label}
                        icon={item.icon}
                        collapsed={collapsed}
                        compact={isCompactHeight}
                        onNavigate={() => setMobileNavOpen(false)}
                      />
                    ))}
                  </div>
                </section>
              </nav>

              <div className={['border-t border-white/5', isCompactHeight ? 'mt-5 pb-2 pt-3' : 'mt-10 pb-4 pt-6'].join(' ')}>
                <div
                  className={[
                    'flex items-center',
                    collapsed ? 'justify-center' : 'gap-3 px-3'
                  ].join(' ')}
                >
                  <div className="relative flex h-3 w-3 items-center justify-center">
                    <span className={['absolute inline-flex h-full w-full animate-ping rounded-full opacity-40', connectionCopy.dot].join(' ')}></span>
                    <span className={['relative inline-flex h-2 w-2 rounded-full', connectionCopy.dot].join(' ')}></span>
                  </div>
                  {!collapsed ? (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8rem] font-medium text-[var(--shell-text)]">{connectionCopy.label}</p>
                      <p className="truncate text-[0.7rem] text-[var(--shell-muted)]">{connectionCopy.detail}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </aside>

          <div className="flex h-[100dvh] min-h-0 min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-white/5 bg-[var(--shell-bg)]/80 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 md:px-6 md:py-4">
              <div className="flex min-w-0 items-center gap-4">
                {isMobile ? (
                  <button
                    onClick={() => setMobileNavOpen(true)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--shell-text)] hover:bg-white/5"
                    aria-label="Open navigation"
                  >
                    <List size={18} />
                  </button>
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-[var(--shell-muted)] opacity-70">
                    {routeMeta.section}
                  </p>
                  <h1 className="mt-0.5 truncate text-[1.1rem] font-medium tracking-tight text-white">{routeMeta.label}</h1>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                {connection === 'manual_recover' ? (
                  <button
                    onClick={triggerReconnect}
                    className="hidden items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-white/90 sm:inline-flex"
                  >
                    <Sparkle size={14} />
                    Reconnect
                  </button>
                ) : null}

                <button
                  onClick={() => void refreshAll()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--shell-muted)] transition-colors hover:bg-white/5 hover:text-[var(--shell-text)]"
                  aria-label="Refresh all data"
                >
                  <ArrowsClockwise size={16} />
                </button>

                <button
                  onClick={openNotifications}
                  className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--shell-muted)] transition-colors hover:bg-white/5 hover:text-[var(--shell-text)]"
                  aria-label="Open notifications"
                >
                  <Bell size={16} />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[0.6rem] font-bold text-black">
                      {clampCount(unreadCount)}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>

            </header>

            <main id="app-main" className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-5 lg:py-6">
              <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col">{children}</div>
            </main>
          </div>
        </div>

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <NotificationCenter open={notificationOpen} onClose={() => setNotificationOpen(false)} />
      </RouteHeaderMetricsContext.Provider>
    </div>
  );
}
