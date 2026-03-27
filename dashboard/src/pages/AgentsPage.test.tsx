// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { apiMocks, installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { AgentsPage } from './AgentsPage';

installPageHarness();

describe('AgentsPage', () => {
  it('renders the agent directory shell', async () => {
    renderDashboardPage(<AgentsPage />);

    expect(await screen.findByText('entities')).toBeInTheDocument();
    expect(screen.getByText('Workforce roster')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchAgentProfiles).toHaveBeenCalledWith('token-123', true));
  });
});
