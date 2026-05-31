import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGatewayTestHarness } from './test-harness.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  expect(isRecord(value), `${label} should be an object`).toBe(true);
  if (isRecord(value)) {
    return value;
  }
  return {};
}

function recordsField(record: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = record[key];
  expect(Array.isArray(value), `${key} should be an array`).toBe(true);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry, index) => expectRecord(entry, `${key}[${index}]`));
}

describe('skill lifecycle integration', () => {
  it('persists lifecycle controls and lets the curator move unhealthy skills to review', async () => {
    const harness = await createGatewayTestHarness('skill-lifecycle', (config) => {
      const skillRoot = path.join(path.dirname(config.runtime.workspaceRoot), 'skills');
      const skillDir = path.join(skillRoot, 'lifecycle-test');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        [
          '---',
          'name: lifecycle-test',
          'description: Lifecycle test skill.',
          'version: "1.0.0"',
          'requiredTools:',
          '  - lifecycle-missing-tool',
          'scopes:',
          '  filesystem: none',
          '  process: exec',
          '  network: none',
          '  secrets: none',
          '---',
          '# Lifecycle Test',
          '',
          'Used by integration tests.'
        ].join('\n')
      );
      config.skills.directories = [skillRoot];
    });

    try {
      const skillsResponse = await harness.inject({
        method: 'GET',
        url: '/api/skills'
      });
      expect(skillsResponse.statusCode).toBe(200);
      const skillsBody = expectRecord(skillsResponse.json(), 'skills response');
      const skills = recordsField(skillsBody, 'skills');
      const skill = skills.find((entry) => entry.name === 'lifecycle-test');
      expect(skill).toBeTruthy();
      const initialLifecycle = expectRecord(skill?.lifecycle, 'initial lifecycle');
      expect(initialLifecycle.state).toBe('needs_review');

      const updateResponse = await harness.inject({
        method: 'PUT',
        url: '/api/skills/lifecycle-test/lifecycle',
        payload: {
          actor: 'skill-lifecycle-test',
          state: 'pinned',
          note: 'Operator verified.'
        }
      });
      expect(updateResponse.statusCode).toBe(200);
      const updateBody = expectRecord(updateResponse.json(), 'update response');
      const updatedLifecycle = expectRecord(updateBody.lifecycle, 'updated lifecycle');
      expect(updatedLifecycle.state).toBe('pinned');
      expect(updatedLifecycle.updatedBy).toBe('skill-lifecycle-test');

      const curatorResponse = await harness.inject({
        method: 'POST',
        url: '/api/skills/curator/run',
        payload: {
          actor: 'skill-lifecycle-test',
          apply: true
        }
      });
      expect(curatorResponse.statusCode).toBe(200);
      const curatorBody = expectRecord(curatorResponse.json(), 'curator response');
      const proposals = recordsField(curatorBody, 'proposals');
      expect(proposals.some((proposal) => proposal.skillName === 'lifecycle-test' && proposal.toState === 'needs_review')).toBe(true);

      const lifecycleResponse = await harness.inject({
        method: 'GET',
        url: '/api/skills/lifecycle'
      });
      expect(lifecycleResponse.statusCode).toBe(200);
      const lifecycleBody = expectRecord(lifecycleResponse.json(), 'lifecycle response');
      const lifecycleState = expectRecord(lifecycleBody.lifecycle, 'lifecycle payload');
      const lifecycleSkills = recordsField(lifecycleState, 'skills');
      const lifecycleSkill = lifecycleSkills.find((entry) => entry.skillName === 'lifecycle-test');
      expect(expectRecord(lifecycleSkill?.lifecycle, 'curated lifecycle').state).toBe('needs_review');
    } finally {
      await harness.close();
    }
  });
});
