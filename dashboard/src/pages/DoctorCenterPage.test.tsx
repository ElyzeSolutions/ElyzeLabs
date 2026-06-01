// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { DoctorCenterPage } from './DoctorCenterPage';

installPageHarness();

describe('DoctorCenterPage', () => {
  it('renders the aggregated repair center and runs bounded repairs', async () => {
    renderDashboardPage(<DoctorCenterPage />, { path: '/doctor' });

    expect(await screen.findByText('Repair Center')).toBeInTheDocument();
    expect(await screen.findByText('Skill lifecycle')).toBeInTheDocument();
    expect(screen.getByText('Prompt governance')).toBeInTheDocument();
    expect(screen.getByText('Context-file guardrail')).toBeInTheDocument();
    expect(screen.getByText('Source authority')).toBeInTheDocument();
    expect(screen.getByText('Memory governance')).toBeInTheDocument();
    expect(screen.getByText('Memory write guardrail')).toBeInTheDocument();
    expect(screen.getByText('Sandbox policy')).toBeInTheDocument();
    expect(screen.getByText('Network boundary')).toBeInTheDocument();
    expect(screen.getByText('Schedule guardrails')).toBeInTheDocument();
    expect(screen.getByText('Browser profiles')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Resync skills')[0]);

    await waitFor(() =>
      expect(apiMocks.runDoctorRepair).toHaveBeenCalledWith('token-123', 'skills_resync', {
        approved: true
      })
    );
  });
});
