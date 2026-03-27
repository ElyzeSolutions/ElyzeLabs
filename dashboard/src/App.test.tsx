// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';
import { createDashboardQueryClient } from './app/queryClient';

const {
  fetchBoardMock,
  fetchMetricsMock,
  fetchOnboardingStatusMock,
  fetchSessionsMock,
  fetchToolsDiagnosticsMock,
  fetchVaultStatusMock,
  useRealtimeSyncMock,
  storeState
} = vi.hoisted(() => ({
  fetchBoardMock: vi.fn(),
  fetchMetricsMock: vi.fn(),
  fetchOnboardingStatusMock: vi.fn(),
  fetchSessionsMock: vi.fn(),
  fetchToolsDiagnosticsMock: vi.fn(),
  fetchVaultStatusMock: vi.fn(),
  useRealtimeSyncMock: vi.fn(),
  storeState: {
    hasHydrated: true,
    token: '',
    loading: false,
    error: null as string | null,
    metrics: [] as Array<{ id: string; label: string; value: number; displayValue: string; tone: 'neutral' }>,
    runs: [] as Array<{ id: string; status: string }>,
    connection: 'connected' as const,
    refreshAll: vi.fn(async () => undefined),
    refreshBoard: vi.fn(async () => undefined),
    refreshChats: vi.fn(async () => undefined),
    stopRun: vi.fn(async () => undefined)
  }
}));

vi.mock('./app/api', () => ({
  fetchBoard: fetchBoardMock,
  fetchMetrics: fetchMetricsMock,
  fetchOnboardingStatus: fetchOnboardingStatusMock,
  fetchSessions: fetchSessionsMock,
  fetchToolsDiagnostics: fetchToolsDiagnosticsMock,
  fetchVaultStatus: fetchVaultStatusMock
}));

vi.mock('./app/realtime', () => ({
  useRealtimeSync: useRealtimeSyncMock
}));

vi.mock('./app/store', () => ({
  useAppStore: Object.assign(
    <T,>(selector: (state: typeof storeState) => T): T => selector(storeState),
    {
      getState: (): typeof storeState => storeState
    }
  )
}));

vi.mock('./components/ops/Shell', () => ({
  Shell: ({ children, mode }: { children: ReactNode; mode: string }) => (
    <div data-testid={`shell-${mode}`}>{children}</div>
  )
}));

vi.mock('./pages/DashboardPage', () => ({
  DashboardPage: () => <div>Dashboard route</div>
}));

vi.mock('./pages/OnboardingPage', () => ({
  OnboardingPage: () => <div>Onboarding route</div>
}));

vi.mock('sonner', () => ({
  Toaster: () => null
}));

describe('App', () => {
  function renderApp() {
    return render(
      <QueryClientProvider client={createDashboardQueryClient()}>
        <App />
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    window.history.pushState({}, '', '/');
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: vi.fn()
    });
    storeState.hasHydrated = true;
    storeState.token = '';
    storeState.loading = false;
    storeState.error = null;
    storeState.runs = [];
    storeState.refreshAll.mockReset();
    storeState.refreshBoard.mockReset();
    storeState.refreshChats.mockReset();
    storeState.stopRun.mockReset();
    fetchBoardMock.mockReset();
    fetchBoardMock.mockResolvedValue({
      queued: [],
      running: [],
      waiting_input: [],
      failed: [],
      completed: []
    });
    fetchMetricsMock.mockReset();
    fetchMetricsMock.mockResolvedValue([]);
    fetchOnboardingStatusMock.mockReset();
    fetchSessionsMock.mockReset();
    fetchSessionsMock.mockResolvedValue([]);
    fetchToolsDiagnosticsMock.mockReset();
    fetchToolsDiagnosticsMock.mockResolvedValue({});
    fetchVaultStatusMock.mockReset();
    fetchVaultStatusMock.mockResolvedValue({
      enabled: true,
      initialized: false,
      locked: true,
      secretCount: 0
    });
    useRealtimeSyncMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('routes locked installs to onboarding without polling onboarding status', async () => {
    renderApp();

    expect(await screen.findByText('Onboarding route')).toBeInTheDocument();
    expect(fetchOnboardingStatusMock).not.toHaveBeenCalled();
    expect(useRealtimeSyncMock).toHaveBeenCalledWith(false, '');
  });

  it('loads the dashboard routes after onboarding is ready', async () => {
    storeState.token = 'token-123';
    fetchOnboardingStatusMock.mockResolvedValue({
      status: 'ready'
    });

    renderApp();

    expect(await screen.findByText('Dashboard route')).toBeInTheDocument();
    await waitFor(() => expect(fetchOnboardingStatusMock).toHaveBeenCalledWith('token-123'));
    expect(storeState.refreshAll).toHaveBeenCalled();
    expect(useRealtimeSyncMock).toHaveBeenLastCalledWith(true, 'token-123');
  });

  it('keeps onboarding accessible after onboarding is ready', async () => {
    window.history.pushState({}, '', '/onboarding');
    storeState.token = 'token-123';
    fetchOnboardingStatusMock.mockResolvedValue({
      status: 'ready'
    });

    renderApp();

    expect(await screen.findByText('Onboarding route')).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/onboarding'));
  });
});
