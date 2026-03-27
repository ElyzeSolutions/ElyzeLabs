// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiMocks, installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { SchedulesPage } from './SchedulesPage';

installPageHarness();

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'schedule-1',
    label: 'Operator follow-up',
    category: 'follow_up',
    kind: 'targeted',
    cadenceKind: 'interval',
    cadence: 'every 10m',
    timezone: 'Europe/Zurich',
    enabled: true,
    pausedAt: null,
    pausedBy: null,
    paused: false,
    isDue: false,
    requestedBy: 'dashboard',
    requestingSessionId: null,
    originRef: {},
    targetAgentId: 'agent-1',
    sessionTarget: 'origin_session',
    deliveryTarget: 'origin_session',
    deliveryTargetSessionId: null,
    prompt: 'Return the next action.',
    runtime: 'gemini',
    model: 'gemini-2.5-pro',
    jobMode: null,
    approvalProfile: null,
    concurrencyPolicy: 'skip',
    domainPolicy: {},
    rateLimitPolicy: {},
    lastRunAt: '2026-03-17T07:00:00.000Z',
    nextRunAt: '2026-03-17T08:00:00.000Z',
    lastStatus: 'completed',
    lastError: null,
    lastResult: {},
    metadata: {},
    createdAt: '2026-03-17T06:00:00.000Z',
    updatedAt: '2026-03-17T06:30:00.000Z',
    activeRun: null,
    ...overrides
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SchedulesPage', () => {
  it('lets operators save routing on built-in schedules while keeping system-managed fields locked', async () => {
    const schedule = makeSchedule({
      id: 'schedule-builtin',
      kind: 'builtin',
      label: 'Cron session reaper',
      category: 'maintenance',
      targetAgentId: null,
      deliveryTarget: 'silent_on_heartbeat',
      sessionTarget: 'dedicated_schedule_session',
      runtime: null,
      model: null,
      requestedBy: 'system'
    });

    apiMocks.fetchSchedules.mockResolvedValue([schedule]);
    apiMocks.fetchScheduleDetail.mockResolvedValue({
      schedule,
      history: []
    });
    apiMocks.updateSchedule.mockResolvedValue(schedule);

    renderDashboardPage(<SchedulesPage />, { path: '/schedules?kind=builtin' });

    expect(await screen.findByText('Recurring work')).toBeInTheDocument();
    expect(await screen.findByText(/System jobs cannot be deleted\./)).toBeInTheDocument();
    expect(screen.getByText('System jobs')).toBeInTheDocument();

    const labelField = document.getElementById('schedule-edit-label');
    const cadenceField = document.getElementById('schedule-edit-cadence');
    const deliveryTargetField = document.getElementById('schedule-edit-delivery-target');

    expect(labelField).toBeDisabled();
    expect(cadenceField).toBeDisabled();
    expect(deliveryTargetField).toBeEnabled();
    expect(screen.queryAllByRole('button', { name: 'Delete' })).toHaveLength(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Save routing' })[0]);

    await waitFor(() =>
      expect(apiMocks.updateSchedule).toHaveBeenCalledWith(
        'token-123',
        'schedule-builtin',
        expect.objectContaining({
          deliveryTarget: 'silent_on_heartbeat',
          sessionTarget: 'dedicated_schedule_session'
        })
      )
    );
    await waitFor(() => expect(apiMocks.fetchSchedules).toHaveBeenCalledWith('token-123', { kind: 'builtin' }));
  });

  it('shows single and bulk delete controls for custom schedules', async () => {
    const schedule = makeSchedule({
      id: 'schedule-custom',
      label: 'Codex delete check'
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    apiMocks.fetchSchedules.mockResolvedValue([schedule]);
    apiMocks.fetchScheduleDetail.mockResolvedValue({
      schedule,
      history: []
    });
    apiMocks.deleteSchedule.mockResolvedValue(true);

    renderDashboardPage(<SchedulesPage />, { path: '/schedules' });

    expect(await screen.findByText('Codex delete check')).toBeInTheDocument();
    expect(screen.getByText('Custom schedules')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select visible custom' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete selected' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select' }));
    expect(screen.getByRole('button', { name: 'Delete selected (1)' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected (1)' }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.deleteSchedule).toHaveBeenCalledWith('token-123', 'schedule-custom'));
    await waitFor(() => expect(apiMocks.fetchSchedules).toHaveBeenCalledWith('token-123', { kind: 'targeted' }));
  });
});
