// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { apiMocks, installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { SkillsPage } from './SkillsPage';

installPageHarness();

describe('SkillsPage', () => {
  it('renders the skill registry surface', async () => {
    renderDashboardPage(<SkillsPage />);

    expect(await screen.findByText('Paste a skill link. Install it.')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchSkills).toHaveBeenCalledWith('token-123'));
    await waitFor(() => expect(apiMocks.fetchSkillsCatalog).toHaveBeenCalledWith('token-123'));
  });

  it('extracts a selected skill from a skills.sh URL before install', async () => {
    renderDashboardPage(<SkillsPage />);

    const sourceInput = await screen.findByLabelText(
      'Paste a skills.sh link, GitHub URL, repo slug, or docs command'
    );
    fireEvent.change(sourceInput, {
      target: {
        value: 'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices'
      }
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Install selected skill' }));

    await waitFor(() =>
      expect(apiMocks.installExternalSkill).toHaveBeenCalledWith('token-123', {
        source: 'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices',
        approved: false,
        selectedSkills: ['vercel-react-best-practices']
      })
    );
  });
});
