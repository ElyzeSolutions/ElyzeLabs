import type { RuntimeKind } from '@ops/shared';

export type WatchdogHealthStatus =
  | 'healthy'
  | 'stalled_no_output'
  | 'error_detected'
  | 'quota_exceeded'
  | 'context_overflow'
  | 'stuck_at_prompt';

export type WatchdogRecommendation = 'continue' | 'abort_and_retry' | 'abort_and_switch_provider' | 'alert_human';

export interface RuntimeErrorSignature {
  id: string;
  runtime: RuntimeKind | 'any';
  status: Exclude<WatchdogHealthStatus, 'healthy' | 'stalled_no_output'>;
  recommendation: Exclude<WatchdogRecommendation, 'continue'>;
  pattern: RegExp;
  label: string;
}

export interface MatchedRuntimeSignature {
  signature: RuntimeErrorSignature;
  match: string;
}

const SIGNATURES: RuntimeErrorSignature[] = [
  {
    id: 'codex_quota_rate_limit',
    runtime: 'codex',
    status: 'quota_exceeded',
    recommendation: 'abort_and_switch_provider',
    pattern:
      /\b(rate[_ -]?limit[_ -]?exceeded|too many requests|quota exceeded|resource exhausted|model overloaded|overloaded_error|high demand|usage limit)\b/i,
    label: 'Codex quota/rate saturation'
  },
  {
    id: 'codex_http_429_error',
    runtime: 'codex',
    status: 'quota_exceeded',
    recommendation: 'abort_and_switch_provider',
    pattern: /\b(error|failed|fatal|http(?:\s+status)?|response status)\b[^\n\r]{0,24}\b429\b/i,
    label: 'Codex HTTP 429 error context'
  },
  {
    id: 'codex_context_overflow',
    runtime: 'codex',
    status: 'context_overflow',
    recommendation: 'abort_and_retry',
    pattern:
      /\b(context[_ -]?length[_ -]?exceeded|maximum context length|token limit exceeded|prompt too long|(?:context[_ -]?window|context[_ -]?length|token limit)[^\n\r]{0,48}\b(exceeded|overflow|too long|reached|maximum|max(?:imum)?))\b/i,
    label: 'Codex context overflow'
  },
  {
    id: 'codex_transport_failure',
    runtime: 'codex',
    status: 'error_detected',
    recommendation: 'abort_and_retry',
    pattern:
      /(?:\b(?:error|failed|fatal)\b[^\n\r]{0,48}\bserver error\b|\bserver error\b[^\n\r]{0,48}\b(?:request|response|provider|transport|connection|stream)\b|\b(?:econnreset|connection reset|socket hang up)\b)/i,
    label: 'Codex transport failure'
  },
  {
    id: 'claude_quota',
    runtime: 'claude',
    status: 'quota_exceeded',
    recommendation: 'abort_and_switch_provider',
    pattern: /\b(organization exceeded|quota exceeded|credit balance too low|overloaded_error)\b/i,
    label: 'Claude quota exhausted'
  },
  {
    id: 'claude_permission_denied',
    runtime: 'claude',
    status: 'error_detected',
    recommendation: 'alert_human',
    pattern: /\b(permission denied|access denied)\b/i,
    label: 'Claude permission denied'
  },
  {
    id: 'gemini_quota',
    runtime: 'gemini',
    status: 'quota_exceeded',
    recommendation: 'abort_and_switch_provider',
    pattern: /\b(resource exhausted|quota exceeded|429 resource_exhausted|model is overloaded)\b/i,
    label: 'Gemini quota exhausted'
  },
  {
    id: 'stuck_at_prompt',
    runtime: 'any',
    status: 'stuck_at_prompt',
    recommendation: 'alert_human',
    pattern: /\b(waiting for input|awaiting input|stuck at prompt|no command entered)\b/i,
    label: 'Stuck at prompt'
  },
  {
    id: 'git_ssh_interactive_prompt',
    runtime: 'any',
    status: 'stuck_at_prompt',
    recommendation: 'alert_human',
    pattern:
      /\b(enter passphrase for key|username for 'https:\/\/github\.com|password for 'https:\/\/github\.com|are you sure you want to continue connecting \(yes\/no(?:\/\[fingerprint\])?\)\?)\b/i,
    label: 'Git/SSH interactive prompt'
  },
  {
    id: 'git_auth_or_ssh_failure',
    runtime: 'any',
    status: 'error_detected',
    recommendation: 'alert_human',
    pattern:
      /(permission denied \(publickey\)|host key verification failed|could not read username for 'https:\/\/github\.com|authentication failed|repository not found)/i,
    label: 'Git auth or SSH failure'
  },
  {
    id: 'generic_runtime_error',
    runtime: 'any',
    status: 'error_detected',
    recommendation: 'abort_and_retry',
    pattern: /\b(fatal error|uncaught exception|traceback|panic:|segmentation fault)\b/i,
    label: 'Generic runtime error'
  }
];

function isBenignCodexAnalyticsWarning(text: string): boolean {
  const normalized = text.toLowerCase();
  if (!normalized.includes('analytics_client') && !normalized.includes('analytics-events')) {
    return false;
  }
  if (!normalized.includes('codex')) {
    return false;
  }
  return (
    normalized.includes('events failed with status') ||
    normalized.includes('backend-api/codex/analytics-events') ||
    normalized.includes('analytics-events/events')
  );
}

export function errorSignatureCatalog(): RuntimeErrorSignature[] {
  return SIGNATURES.slice();
}

export function matchRuntimeSignatures(
  runtime: RuntimeKind,
  text: string,
  options?: { maxMatches?: number }
): MatchedRuntimeSignature[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const maxMatches = Math.max(1, Math.floor(options?.maxMatches ?? 1));
  const matches: MatchedRuntimeSignature[] = [];
  for (const signature of SIGNATURES) {
    if (signature.runtime !== 'any' && signature.runtime !== runtime) {
      continue;
    }
    if (signature.id === 'codex_transport_failure' && runtime === 'codex' && isBenignCodexAnalyticsWarning(trimmed)) {
      continue;
    }
    const match = trimmed.match(signature.pattern);
    if (!match) {
      continue;
    }
    matches.push({
      signature,
      match: match[0] ?? ''
    });
    if (matches.length >= maxMatches) {
      break;
    }
  }
  return matches;
}

export function matchRuntimeSignature(runtime: RuntimeKind, text: string): MatchedRuntimeSignature | null {
  return matchRuntimeSignatures(runtime, text, { maxMatches: 1 })[0] ?? null;
}

export function isQuotaSaturationSignal(runtime: RuntimeKind, text: string): boolean {
  return matchRuntimeSignatures(runtime, text, { maxMatches: 6 }).some(
    (entry) => entry.signature.status === 'quota_exceeded' || entry.signature.recommendation === 'abort_and_switch_provider'
  );
}
