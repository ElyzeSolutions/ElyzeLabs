export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

const REASONING_ALIASES: Record<string, ReasoningEffort> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  'extra-high': 'xhigh',
  extra_high: 'xhigh',
  extrahigh: 'xhigh'
};

function normalizeModel(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === 'default' || lowered === 'none' || lowered === 'null') {
    return null;
  }
  return trimmed;
}

export function normalizeReasoningEffort(value: unknown): ReasoningEffort | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return REASONING_ALIASES[normalized] ?? null;
}

export function parseModelAndReasoning(value: unknown): { model: string | null; reasoningEffort: ReasoningEffort | null } {
  if (typeof value !== 'string') {
    return {
      model: null,
      reasoningEffort: null
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      model: null,
      reasoningEffort: null
    };
  }

  const suffixMatch = trimmed.match(/^(.*?)\s+(?:in\s+)?(low|medium|high|xhigh|extra-high|extra_high|extrahigh)$/i);
  if (!suffixMatch) {
    return {
      model: normalizeModel(trimmed),
      reasoningEffort: null
    };
  }

  const model = normalizeModel(suffixMatch[1] ?? '');
  const reasoningEffort = normalizeReasoningEffort(suffixMatch[2] ?? null);
  return {
    model,
    reasoningEffort
  };
}
