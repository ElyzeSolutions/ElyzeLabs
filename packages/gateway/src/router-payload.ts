import { parseJsonSafe } from '@ops/shared';

export interface RouterPayloadExtractionDiagnostics {
  textSourcesScanned: number;
  objectCandidates: number;
  rankedCandidates: number;
}

export interface RouterPayloadExtractionResult {
  payload: Record<string, unknown> | null;
  diagnostics: RouterPayloadExtractionDiagnostics;
}

interface ExtractionOptions {
  maxTextSources?: number;
  maxObjectCandidates?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectNestedTextSources(value: unknown, output: string[], depth = 0): void {
  if (depth > 6 || output.length >= 256) {
    return;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      output.push(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectNestedTextSources(entry, output, depth + 1);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const entry of Object.values(value)) {
    collectNestedTextSources(entry, output, depth + 1);
  }
}

function collectBalancedJsonObjects(raw: string): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (!char) {
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
    }
    escape = char === '\\' && !escape;

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      if (depth === 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const slice = raw.slice(start, index + 1);
        const parsed = parseJsonSafe<unknown>(slice, null);
        if (isRecord(parsed)) {
          candidates.push(parsed);
        }
        start = -1;
      }
    }
  }

  return candidates;
}

function collectLooseJsonObjectsFromText(raw: string): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const push = (value: unknown): void => {
    if (!isRecord(value)) {
      return;
    }
    const key = stableStringify(value);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(value);
  };

  const normalized = raw.trim();
  if (!normalized) {
    return candidates;
  }

  push(parseJsonSafe<unknown>(normalized, null));

  for (const block of Array.from(normalized.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))) {
    const candidate = block[1];
    if (!candidate) {
      continue;
    }
    push(parseJsonSafe<unknown>(candidate, null));
  }

  for (const line of normalized.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      continue;
    }
    push(parseJsonSafe<unknown>(trimmed, null));
  }

  for (const candidate of collectBalancedJsonObjects(normalized)) {
    push(candidate);
  }

  return candidates;
}

function normalizeRouterPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...payload };
  if (!Array.isArray(normalized.targetAgentIds)) {
    if (Array.isArray(normalized.targets)) {
      normalized.targetAgentIds = normalized.targets;
    } else if (Array.isArray(normalized.selectedAgentIds)) {
      normalized.targetAgentIds = normalized.selectedAgentIds;
    } else if (Array.isArray(normalized.assignments)) {
      const assignmentTargets = normalized.assignments
        .map((entry) => {
          if (!isRecord(entry)) {
            return null;
          }
          const target = entry.targetAgentId ?? entry.assignedAgentId ?? entry.agentId ?? entry.id ?? null;
          return typeof target === 'string' ? target : null;
        })
        .filter((entry): entry is string => typeof entry === 'string');
      if (assignmentTargets.length > 0) {
        normalized.targetAgentIds = assignmentTargets;
      }
    } else if (typeof normalized.targetAgentId === 'string') {
      normalized.targetAgentIds = [normalized.targetAgentId];
    }
  }
  return normalized;
}

function scoreRouterPayload(payload: Record<string, unknown>): number {
  const normalized = normalizeRouterPayload(payload);
  const targets = Array.isArray(normalized.targetAgentIds)
    ? normalized.targetAgentIds.map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : '')).filter(Boolean)
    : [];

  let score = 0;
  if (targets.length > 0) {
    score += 8 + Math.min(6, targets.length);
  }

  const allPlaceholderTargets = targets.length > 0 && targets.every((entry) => entry === 'agent-id' || entry === 'agent id');
  if (allPlaceholderTargets) {
    return 0;
  }

  const reason = typeof normalized.reason === 'string' ? normalized.reason.trim().toLowerCase() : '';
  if (reason.length > 0) {
    score += 2;
    if (reason === 'short rationale') {
      score -= 2;
    }
  }

  const confidence = Number(normalized.confidence);
  if (Number.isFinite(confidence)) {
    score += 2;
  }

  const assignments = Array.isArray(normalized.assignments)
    ? normalized.assignments.filter((entry) => {
        if (!isRecord(entry)) {
          return false;
        }
        const itemId = String(entry.itemId ?? entry.taskId ?? '').trim();
        const target = String(entry.targetAgentId ?? entry.assignedAgentId ?? entry.agentId ?? '').trim();
        return itemId.length > 0 && target.length > 0;
      })
    : [];
  if (assignments.length > 0) {
    score += 12 + Math.min(12, assignments.length);
  }

  return score;
}

export function extractDelegationRouterPayload(
  input: {
    summary: string;
    raw: string;
  },
  options: ExtractionOptions = {}
): RouterPayloadExtractionResult {
  const maxTextSources = Math.max(8, Math.min(256, options.maxTextSources ?? 96));
  const maxObjectCandidates = Math.max(8, Math.min(512, options.maxObjectCandidates ?? 160));

  const pendingTexts: string[] = [];
  const seenTexts = new Set<string>();
  const objects: Record<string, unknown>[] = [];
  const seenObjects = new Set<string>();

  const enqueueText = (value: unknown): void => {
    const text = normalizeText(value);
    if (!text || seenTexts.has(text) || pendingTexts.length >= maxTextSources) {
      return;
    }
    pendingTexts.push(text);
  };

  const pushObject = (candidate: Record<string, unknown>): void => {
    if (objects.length >= maxObjectCandidates) {
      return;
    }
    const key = stableStringify(candidate);
    if (seenObjects.has(key)) {
      return;
    }
    seenObjects.add(key);
    objects.push(candidate);

    const nestedTexts: string[] = [];
    collectNestedTextSources(candidate, nestedTexts);
    for (const text of nestedTexts) {
      enqueueText(text);
    }
  };

  enqueueText(input.summary);
  enqueueText(input.raw);

  while (pendingTexts.length > 0 && seenTexts.size < maxTextSources && objects.length < maxObjectCandidates) {
    const text = pendingTexts.shift();
    if (!text) {
      continue;
    }
    if (seenTexts.has(text)) {
      continue;
    }
    seenTexts.add(text);

    for (const candidate of collectLooseJsonObjectsFromText(text)) {
      pushObject(candidate);
      if (objects.length >= maxObjectCandidates) {
        break;
      }
    }
  }

  const ranked = objects
    .map((candidate) => ({ candidate: normalizeRouterPayload(candidate), score: scoreRouterPayload(candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return {
    payload: ranked[0]?.candidate ?? null,
    diagnostics: {
      textSourcesScanned: seenTexts.size,
      objectCandidates: objects.length,
      rankedCandidates: ranked.length
    }
  };
}
