// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { DashboardPage } from './DashboardPage';

installPageHarness();

describe('DashboardPage', () => {
  it('renders the operations overview shell', async () => {
    renderDashboardPage(<DashboardPage />);

    expect(await screen.findByRole('heading', { name: 'Immediate actions', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Clear stalled sessions, stop live runs, or jump straight into the active queue.')).toBeInTheDocument();
  });
});
