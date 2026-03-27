// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fireEvent } from '@testing-library/react';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { CostControlPage } from './CostControlPage';

installPageHarness();

describe('CostControlPage', () => {
  it('renders the resource guard surface from query-backed llm telemetry', async () => {
    renderDashboardPage(<CostControlPage />, { path: '/llm' });

    expect(await screen.findByRole('heading', { name: 'Routing defaults', level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchLlmLimits).toHaveBeenCalledWith('token-123'));
    await waitFor(() => expect(apiMocks.fetchLlmCosts).toHaveBeenCalledWith('token-123', expect.anything()));
  });

  it('keeps fallback model inputs mounted and focused while editing', async () => {
    renderDashboardPage(<CostControlPage />, { path: '/llm' });

    expect(await screen.findByRole('heading', { name: 'Routing defaults', level: 1 })).toBeInTheDocument();

    const [fallbackInput] = await screen.findAllByPlaceholderText('default model');
    expect(fallbackInput).toBeTruthy();

    fallbackInput.focus();
    expect(fallbackInput).toHaveFocus();

    fireEvent.change(fallbackInput, { target: { value: 'openrouter/openai/gpt-5-mini-long' } });

    expect(fallbackInput.isConnected).toBe(true);
    expect(fallbackInput).toHaveFocus();
    expect(fallbackInput).toHaveValue('openrouter/openai/gpt-5-mini-long');
  });
});
