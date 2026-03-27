export const AGENT_TEAM_ORDER = [
  'LEADERSHIP',
  'ENGINEERING',
  'CREATIVE',
  'INTELLIGENCE',
  'COMMUNICATIONS',
] as const;

export type AgentTeam = (typeof AGENT_TEAM_ORDER)[number];

export const AGENT_TEAM_OPTIONS: Array<{ value: string; label: AgentTeam }> = AGENT_TEAM_ORDER.map((team) => ({
  value: team.toLowerCase(),
  label: team,
}));

interface AgentTeamSource {
  agentId?: string | null;
  id?: string | null;
  name?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
}

const TEAM_ALIAS_MAP: Record<string, AgentTeam> = {
  leadership: 'LEADERSHIP',
  executive: 'LEADERSHIP',
  strategy: 'LEADERSHIP',
  management: 'LEADERSHIP',
  engineering: 'ENGINEERING',
  engineer: 'ENGINEERING',
  development: 'ENGINEERING',
  developer: 'ENGINEERING',
  creative: 'CREATIVE',
  design: 'CREATIVE',
  motion: 'CREATIVE',
  video: 'CREATIVE',
  intelligence: 'INTELLIGENCE',
  research: 'INTELLIGENCE',
  scouting: 'INTELLIGENCE',
  scout: 'INTELLIGENCE',
  communications: 'COMMUNICATIONS',
  communication: 'COMMUNICATIONS',
  writing: 'COMMUNICATIONS',
  writer: 'COMMUNICATIONS',
  content: 'COMMUNICATIONS',
  marketing: 'COMMUNICATIONS',
  comms: 'COMMUNICATIONS',
};

const normalizeWord = (value: string): string => value.trim().toLowerCase().replace(/[_-]+/g, ' ');

export function normalizeAgentDepartment(raw: unknown): AgentTeam | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = normalizeWord(raw);
  if (!normalized) {
    return null;
  }

  if (normalized in TEAM_ALIAS_MAP) {
    return TEAM_ALIAS_MAP[normalized];
  }

  const condensed = normalized.replace(/\s+/g, '');
  if (condensed in TEAM_ALIAS_MAP) {
    return TEAM_ALIAS_MAP[condensed];
  }

  return null;
}

const includesAny = (haystack: string, needles: string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

export function inferAgentTeam(source: AgentTeamSource): AgentTeam {
  const text = normalizeWord(
    [source.agentId ?? source.id ?? '', source.name ?? '', source.title ?? ''].filter(Boolean).join(' ')
  );

  if (includesAny(text, ['ceo', 'chief executive', 'orchestrator', 'leadership', 'executive'])) {
    return 'LEADERSHIP';
  }
  if (
    includesAny(text, [
      'software engineer',
      'engineer',
      'developer',
      'development',
      'builder',
      'dev',
      'code',
      'qa',
      'test',
      'infra',
      'platform',
    ])
  ) {
    return 'ENGINEERING';
  }
  if (includesAny(text, ['design', 'designer', 'creative', 'video', 'motion', 'brand'])) {
    return 'CREATIVE';
  }
  if (includesAny(text, ['research', 'scout', 'intelligence', 'analyst', 'analysis'])) {
    return 'INTELLIGENCE';
  }
  if (includesAny(text, ['writer', 'writing', 'communications', 'marketing', 'comms', 'content'])) {
    return 'COMMUNICATIONS';
  }

  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = text.charCodeAt(index) + ((hash << 5) - hash);
  }
  return AGENT_TEAM_ORDER[Math.abs(hash) % AGENT_TEAM_ORDER.length] ?? 'ENGINEERING';
}

export function resolveAgentTeam(source: AgentTeamSource): AgentTeam {
  return normalizeAgentDepartment(source.metadata?.department) ?? inferAgentTeam(source);
}

export function toAgentTeamInputValue(raw: unknown): string {
  return normalizeAgentDepartment(raw)?.toLowerCase() ?? '';
}
