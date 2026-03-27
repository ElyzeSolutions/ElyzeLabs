// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { BacklogPage } from './BacklogPage';

installPageHarness();

describe('BacklogPage', () => {
  it('renders the backlog board with mocked data', async () => {
    renderDashboardPage(<BacklogPage />, { path: '/backlog' });

    expect(await screen.findByText('Backlog Control Plane')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchBacklogBoard).toHaveBeenCalled());
  });
});
