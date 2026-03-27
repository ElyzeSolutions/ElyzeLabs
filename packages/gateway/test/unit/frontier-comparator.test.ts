import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildFrontierComparatorClosure, runFrontierComparatorHarness } from '../../src/frontier-comparator.js';
import { createDefaultFrontierScorecard } from '../../src/frontier-scorecard.js';

describe('frontier comparator', () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('builds a comparator matrix and explicit closure notes from discovered repos', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-frontier-comparator-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'comparators', 'baseline_alpha'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'execution-path.ts'),
      ['export const executionPath = true;', 'export const nativeToolSession = true;', 'export const promptAssembly = true;'].join('\n'),
      'utf8'
    );

    const scorecard = createDefaultFrontierScorecard(root);
    const run = runFrontierComparatorHarness({
      baseDir: root,
      scorecard
    });
    const closure = buildFrontierComparatorClosure({
      scorecard,
      run
    });

    expect(run.schema).toBe('ops.frontier-comparator-run.v1');
    expect(run.comparators.elyze.availability).toBe('available');
    expect(run.matrix.some((entry) => entry.comparator === 'elyze')).toBe(true);
    expect(closure.schema).toBe('ops.frontier-comparator-closure.v1');
    expect(Array.isArray(closure.summary.wins)).toBe(true);
    expect(Array.isArray(closure.summary.remainingGaps)).toBe(true);
  });
});
