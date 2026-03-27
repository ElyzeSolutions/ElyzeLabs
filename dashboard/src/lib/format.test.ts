import { afterEach, describe, expect, it, vi } from 'vitest';

import { clampCount, formatCompactDateTime, formatRelativeTime, formatTs, formatUptime } from './format';

describe('format helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats uptime values using non-negative whole seconds', () => {
    expect(formatUptime(3661.9)).toBe('1h 1m 1s');
    expect(formatUptime(-5)).toBe('0h 0m 0s');
  });

  it('returns n/a for invalid or missing timestamps', () => {
    expect(formatTs()).toBe('n/a');
    expect(formatTs('not-a-date')).toBe('n/a');
    expect(formatCompactDateTime(null)).toBe('n/a');
    expect(formatCompactDateTime('still-not-a-date')).toBe('n/a');
  });

  it('formats relative times around the current clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    expect(formatRelativeTime('2026-03-15T12:00:30.000Z')).toContain('30');
    expect(formatRelativeTime('2026-03-15T11:55:00.000Z')).toContain('5');
    expect(formatRelativeTime('bad-date')).toBe('n/a');
  });

  it('clamps counts above the configured maximum', () => {
    expect(clampCount(12)).toBe('12');
    expect(clampCount(120)).toBe('99+');
    expect(clampCount(120, 9)).toBe('9+');
  });
});
