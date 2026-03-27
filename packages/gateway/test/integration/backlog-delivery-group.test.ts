import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

function initRepo(repoRoot: string, remoteUrl: string): void {
  fs.mkdirSync(repoRoot, { recursive: true });
  const runGit = (args: string[]): void => {
    const result = spawnSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
  };
  runGit(['init', '--initial-branch=main']);
  runGit(['config', 'user.name', 'Gateway Integration']);
  runGit(['config', 'user.email', 'gateway-integration@elyzelabs.local']);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), `# ${path.basename(repoRoot)}\n`);
  runGit(['add', 'README.md']);
  runGit(['commit', '-m', 'init']);
  runGit(['remote', 'add', 'origin', remoteUrl]);
}

describe('gateway backlog delivery-group integration', () => {
  const harnesses: GatewayTestHarness[] = [];

  const createHarness = async (label: string): Promise<GatewayTestHarness> => {
    const harness = await createGatewayTestHarness(label);
    harnesses.push(harness);
    return harness;
  };

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()!.close();
    }
  });

  it('auto-links backlog delivery when a known github repo is mentioned', async () => {
    const harness = await createHarness('delivery-auto-link');

    const repoConnect = await harness.inject({
      method: 'POST',
      url: '/api/github/repos',
      payload: {
        repoUrl: 'https://github.com/example/hello-web',
        authSecretRef: 'providers.github_pat',
        enabled: true
      }
    });
    expect(repoConnect.statusCode).toBe(201);
    const repoBody = repoConnect.json() as { repo: { id: string; owner: string; repo: string } };
    expect(repoBody.repo.owner).toBe('example');
    expect(repoBody.repo.repo).toBe('hello-web');

    const backlogItem = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: 'Project Alpha setup',
        description: 'Initialize against https://github.com/example/hello-web and prepare CI.',
        actor: 'test'
      }
    });
    expect(backlogItem.statusCode).toBe(201);
    const backlogBody = backlogItem.json() as {
      item: {
        id: string;
        metadata: { githubRepoHint?: { owner: string; repo: string } };
        delivery: { repoConnectionId: string | null } | null;
      };
    };
    expect(backlogBody.item.metadata.githubRepoHint?.owner).toBe('example');
    expect(backlogBody.item.metadata.githubRepoHint?.repo).toBe('hello-web');
    expect(backlogBody.item.delivery?.repoConnectionId).toBe(repoBody.repo.id);
  });

  it('creates a delivery group for single-task intake sync and rejects item-level publish for group-managed items', async () => {
    const harness = await createHarness('delivery-group-intake');
    const repoRoot = path.join(harness.root, 'intake-single-task-repo');
    const planPath = path.join(repoRoot, '.agents', 'PLAN.md');
    const prdPath = path.join(repoRoot, '.agents', 'PRD.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(
      planPath,
      [
        '# Intake Plan',
        '',
        '```json',
        JSON.stringify(
          [
            {
              id: 'T-905',
              category: 'feature',
              description: 'Implement the public contact page.',
              depends_on: [],
              steps: ['Create route'],
              criteria: ['Example: /contact resolves', 'Negative: missing route stays 404'],
              passes: false
            }
          ],
          null,
          2
        ),
        '```',
        ''
      ].join('\n')
    );
    fs.writeFileSync(prdPath, '# Intake PRD\n');

    const intakeResponse = await harness.inject({
      method: 'POST',
      url: '/api/backlog/project-intake',
      payload: {
        mode: 'sync_only',
        planPath,
        prdPath,
        projectId: 'single-task-delivery-group',
        repoRoot,
        actor: 'test'
      }
    });
    expect(intakeResponse.statusCode).toBe(200);
    const intakeBody = intakeResponse.json() as {
      sync: {
        mapped: Array<{ taskId: string; itemId: string }>;
      };
    };
    const task905 = intakeBody.sync.mapped.find((item) => item.taskId === 'T-905');
    expect(task905).toBeTruthy();

    const itemDetails = await harness.inject({
      method: 'GET',
      url: `/api/backlog/items/${task905!.itemId}`
    });
    expect(itemDetails.statusCode).toBe(200);
    const itemBody = itemDetails.json() as {
      item: {
        deliveryGroupId: string | null;
      };
    };
    expect(typeof itemBody.item.deliveryGroupId).toBe('string');

    const publishResponse = await harness.inject({
      method: 'POST',
      url: `/api/backlog/items/${task905!.itemId}/delivery/publish`,
      payload: {
        actor: 'test'
      }
    });
    expect(publishResponse.statusCode).toBe(409);
    const publishBody = publishResponse.json() as {
      details?: {
        reason?: string;
      };
    };
    expect(publishBody.details?.reason).toBe('delivery_group_managed');
  });

  it('moves delivery groups to ready_to_publish only after every member reaches done', async () => {
    const harness = await createHarness('delivery-group-readiness');
    const db = harness.createDb();

    const createItem = async (title: string, state: 'planned' | 'in_progress' | 'review' | 'done') => {
      const response = await harness.inject({
        method: 'POST',
        url: '/api/backlog/items',
        payload: {
          title,
          description: `${title} description`,
          state,
          actor: 'test',
          projectId: 'group-ready-project'
        }
      });
      expect(response.statusCode).toBe(201);
      return (response.json() as { item: { id: string } }).item.id;
    };

    const itemA = await createItem('Delivery group member A', 'done');
    const itemB = await createItem('Delivery group member B', 'in_progress');

    const groupResponse = await harness.inject({
      method: 'POST',
      url: '/api/delivery-groups',
      payload: {
        sourceRef: 'integration-ready-group',
        itemIds: [itemA, itemB]
      }
    });
    expect(groupResponse.statusCode).toBe(201);
    const groupBody = groupResponse.json() as {
      group: {
        id: string;
        status: string;
      };
    };
    expect(groupBody.group.status).toBe('in_progress');

    const initialStatus = await harness.inject({
      method: 'GET',
      url: `/api/delivery-groups/${groupBody.group.id}/status`
    });
    expect(initialStatus.statusCode).toBe(200);
    const initialStatusBody = initialStatus.json() as {
      status: {
        groupStatus: string;
        ready: boolean;
        memberCount: number;
        completedCount: number;
      };
    };
    expect(initialStatusBody.status.groupStatus).toBe('in_progress');
    expect(initialStatusBody.status.ready).toBe(false);
    expect(initialStatusBody.status.memberCount).toBe(2);
    expect(initialStatusBody.status.completedCount).toBe(1);

    db.transitionBacklogItem({
      itemId: itemB,
      toState: 'review',
      actor: 'integration-test',
      reason: 'Move through review before publish readiness.'
    });
    db.transitionBacklogItem({
      itemId: itemB,
      toState: 'done',
      actor: 'integration-test',
      reason: 'Review completed with evidence handled elsewhere.'
    });

    const readyStatus = await harness.inject({
      method: 'GET',
      url: `/api/delivery-groups/${groupBody.group.id}/status`
    });
    expect(readyStatus.statusCode).toBe(200);
    const readyStatusBody = readyStatus.json() as {
      status: {
        groupStatus: string;
        ready: boolean;
        memberCount: number;
        completedCount: number;
        blockedCount: number;
      };
    };
    expect(readyStatusBody.status.groupStatus).toBe('ready_to_publish');
    expect(readyStatusBody.status.ready).toBe(true);
    expect(readyStatusBody.status.memberCount).toBe(2);
    expect(readyStatusBody.status.completedCount).toBe(2);
    expect(readyStatusBody.status.blockedCount).toBe(0);
    db.close();
  });

  it('resolves hinted nested repositories from parent workspaces when review evidence is recorded', async () => {
    const harness = await createHarness('delivery-review-parent-workspace');
    const workspaceRoot = path.join(harness.root, 'delivery-parent-workspace');
    const repoRoot = path.join(workspaceRoot, 'ugothere.ai');
    initRepo(repoRoot, 'https://github.com/ElyzeSolutions/ugothere.ai.git');
    const runGit = (args: string[]): void => {
      const result = spawnSync('git', ['-C', repoRoot, ...args], {
        encoding: 'utf8'
      });
      expect(result.status).toBe(0);
    };
    runGit(['checkout', '-b', 'feat/contact-page']);
    fs.writeFileSync(path.join(repoRoot, 'contact.txt'), 'contact page ready\n');
    runGit(['add', 'contact.txt']);
    runGit(['commit', '-m', 'add contact page']);
    const realRepoRoot = fs.realpathSync(repoRoot);
    const realWorkspaceRoot = fs.realpathSync(workspaceRoot);

    const createItem = await harness.inject({
      method: 'POST',
      url: '/api/backlog/items',
      payload: {
        title: 'Clone ugothere.ai and add a contact page',
        description:
          'Track delivery for `https://github.com/ElyzeSolutions/ugothere.ai.git` and move to review once repository evidence exists.',
        state: 'in_progress',
        source: 'execution_contract',
        actor: 'test'
      }
    });
    expect(createItem.statusCode).toBe(201);
    const createItemBody = createItem.json() as { item: { id: string } };

    const deliveryUpdate = await harness.inject({
      method: 'PUT',
      url: `/api/backlog/items/${encodeURIComponent(createItemBody.item.id)}/delivery`,
      payload: {
        status: 'review',
        workspacePath: realWorkspaceRoot
      }
    });
    expect(deliveryUpdate.statusCode).toBe(200);
    const deliveryBody = deliveryUpdate.json() as {
      item: {
        projectId: string | null;
        repoRoot: string | null;
      };
      delivery: {
        status: string;
        workspacePath: string | null;
        metadata: {
          artifacts?: {
            repoRoot?: string | null;
            changedFiles?: string[];
          };
        };
      };
    };
    expect(deliveryBody.item.projectId).toBe('ugothere-ai');
    expect(deliveryBody.item.repoRoot).toBe(realRepoRoot);
    expect(deliveryBody.delivery.status).toBe('review');
    expect(deliveryBody.delivery.workspacePath).toBe(realRepoRoot);
    expect(deliveryBody.delivery.metadata.artifacts).toBeUndefined();
  });
});
