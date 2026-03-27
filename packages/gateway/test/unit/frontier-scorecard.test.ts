import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDefaultFrontierScorecard, mergeFrontierScorecardSnapshot } from '../../src/frontier-scorecard.js';

describe('frontier scorecard', () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('discovers available comparator repos from nearby candidate paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-frontier-scorecard-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'comparators', 'baseline_alpha'), { recursive: true });
    fs.writeFileSync(path.join(root, 'comparators', 'baseline_alpha', 'README.md'), '# Baseline Alpha\n', 'utf8');

    const scorecard = createDefaultFrontierScorecard(root);

    expect(scorecard.schema).toBe('ops.frontier-scorecard.v2');
    expect(scorecard.comparators.baseline_alpha).toMatchObject({
      availability: 'available'
    });
    expect(scorecard.comparators.baseline_alpha.discoveredPath).toBe(path.join(root, 'comparators', 'baseline_alpha'));
  });

  it('merges persisted snapshots while clamping invalid dimension inputs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-frontier-scorecard-'));
    roots.push(root);

    const merged = mergeFrontierScorecardSnapshot(
      {
        dimensions: {
          message_quality: {
            threshold: 2,
            weight: -1,
            label: 'Operator receipts',
            comparatorFocus: ['paperclip'],
            rubric: 'Use better receipts.'
          }
        }
      },
      root
    );

    expect(merged.dimensions.message_quality).toMatchObject({
      threshold: 1,
      weight: 0,
      label: 'Operator receipts',
      comparatorFocus: ['paperclip'],
      rubric: 'Use better receipts.'
    });
  });
});
