import type { MemorySearchResult } from '@ops/memory';
import type { MessageRecord } from '@ops/shared';

export interface ContextAssemblyPolicy {
  enabled: boolean;
  totalTokenBudget: number;
  overflowStrategy: 'shrink' | 'fail_fast';
  transcriptWindowTurns: number;
  transcriptMaxMessages: number;
  memoryTopK: number;
  memoryMinScore: number;
  reserves: {
    instructions: number;
    task: number;
    recentTranscript: number;
    memoryRecall: number;
  };
  dropOrder: Array<'memory_recall' | 'recent_transcript' | 'instructions'>;
}

export interface PromptAssemblySegmentUsage {
  id: 'instructions' | 'task' | 'recent_transcript' | 'memory_recall';
  estimatedTokens: number;
  budgetTokens: number;
  included: boolean;
  droppedReason: string | null;
}

export interface PromptAssemblyResult {
  prompt: string;
  contextLimit: number;
  totalEstimatedTokens: number;
  overflowed: boolean;
  overflowReason: string | null;
  segments: PromptAssemblySegmentUsage[];
  droppedSegments: Array<{ id: string; reason: string; estimatedTokens: number }>;
  continuityCoverage: {
    transcriptMessagesSelected: number;
    transcriptTurnsSelected: number;
    memoryCandidatesSelected: number;
    unresolvedConstraintIncluded: boolean;
    latestInboundDeduped: boolean;
    scope: string;
    continuitySummaryIncluded: boolean;
    compactionMode: string | null;
  };
}

interface SegmentState {
  id: PromptAssemblySegmentUsage['id'];
  text: string;
  budgetTokens: number;
  included: boolean;
  droppedReason: string | null;
}

const TOKEN_CHAR_RATIO = 4;
const CONTINUITY_INBOUND_SOURCES = new Set(['telegram', 'dashboard', 'api', 'agent']);

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / TOKEN_CHAR_RATIO));
}

function truncateToTokens(text: string, budgetTokens: number): string {
  const safeBudget = Math.max(0, Math.floor(budgetTokens));
  if (safeBudget <= 0) {
    return '';
  }
  const maxChars = safeBudget * TOKEN_CHAR_RATIO;
  if (text.length <= maxChars) {
    return text;
  }
  const clipped = text.slice(0, Math.max(0, maxChars - 3)).trimEnd();
  return clipped.length > 0 ? `${clipped}...` : '';
}

function splitPromptIntoInstructionsAndTask(basePrompt: string): { instructions: string; task: string } {
  const marker = '\nTASK:';
  const markerIndex = basePrompt.indexOf(marker);
  if (markerIndex === -1) {
    return {
      instructions: '',
      task: basePrompt.trim()
    };
  }
  const instructions = basePrompt.slice(0, markerIndex).trim();
  const task = basePrompt.slice(markerIndex + marker.length).trim();
  return {
    instructions,
    task
  };
}

function dedupeMessages(messages: MessageRecord[]): MessageRecord[] {
  const seen = new Set<string>();
  const output: MessageRecord[] = [];
  for (const message of messages) {
    const key = `${message.direction}:${message.source}:${message.sender}:${message.content.trim().toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(message);
  }
  return output;
}

function normalizeContinuityText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function taskRepresentsLatestInbound(taskHint: string | null | undefined, content: string): boolean {
  const normalizedTask = normalizeContinuityText(taskHint ?? '');
  const normalizedContent = normalizeContinuityText(content);
  if (!normalizedTask || !normalizedContent) {
    return false;
  }
  if (normalizedTask === normalizedContent) {
    return true;
  }
  if (normalizedTask.length >= 24 && normalizedTask.includes(normalizedContent)) {
    return true;
  }
  if (normalizedContent.length >= 24 && normalizedContent.includes(normalizedTask)) {
    return true;
  }
  return false;
}

function selectTranscriptWindow(
  messages: MessageRecord[],
  maxMessages: number,
  maxTurns: number,
  taskHint?: string | null
): {
  selected: MessageRecord[];
  turns: number;
  unresolvedConstraintIncluded: boolean;
  latestInboundDeduped: boolean;
} {
  if (messages.length === 0 || maxMessages <= 0 || maxTurns <= 0) {
    return {
      selected: [],
      turns: 0,
      unresolvedConstraintIncluded: false,
      latestInboundDeduped: false
    };
  }

  const desc = [...messages].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
  const latestInbound = desc.find(
    (message) =>
      message.direction === 'inbound' &&
      CONTINUITY_INBOUND_SOURCES.has(message.source)
  );
  const latestInboundDeduped = Boolean(latestInbound && taskRepresentsLatestInbound(taskHint, latestInbound.content));

  const asc = dedupeMessages(desc.reverse()).filter((message) => {
    if (!latestInboundDeduped || !latestInbound) {
      return true;
    }
    return message.id !== latestInbound.id;
  });
  const boundedByMessages = asc.slice(-Math.max(1, maxMessages));

  const selectedDesc: MessageRecord[] = [];
  let turnCount = 0;
  for (let index = boundedByMessages.length - 1; index >= 0; index -= 1) {
    const message = boundedByMessages[index]!;
    selectedDesc.push(message);
    if (message.direction === 'inbound') {
      turnCount += 1;
      if (turnCount >= maxTurns) {
        break;
      }
    }
  }

  const selected = selectedDesc.reverse();
  return {
    selected,
    turns: turnCount,
    unresolvedConstraintIncluded:
      latestInboundDeduped || Boolean(latestInbound && selected.some((entry) => entry.id === latestInbound.id)),
    latestInboundDeduped
  };
}

function renderTranscript(messages: MessageRecord[]): string {
  return messages
    .map((message) => {
      const timestamp = message.createdAt.slice(11, 19);
      const source = `${message.source}/${message.direction}`;
      return `[${timestamp}] ${source} ${message.sender}: ${message.content.trim()}`;
    })
    .join('\n');
}

function renderMemoryRecall(memoryRows: MemorySearchResult[], memoryMinScore: number, transcriptText: string): {
  text: string;
  selectedCount: number;
} {
  const transcriptLower = transcriptText.toLowerCase();
  const selected = memoryRows.filter((row) => row.combinedScore >= memoryMinScore).filter((row) => {
    const sample = row.item.content.slice(0, 120).toLowerCase();
    if (!sample) {
      return false;
    }
    return !transcriptLower.includes(sample);
  });

  if (selected.length === 0) {
    return {
      text: '',
      selectedCount: 0
    };
  }

  const text = selected
    .map((row, index) => {
      const snippet = row.item.content.replace(/\s+/g, ' ').trim().slice(0, 320);
      const citations = row.citations.length > 0 ? ` citations=${row.citations.slice(0, 3).join(',')}` : '';
      return `${index + 1}. score=${row.combinedScore.toFixed(3)}${citations} :: ${snippet}`;
    })
    .join('\n');

  return {
    text,
    selectedCount: selected.length
  };
}

function normalizeReserves(policy: ContextAssemblyPolicy): ContextAssemblyPolicy['reserves'] {
  const total = Math.max(1, policy.totalTokenBudget);
  const requested = {
    instructions: Math.max(0, policy.reserves.instructions),
    task: Math.max(0, policy.reserves.task),
    recentTranscript: Math.max(0, policy.reserves.recentTranscript),
    memoryRecall: Math.max(0, policy.reserves.memoryRecall)
  };
  const requestedTotal =
    requested.instructions + requested.task + requested.recentTranscript + requested.memoryRecall;
  if (requestedTotal <= total || policy.overflowStrategy === 'fail_fast') {
    return requested;
  }

  const scale = total / requestedTotal;
  return {
    instructions: Math.max(32, Math.floor(requested.instructions * scale)),
    task: Math.max(32, Math.floor(requested.task * scale)),
    recentTranscript: Math.max(0, Math.floor(requested.recentTranscript * scale)),
    memoryRecall: Math.max(0, Math.floor(requested.memoryRecall * scale))
  };
}

function renderPrompt(segments: SegmentState[]): string {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const sections: string[] = [];
  const instructions = byId.get('instructions');
  const transcript = byId.get('recent_transcript');
  const memory = byId.get('memory_recall');
  const task = byId.get('task');

  if (instructions?.included && instructions.text.trim()) {
    sections.push(`INSTRUCTIONS:\n${instructions.text.trim()}`);
  }
  if (transcript?.included && transcript.text.trim()) {
    sections.push(`RECENT_TRANSCRIPT:\n${transcript.text.trim()}`);
  }
  if (memory?.included && memory.text.trim()) {
    sections.push(`MEMORY_RECALL:\n${memory.text.trim()}`);
  }
  if (task?.included && task.text.trim()) {
    sections.push(`CURRENT_TASK:\n${task.text.trim()}`);
  }
  return sections.join('\n\n').trim();
}

export function buildPromptAssembly(input: {
  basePrompt: string;
  messages: MessageRecord[];
  memoryRows: MemorySearchResult[];
  policy: ContextAssemblyPolicy;
  taskHint?: string | null;
  scope?: string;
  continuitySummaryIncluded?: boolean;
  compactionMode?: string | null;
}): PromptAssemblyResult {
  const policy = input.policy;
  if (!policy.enabled) {
    const prompt = input.basePrompt.trim();
    return {
      prompt,
      contextLimit: Number.MAX_SAFE_INTEGER,
      totalEstimatedTokens: estimateTokens(prompt),
      overflowed: false,
      overflowReason: null,
      segments: [
        { id: 'instructions', estimatedTokens: 0, budgetTokens: 0, included: false, droppedReason: null },
        { id: 'task', estimatedTokens: estimateTokens(prompt), budgetTokens: estimateTokens(prompt), included: true, droppedReason: null },
        { id: 'recent_transcript', estimatedTokens: 0, budgetTokens: 0, included: false, droppedReason: 'disabled' },
        { id: 'memory_recall', estimatedTokens: 0, budgetTokens: 0, included: false, droppedReason: 'disabled' }
      ],
      droppedSegments: [],
      continuityCoverage: {
        transcriptMessagesSelected: 0,
        transcriptTurnsSelected: 0,
        memoryCandidatesSelected: 0,
        unresolvedConstraintIncluded: false,
        latestInboundDeduped: false,
        scope: input.scope ?? 'operator',
        continuitySummaryIncluded: input.continuitySummaryIncluded === true,
        compactionMode: input.compactionMode ?? null
      }
    };
  }

  const contextLimit = Math.max(256, policy.totalTokenBudget);
  const reserves = normalizeReserves(policy);
  const split = splitPromptIntoInstructionsAndTask(input.basePrompt);
  const transcriptSelection = selectTranscriptWindow(
    input.messages,
    policy.transcriptMaxMessages,
    policy.transcriptWindowTurns,
    input.taskHint
  );
  const transcriptText = renderTranscript(transcriptSelection.selected);
  const memoryRendered = renderMemoryRecall(input.memoryRows.slice(0, policy.memoryTopK), policy.memoryMinScore, transcriptText);

  const segments: SegmentState[] = [
    {
      id: 'instructions',
      text: truncateToTokens(split.instructions, reserves.instructions),
      budgetTokens: reserves.instructions,
      included: Boolean(split.instructions.trim()),
      droppedReason: null
    },
    {
      id: 'task',
      text: truncateToTokens(split.task, reserves.task),
      budgetTokens: reserves.task,
      included: Boolean(split.task.trim()),
      droppedReason: null
    },
    {
      id: 'recent_transcript',
      text: truncateToTokens(transcriptText, reserves.recentTranscript),
      budgetTokens: reserves.recentTranscript,
      included: Boolean(transcriptText.trim()) && reserves.recentTranscript > 0,
      droppedReason: transcriptText.trim() ? null : 'no_transcript'
    },
    {
      id: 'memory_recall',
      text: truncateToTokens(memoryRendered.text, reserves.memoryRecall),
      budgetTokens: reserves.memoryRecall,
      included: Boolean(memoryRendered.text.trim()) && reserves.memoryRecall > 0,
      droppedReason: memoryRendered.text.trim() ? null : 'no_memory_hits'
    }
  ];

  const recomputeTotal = (): number => estimateTokens(renderPrompt(segments));

  let totalEstimatedTokens = recomputeTotal();
  let overflowed = totalEstimatedTokens > contextLimit;
  let overflowReason: string | null = overflowed ? 'preflight_over_budget' : null;

  if (overflowed && policy.overflowStrategy === 'shrink') {
    for (const segmentId of policy.dropOrder) {
      if (totalEstimatedTokens <= contextLimit) {
        break;
      }
      const segment = segments.find((entry) => entry.id === segmentId);
      if (!segment || !segment.included) {
        continue;
      }
      segment.included = false;
      segment.droppedReason = 'dropped_for_budget';
      totalEstimatedTokens = recomputeTotal();
    }

    if (totalEstimatedTokens > contextLimit) {
      const task = segments.find((entry) => entry.id === 'task');
      if (task && task.included) {
        const nonTask = segments
          .filter((entry) => entry.id !== 'task' && entry.included)
          .reduce((sum, entry) => sum + estimateTokens(entry.text), 0);
        const remaining = Math.max(32, contextLimit - nonTask);
        task.text = truncateToTokens(task.text, remaining);
      }
      totalEstimatedTokens = recomputeTotal();
    }

    overflowed = totalEstimatedTokens > contextLimit;
    overflowReason = overflowed ? 'budget_exhausted_after_shrink' : null;
  }

  const droppedSegments = segments
    .filter((segment) => !segment.included && segment.droppedReason)
    .map((segment) => ({
      id: segment.id,
      reason: segment.droppedReason as string,
      estimatedTokens: estimateTokens(segment.text)
    }));

  const prompt = renderPrompt(segments);
  totalEstimatedTokens = estimateTokens(prompt);
  overflowed = totalEstimatedTokens > contextLimit;
  if (overflowed && !overflowReason) {
    overflowReason = policy.overflowStrategy === 'fail_fast' ? 'preflight_over_budget' : 'budget_exhausted_after_shrink';
  }

  return {
    prompt,
    contextLimit,
    totalEstimatedTokens,
    overflowed,
    overflowReason,
    segments: segments.map((segment) => ({
      id: segment.id,
      estimatedTokens: segment.included ? estimateTokens(segment.text) : 0,
      budgetTokens: segment.budgetTokens,
      included: segment.included,
      droppedReason: segment.droppedReason
    })),
    droppedSegments,
    continuityCoverage: {
      transcriptMessagesSelected: transcriptSelection.selected.length,
      transcriptTurnsSelected: transcriptSelection.turns,
      memoryCandidatesSelected: memoryRendered.selectedCount,
      unresolvedConstraintIncluded: transcriptSelection.unresolvedConstraintIncluded,
      latestInboundDeduped: transcriptSelection.latestInboundDeduped,
      scope: input.scope ?? 'operator',
      continuitySummaryIncluded: input.continuitySummaryIncluded === true,
      compactionMode: input.compactionMode ?? null
    }
  };
}
