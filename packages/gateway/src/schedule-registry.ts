import type { ScheduleCadenceKind } from '@ops/shared';

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_INDEX_BY_NAME = new Map(DAY_NAMES.map((name, index) => [name, index] as const));

export interface ParsedScheduleCadence {
  kind: ScheduleCadenceKind;
  expression: string;
  summary: string;
  intervalMs?: number;
  cron?: {
    minutes: number[] | null;
    hours: number[] | null;
    weekdays: number[] | null;
  };
}

function sortUnique(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function parseIntervalCadence(raw: string): ParsedScheduleCadence | null {
  const normalized = raw.trim().toLowerCase();
  const match = normalized.match(/^(?:every\s+)?(\d+)\s*([smhd])$/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('interval_amount_invalid');
  }
  const unitMs =
    unit === 's'
      ? 1000
      : unit === 'm'
        ? 60_000
        : unit === 'h'
          ? 60 * 60_000
          : 24 * 60 * 60_000;
  const intervalMs = amount * unitMs;
  const unitLabel =
    unit === 's'
      ? amount === 1
        ? 'second'
        : 'seconds'
      : unit === 'm'
        ? amount === 1
          ? 'minute'
          : 'minutes'
        : unit === 'h'
          ? amount === 1
            ? 'hour'
            : 'hours'
          : amount === 1
            ? 'day'
            : 'days';
  return {
    kind: 'interval',
    expression: `every ${amount}${unit}`,
    summary: `Every ${amount} ${unitLabel}`,
    intervalMs
  };
}

function parseCronField(
  raw: string,
  min: number,
  max: number,
  label: string,
  mapper?: (token: string) => number | null
): number[] | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === '*') {
    return null;
  }
  const values: number[] = [];
  for (const part of trimmed.split(',')) {
    const token = part.trim();
    if (!token) {
      continue;
    }
    if (token.startsWith('*/')) {
      const step = Number(token.slice(2));
      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`${label}_step_invalid`);
      }
      for (let value = min; value <= max; value += Math.floor(step)) {
        values.push(value);
      }
      continue;
    }
    const mapped = mapper ? mapper(token) : null;
    const numeric = mapped ?? Number(token);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
      throw new Error(`${label}_value_invalid`);
    }
    values.push(Math.floor(numeric));
  }
  return values.length > 0 ? sortUnique(values) : null;
}

function formatWeekdays(values: number[] | null): string {
  if (!values || values.length === 0 || values.length === 7) {
    return 'every day';
  }
  return values.map((value) => DAY_NAMES[value] ?? String(value)).join(', ');
}

function formatHours(values: number[] | null): string {
  if (!values || values.length === 0) {
    return 'every hour';
  }
  if (values.length === 1) {
    return `${String(values[0]).padStart(2, '0')}:00`;
  }
  return `${values.length} fixed hours`;
}

function formatMinutes(values: number[] | null): string {
  if (!values || values.length === 0) {
    return 'every minute';
  }
  if (values.length === 1) {
    return `minute ${String(values[0]).padStart(2, '0')}`;
  }
  return `${values.length} fixed minutes`;
}

function parseCronCadence(raw: string): ParsedScheduleCadence | null {
  const fields = raw.trim().split(/\s+/).filter((entry) => entry.length > 0);
  if (fields.length !== 5) {
    return null;
  }
  const minutes = parseCronField(fields[0]!, 0, 59, 'minute');
  const hours = parseCronField(fields[1]!, 0, 23, 'hour');
  if (fields[2] !== '*' || fields[3] !== '*') {
    throw new Error('cron_day_and_month_not_supported');
  }
  const weekdays = parseCronField(fields[4]!, 0, 6, 'weekday', (token) =>
    DAY_INDEX_BY_NAME.get(token as (typeof DAY_NAMES)[number]) ?? null
  );
  return {
    kind: 'cron',
    expression: fields.join(' '),
    summary: `${formatWeekdays(weekdays)} at ${formatHours(hours)} / ${formatMinutes(minutes)}`,
    cron: {
      minutes,
      hours,
      weekdays
    }
  };
}

function matchesCronSet(values: number[] | null, current: number): boolean {
  return values === null || values.includes(current);
}

export function parseScheduleCadence(raw: string): ParsedScheduleCadence {
  const normalized = raw.trim();
  if (!normalized) {
    throw new Error('schedule_expression_required');
  }
  const interval = parseIntervalCadence(normalized);
  if (interval) {
    return interval;
  }
  const cron = parseCronCadence(normalized);
  if (cron) {
    return cron;
  }
  throw new Error('schedule_expression_invalid');
}

export function computeNextRunAt(
  cadence: ParsedScheduleCadence,
  from: Date = new Date()
): string {
  const base = new Date(from.getTime());
  if (cadence.kind === 'interval') {
    return new Date(base.getTime() + (cadence.intervalMs ?? 0)).toISOString();
  }
  const cron = cadence.cron;
  if (!cron) {
    throw new Error('cron_schedule_missing');
  }
  const cursor = new Date(base.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  for (let index = 0; index < 366 * 24 * 60; index += 1) {
    const weekday = cursor.getUTCDay();
    const hour = cursor.getUTCHours();
    const minute = cursor.getUTCMinutes();
    if (
      matchesCronSet(cron.weekdays, weekday) &&
      matchesCronSet(cron.hours, hour) &&
      matchesCronSet(cron.minutes, minute)
    ) {
      return cursor.toISOString();
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  throw new Error('next_run_calculation_failed');
}
