// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { MissionControlPage } from './MissionControlPage';

installPageHarness();

describe('MissionControlPage', () => {
  it('renders mission control telemetry', async () => {
    renderDashboardPage(<MissionControlPage />);

    expect(await screen.findByText('Find a session fast')).toBeInTheDocument();
    expect((await screen.findAllByText('Browser auth')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('No sticky login')).length).toBeGreaterThan(0);
    await waitFor(() => expect(apiMocks.fetchWatchdogStatus).toHaveBeenCalledWith('token-123'));
  });
});
