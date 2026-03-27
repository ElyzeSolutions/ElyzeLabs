// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { SettingsPage } from './SettingsPage';

installPageHarness();

describe('SettingsPage', () => {
  it('validates the gateway token through the query-backed status check', async () => {
    renderDashboardPage(<SettingsPage />, { path: '/settings' });

    expect(await screen.findByText('Operator access')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Validate against gateway' }));

    await waitFor(() => expect(apiMocks.fetchTokenStatus).toHaveBeenCalledWith('token-123'));
    expect(
      await screen.findByText('Gateway token configured (length 9, fingerprint tok_1234).')
    ).toBeInTheDocument();
  });
});
