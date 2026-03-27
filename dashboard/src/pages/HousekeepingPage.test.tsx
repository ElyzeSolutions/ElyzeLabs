// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { HousekeepingPage } from './HousekeepingPage';

installPageHarness();

describe('HousekeepingPage', () => {
  it('renders cleanup telemetry', async () => {
    renderDashboardPage(<HousekeepingPage />, { path: '/housekeeping' });

    expect(await screen.findByText('Housekeeping Control')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchHousekeeping).toHaveBeenCalledWith('token-123'));
  });
});
