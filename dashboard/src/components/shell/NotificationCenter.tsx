import { useEffect, useEffectEvent, useMemo, useRef, useState, startTransition } from 'react';
import { useNavigate } from '@tanstack/react-router';

import {
  Bell,
  Check,
  CheckCircle,
  Info,
  Warning,
  WarningCircle,
  X
} from '@phosphor-icons/react';

import { useAppStore } from '../../app/store';
import type { AppNotification, AppNotificationTone } from '../../app/types';
import { formatCompactDateTime, formatRelativeTime } from '../../lib/format';

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

type NotificationFilter = 'all' | 'unread' | AppNotificationTone;

const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'critical', label: 'Critical' },
  { id: 'warning', label: 'Warnings' },
  { id: 'success', label: 'Success' },
  { id: 'info', label: 'Info' }
];

const TONE_ICON: Record<AppNotificationTone, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: Warning,
  critical: WarningCircle
};

const TONE_CLASS: Record<AppNotificationTone, string> = {
  info: 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]',
  success: 'border-emerald-400/18 bg-emerald-400/8 text-emerald-100',
  warning: 'border-amber-300/18 bg-amber-300/8 text-amber-50',
  critical: 'border-rose-400/18 bg-rose-400/8 text-rose-100'
};

function filterNotifications(items: AppNotification[], filter: NotificationFilter): AppNotification[] {
  if (filter === 'all') {
    return items;
  }
  if (filter === 'unread') {
    return items.filter((item) => !item.read);
  }
  return items.filter((item) => item.tone === filter);
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const navigate = useNavigate();
  const notifications = useAppStore((state) => state.notifications);
  const markNotificationRead = useAppStore((state) => state.markNotificationRead);
  const markAllNotificationsRead = useAppStore((state) => state.markAllNotificationsRead);
  const dismissNotification = useAppStore((state) => state.dismissNotification);
  const clearNotifications = useAppStore((state) => state.clearNotifications);
  const setSearch = useAppStore((state) => state.setSearch);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterNotifications(notifications, filter), [filter, notifications]);
  const unreadCount = notifications.filter((item) => !item.read).length;

  const handleClose = useEffectEvent(() => {
    onClose();
  });

  const handleOutsideClick = useEffectEvent((event: MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
      handleClose();
    }
  });

  const handleEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
    }
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    if (unreadCount > 0) {
      markAllNotificationsRead();
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [markAllNotificationsRead, open, unreadCount]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-transparent">
      <div
        ref={panelRef}
        className="absolute right-4 top-20 w-[min(28rem,calc(100vw-1.5rem))] overflow-hidden rounded-[1.8rem] border border-white/10 bg-[rgba(18,21,29,0.96)] shadow-[0_22px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[var(--shell-text)]">
              <Bell size={16} weight="duotone" />
              <h2 className="text-sm font-semibold">Notifications</h2>
              {notifications.length > 0 ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.7rem] text-[var(--shell-muted)]">
                  {notifications.length}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--shell-muted)]">
              {unreadCount > 0 ? `${unreadCount} unread item${unreadCount > 1 ? 's' : ''}` : 'Everything is caught up'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 ? (
              <>
                <button
                  onClick={markAllNotificationsRead}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/4 text-[var(--shell-muted)] transition-colors hover:border-white/20 hover:text-[var(--shell-text)]"
                  aria-label="Mark all as read"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={clearNotifications}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/4 text-[var(--shell-muted)] transition-colors hover:border-white/20 hover:text-[var(--shell-text)]"
                  aria-label="Clear notifications"
                >
                  <X size={16} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-white/8 px-4 py-3">
          {FILTERS.map((tab) => {
            const active = tab.id === filter;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={[
                  'shrink-0 rounded-full border px-3 py-1.5 text-[0.72rem] font-medium transition-all',
                  active
                    ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]'
                    : 'border-white/10 bg-white/4 text-[var(--shell-muted)] hover:text-[var(--shell-text)]'
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="max-h-[min(65dvh,34rem)] overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-[var(--shell-muted)]">
              <Bell size={28} weight="duotone" />
              <div>
                <p className="font-medium text-[var(--shell-text)]">No notifications in this view</p>
                <p className="mt-1">Important runtime changes, interventions, and reconnect guidance will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((notification) => {
                const Icon = TONE_ICON[notification.tone];
                const clickable = Boolean(notification.route);
                const openNotification = (): void => {
                  if (!notification.route) {
                    return;
                  }
                  markNotificationRead(notification.id);
                  if (notification.sessionId) {
                    setSearch(notification.sessionId);
                  }
                  startTransition(() => navigate({ to: notification.route! as never }));
                  onClose();
                };
                return (
                  <article
                    key={notification.id}
                    className={[
                      'rounded-[1.35rem] border px-4 py-4 transition-all',
                      notification.read ? 'border-white/8 bg-white/[0.03]' : TONE_CLASS[notification.tone],
                      clickable ? 'cursor-pointer hover:border-white/16' : ''
                    ].join(' ')}
                    onClick={clickable ? openNotification : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openNotification();
                            }
                          }
                        : undefined
                    }
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10">
                        <Icon size={18} weight="duotone" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-[var(--shell-text)]">{notification.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-[var(--shell-muted)]">{notification.detail}</p>
                          </div>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              dismissNotification(notification.id);
                            }}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--shell-muted)] transition-colors hover:text-[var(--shell-text)]"
                            aria-label="Dismiss notification"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.72rem] text-[var(--shell-muted)]">
                          <span>{formatRelativeTime(notification.createdAt)}</span>
                          <span className="text-white/20">•</span>
                          <span title={formatCompactDateTime(notification.createdAt)}>{notification.source}</span>
                          {notification.route ? (
                            <>
                              <span className="text-white/20">•</span>
                              <span>{notification.route === '/mission-control' ? 'Open mission control' : 'Open related page'}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
