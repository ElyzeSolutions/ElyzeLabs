import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useCallback, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate, useRouter } from '@tanstack/react-router';

import { onboardingStatusQueryOptions } from './queryOptions';
import { useRealtimeSync } from './realtime';
import { useAppStore } from './store';
import { Shell } from '../components/ops/Shell';

const OnboardingPage = lazy(() => import('../pages/OnboardingPage').then((module) => ({ default: module.OnboardingPage })));

export function RouteFallback() {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 sm:p-7">
      <div className="skeleton h-5 w-32" />
      <div className="mt-5 space-y-3">
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
      </div>
    </section>
  );
}

export function DefaultNotFound() {
  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
      <p className="text-sm font-medium text-white">Route not found</p>
      <Link to="/" preload="intent" className="mt-4 inline-flex items-center justify-center rounded-lg bg-white/5 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/10">
        Return to dashboard
      </Link>
    </section>
  );
}

export function DefaultCatchBoundary({ error }: { error: Error }) {
  const router = useRouter();

  return (
    <section className="rounded-2xl border border-rose-500/10 bg-rose-500/5 p-8 text-center">
      <p className="text-sm font-medium text-white">Route load failed</p>
      <p className="mt-2 text-xs text-[var(--shell-muted)]">{error.message || 'Unexpected route error.'}</p>
      <button
        type="button"
        onClick={() => void router.invalidate()}
        className="mt-4 inline-flex items-center justify-center rounded-lg bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
      >
        Retry route
      </button>
    </section>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useLocation({
    select: (location) => location.pathname
  });

  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const token = useAppStore((state) => state.token);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const runs = useAppStore((state) => state.runs);
  const connection = useAppStore((state) => state.connection);
  const refreshAll = useAppStore((state) => state.refreshAll);
  const refreshBoard = useAppStore((state) => state.refreshBoard);
  const refreshChats = useAppStore((state) => state.refreshChats);
  const stopRun = useAppStore((state) => state.stopRun);
  const onboardingQuery = useQuery({
    ...onboardingStatusQueryOptions(token),
    enabled: hasHydrated && Boolean(token),
    refetchInterval: (query) => (query.state.data?.status === 'ready' ? false : 8_000),
    refetchIntervalInBackground: true
  });
  const onboarding = token ? onboardingQuery.data ?? null : null;
  const onboardingLoading = hasHydrated ? Boolean(token) && onboardingQuery.isPending : true;
  const onboardingError =
    token && onboardingQuery.error
      ? onboardingQuery.error instanceof Error
        ? onboardingQuery.error.message
        : 'Failed to load onboarding status.'
      : null;

  const refreshOnboarding = useCallback(
    async () => {
      if (!hasHydrated) {
        return;
      }
      if (!token) {
        return;
      }
      await queryClient.fetchQuery(onboardingStatusQueryOptions(token));
    },
    [hasHydrated, queryClient, token]
  );

  const handleOnboardingStatusChange = useCallback(
    (nextOnboarding: typeof onboarding) => {
      if (!token) {
        return;
      }
      queryClient.setQueryData(onboardingStatusQueryOptions(token).queryKey, nextOnboarding ?? undefined);
    },
    [queryClient, token]
  );

  const onboardingGate = useMemo<'pending' | 'locked' | 'ready'>(() => {
    if (!hasHydrated) {
      return 'pending';
    }
    if (!token) {
      return 'locked';
    }
    if (onboardingLoading && onboarding === null && !onboardingError) {
      return 'pending';
    }
    if (onboarding?.status === 'ready') {
      return 'ready';
    }
    return 'locked';
  }, [hasHydrated, onboarding, onboardingError, onboardingLoading, token]);
  const onboardingPending = onboardingGate === 'pending';
  const onboardingLocked = onboardingGate === 'locked';

  const pauseRealtime = Boolean(error && error.includes('API proxy could not reach gateway'));
  useRealtimeSync(hasHydrated && !pauseRealtime && !onboardingLocked && !onboardingPending, token);

  useEffect(() => {
    if (onboardingPending) {
      return;
    }

    if (onboardingLocked) {
      if (pathname !== '/onboarding') {
        void navigate({ to: '/onboarding', replace: true });
      }
      return;
    }
  }, [navigate, onboardingLocked, onboardingPending, pathname]);

  useEffect(() => {
    if (onboardingLocked || onboardingPending) {
      return;
    }
    void refreshAll();
  }, [onboardingLocked, onboardingPending, refreshAll]);

  useEffect(() => {
    if (onboardingLocked || onboardingPending) {
      return undefined;
    }

    const onKeydown = (event: KeyboardEvent): void => {
      if (!event.shiftKey) {
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        const runningRun = runs.find((run) => run.status === 'running' || run.status === 'waiting_input');
        if (runningRun) {
          void stopRun(runningRun.id);
        }
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        void Promise.all([refreshBoard(), refreshChats()]);
      }

      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void navigate({ to: '/office' });
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('keydown', onKeydown);
    };
  }, [navigate, onboardingLocked, onboardingPending, refreshBoard, refreshChats, runs, stopRun]);

  if (onboardingGate === 'pending') {
    return (
      <Shell connection={connection} mode="onboarding">
        <section className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6">
          <p className="text-sm text-slate-300">Checking onboarding status...</p>
        </section>
      </Shell>
    );
  }

  if (onboardingGate === 'locked') {
    return (
      <Shell connection={connection} mode="onboarding">
        {onboardingError ? (
          <section className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-100">
            {onboardingError}
          </section>
        ) : null}
        <Suspense fallback={<RouteFallback />}>
          <OnboardingPage
            focused
            onboarding={onboarding}
            onboardingLoading={onboardingLoading}
            onboardingError={onboardingError}
            onRefresh={refreshOnboarding}
            onStatusChange={handleOnboardingStatusChange}
          />
        </Suspense>
      </Shell>
    );
  }

  return (
    <Shell connection={connection} mode="default">
      {loading ? (
        <section className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6">
          <p className="text-sm text-slate-300">Loading control-plane telemetry...</p>
        </section>
      ) : null}

      {error ? (
        <section className="rounded-3xl border border-rose-800/80 bg-rose-950/25 p-4 text-sm text-rose-200">{error}</section>
      ) : null}

      <Outlet />
    </Shell>
  );
}
