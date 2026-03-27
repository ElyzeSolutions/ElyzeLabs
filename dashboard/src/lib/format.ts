export function formatUptime(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

export function formatTs(value?: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleTimeString();
}

export function formatRelativeTime(value?: string | null): string {
  if (!value) {
    return 'n/a';
  }

  const target = new Date(value).getTime();
  if (Number.isNaN(target)) {
    return 'n/a';
  }

  const diffMs = target - Date.now();
  const diffAbs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (diffAbs < minute) {
    return formatter.format(Math.round(diffMs / 1_000), 'second');
  }
  if (diffAbs < hour) {
    return formatter.format(Math.round(diffMs / minute), 'minute');
  }
  if (diffAbs < day) {
    return formatter.format(Math.round(diffMs / hour), 'hour');
  }

  return formatter.format(Math.round(diffMs / day), 'day');
}

export function formatCompactDateTime(value?: string | null): string {
  if (!value) {
    return 'n/a';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'n/a';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function clampCount(value: number, max = 99): string {
  if (value <= max) {
    return String(value);
  }
  return `${max}+`;
}
