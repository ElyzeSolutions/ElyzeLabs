// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { OnboardingPage } from './OnboardingPage';

installPageHarness();

describe('OnboardingPage', () => {
  it('renders the foundation setup flow', async () => {
    renderDashboardPage(<OnboardingPage />);

    expect(await screen.findByText('Foundation Setup')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchOnboardingStatus).toHaveBeenCalledWith('token-123'));
  });
});
