// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { apiMocks, installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { ChatsPage } from './ChatsPage';

installPageHarness();

describe('ChatsPage', () => {
  it('renders the inbound traffic surface', async () => {
    renderDashboardPage(<ChatsPage />);

    expect(await screen.findByText('Inbound')).toBeInTheDocument();
    expect(screen.getByText('Traffic')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchChats).toHaveBeenCalledWith('token-123'));
  });
});
