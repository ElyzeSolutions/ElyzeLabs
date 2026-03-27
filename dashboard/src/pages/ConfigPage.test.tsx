// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { ConfigPage } from './ConfigPage';

installPageHarness();

describe('ConfigPage', () => {
  it('renders the runtime config editor from query-backed config data', async () => {
    renderDashboardPage(<ConfigPage />, { path: '/config' });

    expect(await screen.findByText('Control plane')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchRuntimeConfig).toHaveBeenCalledWith('token-123'));
    await waitFor(() => expect(apiMocks.fetchPairings).toHaveBeenCalledWith('token-123', undefined));
  });
});
