// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { OfficePage } from './OfficePage';

installPageHarness();

describe('OfficePage', () => {
  it('renders the virtual office shell', async () => {
    renderDashboardPage(<OfficePage />);

    expect(await screen.findByText('Office')).toBeInTheDocument();
    expect(screen.getByText('Retro Office Sim')).toBeInTheDocument();
  });
});
