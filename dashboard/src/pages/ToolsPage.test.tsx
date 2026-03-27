// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { apiMocks, installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { ToolsPage } from './ToolsPage';

installPageHarness();

describe('ToolsPage', () => {
  it('renders the execution registry surface', async () => {
    renderDashboardPage(<ToolsPage />);

    expect(await screen.findByRole('heading', { name: 'Tools', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh registry' })).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchTools).toHaveBeenCalledWith('token-123'));
    await waitFor(() => expect(apiMocks.fetchAgentProfiles).toHaveBeenCalledWith('token-123', true));
  });
});
