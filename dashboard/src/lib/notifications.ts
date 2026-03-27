import type { AppNotification, RuntimeEventRow } from '../app/types';

function trimSummary(value: string, maxLength = 140): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildMissionControlRoute(event: RuntimeEventRow): string | null {
  if (event.sessionId || event.runId) {
    return '/mission-control';
  }
  if (event.kind.startsWith('vault.')) {
    return '/vault';
  }
  if (event.kind.startsWith('remediation.')) {
    return '/housekeeping';
  }
  if (event.kind.startsWith('tool.') || event.kind.startsWith('skill.')) {
    return '/tools';
  }
  if (event.kind.startsWith('queue.') || event.kind === 'backpressure') {
    return '/mission-control';
  }
  return null;
}

export function buildNotificationFromEvent(event: RuntimeEventRow): AppNotification | null {
  const createdAt = event.ts;
  const detail = trimSummary(event.message || 'Runtime event received.');
  const id = `event:${event.sequence}`;
  const route = buildMissionControlRoute(event);

  switch (event.kind) {
    case 'run.waiting_input':
      return {
        id,
        title: 'Operator input requested',
        detail,
        tone: 'warning',
        createdAt,
        read: false,
        route,
        source: 'runtime',
        sessionId: event.sessionId,
        runId: event.runId,
        eventSequence: event.sequence
      };
    case 'run.failed':
      return {
        id,
        title: 'Run failed',
        detail,
        tone: 'critical',
        createdAt,
        read: false,
        route,
        source: 'runtime',
        sessionId: event.sessionId,
        runId: event.runId,
        eventSequence: event.sequence
      };
    case 'run.aborted':
      return {
        id,
        title: 'Run stopped',
        detail,
        tone: 'warning',
        createdAt,
        read: false,
        route,
        source: 'runtime',
        sessionId: event.sessionId,
        runId: event.runId,
        eventSequence: event.sequence
      };
    case 'queue.dead_letter':
    case 'backpressure':
      return {
        id,
        title: 'Queue pressure detected',
        detail,
        tone: 'critical',
        createdAt,
        read: false,
        route,
        source: 'runtime',
        sessionId: event.sessionId,
        runId: event.runId,
        eventSequence: event.sequence
      };
    case 'security.decision':
      return {
        id,
        title: 'Security decision recorded',
        detail,
        tone: event.level === 'error' ? 'critical' : 'warning',
        createdAt,
        read: false,
        route,
        source: 'runtime',
        sessionId: event.sessionId,
        runId: event.runId,
        eventSequence: event.sequence
      };
    case 'remediation.signal.ingested':
      return {
        id,
        title: 'Remediation signal received',
        detail,
        tone: 'warning',
        createdAt,
        read: false,
        route,
        source: 'runtime',
        sessionId: event.sessionId,
        runId: event.runId,
        eventSequence: event.sequence
      };
    case 'remediation.plan.created':
    case 'remediation.plan.executed':
      return {
        id,
        title: event.kind === 'remediation.plan.created' ? 'Remediation plan drafted' : 'Remediation plan executed',
        detail,
        tone: 'info',
        createdAt,
        read: false,
        route,
        source: 'runtime',
        sessionId: event.sessionId,
        runId: event.runId,
        eventSequence: event.sequence
      };
    case 'vault.secret.revoked':
      return {
        id,
        title: 'Vault secret revoked',
        detail,
        tone: 'warning',
        createdAt,
        read: false,
        route,
        source: 'runtime',
        sessionId: event.sessionId,
        runId: event.runId,
        eventSequence: event.sequence
      };
    default:
      if (event.level === 'error') {
        return {
          id,
          title: 'Runtime error',
          detail,
          tone: 'critical',
          createdAt,
          read: false,
          route,
          source: 'runtime',
          sessionId: event.sessionId,
          runId: event.runId,
          eventSequence: event.sequence
        };
      }

      if (event.level === 'warn' && !event.kind.startsWith('terminal.')) {
        return {
          id,
          title: 'Runtime warning',
          detail,
          tone: 'warning',
          createdAt,
          read: false,
          route,
          source: 'runtime',
          sessionId: event.sessionId,
          runId: event.runId,
          eventSequence: event.sequence
        };
      }
  }

  return null;
}

