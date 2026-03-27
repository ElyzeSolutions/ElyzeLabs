import { describe, expect, it } from 'vitest';

import { computeNextRunAt, parseScheduleCadence } from '../../src/schedule-registry.js';

describe('schedule registry', () => {
  it('parses interval cadences into a normalized summary', () => {
    expect(parseScheduleCadence('every 15m')).toEqual({
      kind: 'interval',
      expression: 'every 15m',
      summary: 'Every 15 minutes',
      intervalMs: 900_000
    });
  });

  it('parses supported cron cadences and computes the next UTC run', () => {
    const cadence = parseScheduleCadence('5 8 * * mon,wed,fri');

    expect(cadence).toMatchObject({
      kind: 'cron',
      expression: '5 8 * * mon,wed,fri',
      cron: {
        minutes: [5],
        hours: [8],
        weekdays: [1, 3, 5]
      }
    });

    expect(computeNextRunAt(cadence, new Date('2026-03-15T07:59:00.000Z'))).toBe('2026-03-16T08:05:00.000Z');
  });

  it('rejects unsupported cron day-of-month and month fields', () => {
    expect(() => parseScheduleCadence('0 8 1 * *')).toThrow(/cron_day_and_month_not_supported/);
  });
});
