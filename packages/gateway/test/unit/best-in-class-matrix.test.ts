import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('best-in-class capability matrix', () => {
  it('keeps generated competitor evidence current and auditable', () => {
    execFileSync('node', ['scripts/runtime/best-in-class-audit.mjs', '--check'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    const generatedPath = path.join(process.cwd(), 'docs/generated/best-in-class-capability-matrix.json');
    const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));

    expect(generated.schema).toBe('ops.best-in-class-audit.v1');
    expect(generated.readiness).toBe('not_ready');
    expect(generated.totals.requiredGaps).toBe(2);
    expect(generated.requiredGaps.map((entry: { id: string }) => entry.id)).toEqual([
      'chat_process_runtime',
      'e2e_scenario_certification'
    ]);
    expect(generated.statusCounts.ahead).toBeGreaterThan(0);
    expect(generated.statusCounts.parity).toBeGreaterThan(0);
    expect(generated.competitors.map((entry: { id: string }) => entry.id)).toEqual([
      'hermes-agent',
      'NemoClaw',
      'openclaw'
    ]);
  });
});
