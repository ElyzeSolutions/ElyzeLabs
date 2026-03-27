export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
      return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200';
    case 'paused':
      return 'border-amber-400/40 bg-amber-500/10 text-amber-200';
    case 'stopped':
      return 'border-rose-400/40 bg-rose-500/10 text-rose-200';
    default:
      return 'border-slate-400/40 bg-slate-500/10 text-slate-200';
  }
}

export function readinessClass(tier: string): string {
  switch (tier) {
    case 'ready':
      return 'text-emerald-300';
    case 'degraded':
      return 'text-amber-300';
    default:
      return 'text-rose-300';
  }
}

export function levelClass(level: string): string {
  switch (level) {
    case 'warning':
      return 'text-amber-300';
    case 'critical':
    case 'error':
      return 'text-rose-300';
    case 'info':
      return 'text-sky-300';
    default:
      return 'text-slate-300';
  }
}
