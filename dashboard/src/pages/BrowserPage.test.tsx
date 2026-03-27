// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { apiMocks, installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { BrowserPage } from './BrowserPage';

installPageHarness();

describe('BrowserPage', () => {
  it('renders Browser Ops against governed browser mocks', async () => {
    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    expect(await screen.findByText('Provider doctor, capture, and artifact review.')).toBeInTheDocument();
  });

  it('marks browser policy changes as dirty when a switch toggles', async () => {
    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    const approvalSwitch = await screen.findByRole('switch', { name: 'Require approval for proxy' });

    fireEvent.click(approvalSwitch);

    await waitFor(() => expect(approvalSwitch).toBeChecked());
    expect(screen.getByRole('button', { name: /save browser settings/i })).toBeEnabled();
  });

  it('reveals advanced routing fields when requested', async () => {
    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    const toggle = await screen.findByRole('button', { name: 'Show advanced routing flags' });

    fireEvent.click(toggle);

    expect(await screen.findByRole('textbox', { name: /preview chars/i })).toBeInTheDocument();
  });

  it('restores the seeded baseline for stale default browser profiles', async () => {
    apiMocks.fetchAgentProfiles.mockResolvedValue([
      {
        id: 'ceo-default',
        name: 'Elyze CEO',
        title: 'Chief Executive Agent',
        parentAgentId: null,
        protectedDefault: true,
        systemPrompt: 'Lead operations.',
        defaultRuntime: 'gemini',
        defaultModel: 'gemini-2.5-pro',
        allowedRuntimes: ['gemini'],
        skills: [],
        tools: [],
        metadata: {},
        executionMode: 'on_demand',
        harnessRuntime: null,
        persistentHarnessRuntime: null,
        harnessAutoStart: false,
        harnessSessionName: null,
        harnessSessionReady: false,
        harnessCommand: null,
        enabled: true,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z'
      }
    ]);

    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    const resetButton = await screen.findByRole('button', { name: 'Reset browser baseline for Elyze CEO' });

    fireEvent.click(resetButton);

    await waitFor(() => expect(apiMocks.resetAgentProfileBaseline).toHaveBeenCalledWith('token-123', 'ceo-default'));
  });
});
