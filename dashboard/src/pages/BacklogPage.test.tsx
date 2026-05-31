// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import { BacklogPage } from './BacklogPage';

installPageHarness();

describe('BacklogPage', () => {
  it('renders the backlog board with mocked data', async () => {
    renderDashboardPage(<BacklogPage />, { path: '/backlog' });

    expect(await screen.findByText('Backlog')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchBacklogBoard).toHaveBeenCalled());
  });

  it('shows contract-aware Kanban transition actions', async () => {
    const backlogItem = {
      id: 'backlog-item-1',
      title: 'Wire Instagram session capture',
      description: 'Save and verify authenticated Instagram browser sessions.',
      state: 'planned',
      priority: 2,
      labelsJson: '[]',
      source: 'dashboard',
      sourceRef: null,
      createdBy: 'operator',
      projectId: 'browser-ops',
      repoRoot: '/workspace/elyzelabs',
      assignedAgentId: 'social-browser-operator',
      linkedSessionId: null,
      linkedRunId: null,
      deliveryGroupId: null,
      blockedReason: null,
      originSessionId: null,
      originMessageId: null,
      originChannel: null,
      originChatId: null,
      originTopicId: null,
      metadataJson: '{}',
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-05-31T10:00:00.000Z',
      labels: ['browser'],
      metadata: {},
      dependencies: [],
      dependencyStates: [],
      unresolvedDependencies: [],
      dispatchReady: true,
      dispatch: {
        whyAgent: 'browser specialist',
        whyRuntime: 'process browser capture',
        dependencyState: {
          ready: true,
          unresolved: []
        },
        parallelismSlot: 1,
        modelRouteChain: []
      },
      transitions: [],
      execution: null,
      delivery: null,
      deliveryGroup: null
    };

    apiMocks.fetchBacklogBoard.mockResolvedValue({
      columns: {
        idea: [],
        triage: [],
        planned: [backlogItem],
        in_progress: [],
        review: [],
        blocked: [],
        done: [],
        archived: []
      },
      availableScopes: []
    });
    apiMocks.fetchBacklogContracts.mockResolvedValue({
      backlogUx: {
        transitions: {
          planned: ['in_progress', 'blocked']
        },
        blockedReasonTaxonomy: {}
      },
      deliveryEvidence: null
    });
    apiMocks.transitionBacklogItem.mockResolvedValue({
      item: {
        ...backlogItem,
        state: 'in_progress'
      }
    });

    renderDashboardPage(<BacklogPage />, { path: '/backlog' });

    expect(await screen.findByText('Wire Instagram session capture')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move Wire Instagram session capture to Live Execution' }));

    await waitFor(() =>
      expect(apiMocks.transitionBacklogItem).toHaveBeenCalledWith('token-123', 'backlog-item-1', {
        toState: 'in_progress',
        reason: 'button_transition:planned->in_progress'
      })
    );
  });
});
