// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installPageHarness, renderDashboardPage, apiMocks } from '../test/pageHarness';
import type { BacklogDeliveryRow, BacklogItemRow } from '../app/types';
import { BacklogPage } from './BacklogPage';

installPageHarness();

function makeBacklogDelivery(overrides: Partial<BacklogDeliveryRow> = {}): BacklogDeliveryRow {
  return {
    id: 'delivery-default',
    itemId: 'backlog-item-default',
    repoConnectionId: 'repo-1',
    branchName: 'codex/operator-workbench',
    commitSha: null,
    prNumber: null,
    prUrl: null,
    status: 'review',
    githubState: 'checks_pending',
    githubStateReason: null,
    githubStateUpdatedAt: null,
    checksJson: '{}',
    metadataJson: '{}',
    githubLeaseJson: '{}',
    githubWorktreeJson: '{}',
    githubReconcileJson: '{}',
    receiptStatus: null,
    receiptAttempts: 0,
    receiptLastError: null,
    receiptLastAttemptAt: null,
    workspaceRoot: null,
    workspacePath: null,
    outputFilesJson: '[]',
    createdAt: '2026-05-31T10:00:00.000Z',
    updatedAt: '2026-05-31T10:00:00.000Z',
    checks: {},
    metadata: {},
    githubLease: {},
    githubWorktree: {},
    githubReconcile: {},
    ...overrides
  };
}

function makeBacklogItem(overrides: Partial<BacklogItemRow> = {}): BacklogItemRow {
  return {
    id: 'backlog-item-default',
    title: 'Default backlog task',
    description: 'Default operator task.',
    state: 'planned',
    priority: 70,
    labelsJson: '[]',
    source: 'dashboard',
    sourceRef: null,
    createdBy: 'operator',
    projectId: 'operator-os',
    repoRoot: '/workspace/elyzelabs',
    assignedAgentId: 'software-engineer',
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
    labels: [],
    metadata: {},
    dependencies: [],
    dependencyStates: [],
    unresolvedDependencies: [],
    dispatchReady: true,
    dispatch: {
      whyAgent: 'operator owner',
      whyRuntime: 'codex',
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
    deliveryGroup: null,
    ...overrides
  };
}

describe('BacklogPage', () => {
  it('renders the backlog board with mocked data', async () => {
    renderDashboardPage(<BacklogPage />, { path: '/backlog' });

    expect(await screen.findByText('Backlog')).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchBacklogBoard).toHaveBeenCalled());
  });

  it('summarizes operator focus and filters lanes from the workbench strip', async () => {
    const readyItem = makeBacklogItem({
      id: 'ready-browser-capture',
      title: 'Ready browser capture',
      state: 'planned'
    });
    const heldItem = makeBacklogItem({
      id: 'dependency-held-profile',
      title: 'Dependency-held profile repair',
      state: 'planned',
      unresolvedDependencies: ['upstream-auth'],
      dispatchReady: false,
      dispatch: {
        whyAgent: 'operator owner',
        whyRuntime: 'codex',
        dependencyState: {
          ready: false,
          unresolved: ['upstream-auth']
        },
        parallelismSlot: null,
        modelRouteChain: []
      }
    });
    const executingItem = makeBacklogItem({
      id: 'live-capture-refresh',
      title: 'Live capture refresh',
      state: 'in_progress'
    });
    const riskyReviewItem = makeBacklogItem({
      id: 'failed-checks-review',
      title: 'Failed checks review',
      state: 'review',
      delivery: makeBacklogDelivery({
        id: 'delivery-risk',
        itemId: 'failed-checks-review',
        githubState: 'checks_failed'
      })
    });
    const blockedItem = makeBacklogItem({
      id: 'blocked-provider-token',
      title: 'Blocked provider token',
      state: 'blocked'
    });

    apiMocks.fetchBacklogBoard.mockResolvedValue({
      columns: {
        idea: [],
        triage: [],
        planned: [readyItem, heldItem],
        in_progress: [executingItem],
        review: [riskyReviewItem],
        blocked: [blockedItem],
        done: [],
        archived: []
      },
      availableScopes: []
    });
    apiMocks.fetchBacklogOrchestration.mockResolvedValue({
      control: {
        enabled: true,
        paused: false,
        maxParallel: 3,
        wipLimit: 2
      },
      queue: {
        planned: 1,
        inFlight: 2
      },
      dispatchPolicy: {
        projectCaps: {},
        projectPriorityBias: {}
      }
    });

    renderDashboardPage(<BacklogPage />, { path: '/backlog' });

    expect(await screen.findByText('Ready browser capture')).toBeInTheDocument();
    const focusStrip = await screen.findByRole('region', { name: 'Operator focus' });
    expect(within(focusStrip).getByRole('button', { name: 'Ready: 1 dispatchable planned work' })).toBeInTheDocument();
    expect(within(focusStrip).getByRole('button', { name: 'WIP: 2/2 active execution slots' })).toBeInTheDocument();
    expect(within(focusStrip).getByRole('button', { name: 'Verify: 1 waiting acceptance' })).toBeInTheDocument();
    expect(within(focusStrip).getByRole('button', { name: 'Stalled: 2 blocked or dependency-held' })).toBeInTheDocument();
    expect(within(focusStrip).getByRole('button', { name: 'Delivery risk: 1 GitHub or evidence risk' })).toBeInTheDocument();

    fireEvent.click(within(focusStrip).getByRole('button', { name: 'Delivery risk: 1 GitHub or evidence risk' }));

    await waitFor(() => {
      expect(screen.queryByTestId('backlog-column-planned')).not.toBeInTheDocument();
      expect(screen.getByTestId('backlog-column-review')).toBeInTheDocument();
      expect(screen.getByTestId('backlog-column-blocked')).toBeInTheDocument();
    });
  });

  it('shows contract-aware Kanban transition actions', async () => {
    const backlogItem = makeBacklogItem({
      id: 'backlog-item-1',
      title: 'Wire Instagram session capture',
      description: 'Save and verify authenticated Instagram browser sessions.',
      state: 'planned',
      priority: 2,
      projectId: 'browser-ops',
      assignedAgentId: 'social-browser-operator',
      labels: ['browser'],
      dispatch: {
        whyAgent: 'browser specialist',
        whyRuntime: 'process browser capture',
        dependencyState: {
          ready: true,
          unresolved: []
        },
        parallelismSlot: 1,
        modelRouteChain: []
      }
    });

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

  it('moves Kanban tasks by drag and drop', async () => {
    const backlogItem = makeBacklogItem({
      id: 'backlog-item-1',
      title: 'Wire Instagram session capture',
      description: 'Save and verify authenticated Instagram browser sessions.',
      state: 'planned',
      priority: 2,
      projectId: 'browser-ops',
      assignedAgentId: 'social-browser-operator',
      labels: ['browser'],
      dispatch: {
        whyAgent: 'browser specialist',
        whyRuntime: 'process browser capture',
        dependencyState: {
          ready: true,
          unresolved: []
        },
        parallelismSlot: 1,
        modelRouteChain: []
      }
    });
    const dragStore = new Map<string, string>();
    const dataTransfer = {
      clearData: (type?: string) => {
        if (type) {
          dragStore.delete(type);
          return;
        }
        dragStore.clear();
      },
      getData: (type: string) => dragStore.get(type) ?? '',
      setData: (type: string, value: string) => {
        dragStore.set(type, value);
      }
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
    apiMocks.transitionBacklogItem.mockResolvedValue({
      item: {
        ...backlogItem,
        state: 'review'
      }
    });

    renderDashboardPage(<BacklogPage />, { path: '/backlog' });

    const card = await screen.findByTestId('backlog-card-backlog-item-1');
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('backlog-column-review'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('backlog-column-review'), { dataTransfer });

    await waitFor(() =>
      expect(apiMocks.transitionBacklogItem).toHaveBeenCalledWith('token-123', 'backlog-item-1', {
        toState: 'review',
        reason: 'drag_transition:planned->review'
      })
    );
  });

  it('creates operator tasks directly from the Kanban board', async () => {
    renderDashboardPage(<BacklogPage />, { path: '/backlog' });

    fireEvent.change(await screen.findByLabelText('New Task'), {
      target: { value: 'Ship live browser provider' }
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Attach to the active CDP browser and keep Scrapling auth state.' }
    });
    fireEvent.change(screen.getByLabelText('Labels'), {
      target: { value: 'browser,openclaw' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(apiMocks.createBacklogItem).toHaveBeenCalledWith('token-123', {
        title: 'Ship live browser provider',
        description: 'Attach to the active CDP browser and keep Scrapling auth state.',
        state: 'planned',
        priority: 70,
        labels: ['browser', 'openclaw'],
        projectId: null,
        repoRoot: null,
        source: 'dashboard'
      })
    );
  });

  it('guides Telegram task handoff and attaches GitHub repo hints', async () => {
    renderDashboardPage(<BacklogPage />, { path: '/backlog' });

    fireEvent.change(await screen.findByLabelText('New Task'), {
      target: { value: 'Sync Pinterest auth captures' }
    });
    fireEvent.change(screen.getByLabelText('GitHub Repo'), {
      target: { value: 'https://github.com/example/elyze.git' }
    });
    fireEvent.change(screen.getByLabelText('Labels'), {
      target: { value: 'browser, auth' }
    });
    fireEvent.change(screen.getByLabelText('Priority'), {
      target: { value: '88' }
    });

    expect(screen.getByLabelText('Telegram task command')).toHaveValue(
      '/task Sync Pinterest auth captures repo=example/elyze labels=browser,auth priority=88'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(apiMocks.createBacklogItem).toHaveBeenCalledWith('token-123', {
        title: 'Sync Pinterest auth captures',
        description: 'Sync Pinterest auth captures',
        state: 'planned',
        priority: 88,
        labels: ['browser', 'auth'],
        projectId: null,
        repoRoot: null,
        metadata: {
          githubRepoHint: {
            owner: 'example',
            repo: 'elyze'
          }
        },
        source: 'dashboard'
      })
    );
  });

  it('surfaces delivery state and syncs GitHub issues from task details', async () => {
    const backlogItem = makeBacklogItem({
      id: 'backlog-item-2',
      title: 'Polish operator Kanban',
      description: 'Add delivery state and issue sync.',
      state: 'review',
      priority: 80,
      source: 'telegram',
      sourceRef: '-1001',
      originSessionId: 'session-telegram',
      originMessageId: '100',
      originChannel: 'telegram',
      originChatId: '-1001',
      metadataJson: '{"githubRepoHint":{"owner":"example","repo":"elyze"}}',
      labels: ['kanban'],
      metadata: {
        githubRepoHint: {
          owner: 'example',
          repo: 'elyze'
        }
      },
      dispatch: {
        whyAgent: 'delivery owner',
        whyRuntime: 'codex',
        dependencyState: {
          ready: true,
          unresolved: []
        },
        parallelismSlot: 1,
        modelRouteChain: []
      },
      delivery: makeBacklogDelivery({
        id: 'delivery-1',
        itemId: 'backlog-item-2',
        branchName: 'codex/operator-kanban',
        githubState: 'checks_pending'
      })
    });

    apiMocks.fetchBacklogBoard.mockResolvedValue({
      columns: {
        idea: [],
        triage: [],
        planned: [],
        in_progress: [],
        review: [backlogItem],
        blocked: [],
        done: [],
        archived: []
      },
      availableScopes: []
    });
    apiMocks.syncBacklogIssue.mockResolvedValue({
      itemId: 'backlog-item-2',
      issue: {
        number: 42,
        url: 'https://github.com/example/elyze/issues/42',
        state: 'open',
        labels: ['backlog:review'],
        assignee: null
      },
      delivery: backlogItem.delivery
    });

    renderDashboardPage(<BacklogPage />, { path: '/backlog', search: { states: ['review'] } });

    expect(await screen.findByText('checks pending')).toBeInTheDocument();
    expect(screen.getByText('Telegram')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Polish operator Kanban'));
    fireEvent.click(await screen.findByRole('button', { name: 'Sync Issue' }));

    await waitFor(() => expect(apiMocks.syncBacklogIssue).toHaveBeenCalledWith('token-123', 'backlog-item-2'));
    expect(await screen.findByText('#42 open')).toBeInTheDocument();
  });
});
