export type LlmAuthProfileProvider = 'google' | 'openrouter';
export type LlmAuthProfileStatus = 'active' | 'cooldown' | 'billing_disabled' | 'disabled';
export type LlmAuthProfileCredentialSource = 'env' | 'vault' | 'env_or_vault';

export interface LlmAuthProfileDefinition {
  id: string;
  provider: LlmAuthProfileProvider;
  label: string;
  priority: number;
  configured: boolean;
  credentialSource: LlmAuthProfileCredentialSource;
  credentialEnvKey: string | null;
  credentialVaultKey: string | null;
}

export interface LlmAuthProfileState {
  profileId: string;
  status: LlmAuthProfileStatus;
  cooldownUntil: string | null;
  disabledUntil: string | null;
  disabledReason: string | null;
  lastSelectedAt: string | null;
  selectionCount: number;
  failureCount: number;
  billingFailureCount: number;
  updatedAt: string | null;
  updatedBy: string | null;
  note: string | null;
}

export interface LlmAuthProfileAuditEntry {
  id: string;
  at: string;
  action: 'selected' | 'updated';
  provider: LlmAuthProfileProvider;
  profileId: string;
  actor: string;
  reason: string;
  runtime: string | null;
  model: string | null;
  sessionId: string | null;
  runId: string | null;
}

export interface LlmAuthProfileSnapshot {
  schema: 'ops.llm-auth-profiles.v1';
  updatedAt: string;
  profiles: LlmAuthProfileDefinition[];
  states: LlmAuthProfileState[];
  audit: LlmAuthProfileAuditEntry[];
}

export interface LlmAuthProfileReportEntry extends LlmAuthProfileDefinition {
  state: LlmAuthProfileState;
  effectiveStatus: LlmAuthProfileStatus;
  eligible: boolean;
  blockReason: string | null;
}

export interface LlmAuthProfileSelection {
  profile: LlmAuthProfileReportEntry | null;
  reason: string;
  pinnedProfileId: string | null;
  candidates: LlmAuthProfileReportEntry[];
}

export interface LlmAuthProfilePatch {
  provider: LlmAuthProfileProvider | null;
  label: string | null;
  priority: number | null;
  credentialSource: LlmAuthProfileCredentialSource | null;
  credentialEnvKey: string | null;
  credentialVaultKey: string | null;
  status: LlmAuthProfileStatus | null;
  cooldownUntil: string | null;
  disabledUntil: string | null;
  disabledReason: string | null;
  note: string | null;
}

const SNAPSHOT_SCHEMA = 'ops.llm-auth-profiles.v1';
const MAX_AUDIT_ENTRIES = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseProvider(value: unknown): LlmAuthProfileProvider | null {
  const normalized = cleanString(value)?.toLowerCase();
  if (normalized === 'google' || normalized === 'openrouter') {
    return normalized;
  }
  return null;
}

function parseStatus(value: unknown): LlmAuthProfileStatus | null {
  const normalized = cleanString(value)?.toLowerCase();
  if (
    normalized === 'active' ||
    normalized === 'cooldown' ||
    normalized === 'billing_disabled' ||
    normalized === 'disabled'
  ) {
    return normalized;
  }
  return null;
}

function parseCredentialSource(value: unknown): LlmAuthProfileCredentialSource | null {
  const normalized = cleanString(value)?.toLowerCase();
  if (normalized === 'env' || normalized === 'vault' || normalized === 'env_or_vault') {
    return normalized;
  }
  return null;
}

function parsePriority(value: unknown): number | null {
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.trunc(numeric);
}

function parseCount(value: unknown): number {
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : 0;
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : 0;
}

function parseIsoTimestamp(value: unknown): string | null {
  const raw = cleanString(value);
  if (!raw) {
    return null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function isSafeEnvKey(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(value);
}

export function isValidLlmAuthProfileId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{1,127}$/.test(value);
}

function defaultState(profileId: string): LlmAuthProfileState {
  return {
    profileId,
    status: 'active',
    cooldownUntil: null,
    disabledUntil: null,
    disabledReason: null,
    lastSelectedAt: null,
    selectionCount: 0,
    failureCount: 0,
    billingFailureCount: 0,
    updatedAt: null,
    updatedBy: null,
    note: null
  };
}

function parseProfile(input: unknown): LlmAuthProfileDefinition | null {
  if (!isRecord(input)) {
    return null;
  }
  const id = cleanString(input.id);
  const provider = parseProvider(input.provider);
  if (!id || !isValidLlmAuthProfileId(id) || !provider) {
    return null;
  }
  const label = cleanString(input.label) ?? id;
  const priority = parsePriority(input.priority) ?? 100;
  const credentialEnvKey = cleanString(input.credentialEnvKey);
  const credentialVaultKey = cleanString(input.credentialVaultKey);
  const credentialSource =
    parseCredentialSource(input.credentialSource) ??
    (credentialEnvKey && credentialVaultKey ? 'env_or_vault' : credentialVaultKey ? 'vault' : 'env');
  return {
    id,
    provider,
    label,
    priority,
    configured: input.configured === true,
    credentialSource,
    credentialEnvKey,
    credentialVaultKey
  };
}

function parseState(input: unknown): LlmAuthProfileState | null {
  if (!isRecord(input)) {
    return null;
  }
  const profileId = cleanString(input.profileId);
  if (!profileId || !isValidLlmAuthProfileId(profileId)) {
    return null;
  }
  return {
    profileId,
    status: parseStatus(input.status) ?? 'active',
    cooldownUntil: parseIsoTimestamp(input.cooldownUntil),
    disabledUntil: parseIsoTimestamp(input.disabledUntil),
    disabledReason: cleanString(input.disabledReason),
    lastSelectedAt: parseIsoTimestamp(input.lastSelectedAt),
    selectionCount: parseCount(input.selectionCount),
    failureCount: parseCount(input.failureCount),
    billingFailureCount: parseCount(input.billingFailureCount),
    updatedAt: parseIsoTimestamp(input.updatedAt),
    updatedBy: cleanString(input.updatedBy),
    note: cleanString(input.note)
  };
}

function parseAudit(input: unknown): LlmAuthProfileAuditEntry | null {
  if (!isRecord(input)) {
    return null;
  }
  const id = cleanString(input.id);
  const at = parseIsoTimestamp(input.at);
  const action = cleanString(input.action);
  const provider = parseProvider(input.provider);
  const profileId = cleanString(input.profileId);
  if (!id || !at || !provider || !profileId || (action !== 'selected' && action !== 'updated')) {
    return null;
  }
  return {
    id,
    at,
    action,
    provider,
    profileId,
    actor: cleanString(input.actor) ?? 'system',
    reason: cleanString(input.reason) ?? action,
    runtime: cleanString(input.runtime),
    model: cleanString(input.model),
    sessionId: cleanString(input.sessionId),
    runId: cleanString(input.runId)
  };
}

export function mergeLlmAuthProfileSnapshot(
  input: unknown,
  defaults: LlmAuthProfileDefinition[],
  nowIso: string
): LlmAuthProfileSnapshot {
  const raw = isRecord(input) ? input : {};
  const profileMap = new Map<string, LlmAuthProfileDefinition>();
  const rawProfiles = Array.isArray(raw.profiles) ? raw.profiles : [];
  for (const rawProfile of rawProfiles) {
    const parsed = parseProfile(rawProfile);
    if (parsed) {
      profileMap.set(parsed.id, parsed);
    }
  }
  for (const profile of defaults) {
    profileMap.set(profile.id, profile);
  }

  const stateMap = new Map<string, LlmAuthProfileState>();
  const rawStates = Array.isArray(raw.states) ? raw.states : [];
  for (const rawState of rawStates) {
    const parsed = parseState(rawState);
    if (parsed) {
      stateMap.set(parsed.profileId, parsed);
    }
  }

  const profiles = Array.from(profileMap.values()).sort((left, right) => {
    if (left.provider !== right.provider) {
      return left.provider.localeCompare(right.provider);
    }
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.id.localeCompare(right.id);
  });
  const states = profiles.map((profile) => stateMap.get(profile.id) ?? defaultState(profile.id));
  const rawAudit = Array.isArray(raw.audit) ? raw.audit : [];
  const audit = rawAudit
    .map(parseAudit)
    .filter((entry): entry is LlmAuthProfileAuditEntry => entry !== null)
    .sort((left, right) => left.at.localeCompare(right.at))
    .slice(-MAX_AUDIT_ENTRIES);

  return {
    schema: SNAPSHOT_SCHEMA,
    updatedAt: parseIsoTimestamp(raw.updatedAt) ?? nowIso,
    profiles,
    states,
    audit
  };
}

function serializeProfile(profile: LlmAuthProfileDefinition): Record<string, unknown> {
  return {
    id: profile.id,
    provider: profile.provider,
    label: profile.label,
    priority: profile.priority,
    configured: profile.configured,
    credentialSource: profile.credentialSource,
    credentialEnvKey: profile.credentialEnvKey,
    credentialVaultKey: profile.credentialVaultKey
  };
}

function serializeState(state: LlmAuthProfileState): Record<string, unknown> {
  return {
    profileId: state.profileId,
    status: state.status,
    cooldownUntil: state.cooldownUntil,
    disabledUntil: state.disabledUntil,
    disabledReason: state.disabledReason,
    lastSelectedAt: state.lastSelectedAt,
    selectionCount: state.selectionCount,
    failureCount: state.failureCount,
    billingFailureCount: state.billingFailureCount,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    note: state.note
  };
}

function serializeAudit(entry: LlmAuthProfileAuditEntry): Record<string, unknown> {
  return {
    id: entry.id,
    at: entry.at,
    action: entry.action,
    provider: entry.provider,
    profileId: entry.profileId,
    actor: entry.actor,
    reason: entry.reason,
    runtime: entry.runtime,
    model: entry.model,
    sessionId: entry.sessionId,
    runId: entry.runId
  };
}

export function serializeLlmAuthProfileSnapshot(snapshot: LlmAuthProfileSnapshot): Record<string, unknown> {
  return {
    schema: snapshot.schema,
    updatedAt: snapshot.updatedAt,
    profiles: snapshot.profiles.map(serializeProfile),
    states: snapshot.states.map(serializeState),
    audit: snapshot.audit.map(serializeAudit)
  };
}

function isFuture(value: string | null, nowMs: number): boolean {
  if (!value) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > nowMs;
}

export function listLlmAuthProfiles(
  snapshot: LlmAuthProfileSnapshot,
  nowIso: string
): LlmAuthProfileReportEntry[] {
  const nowMs = Date.parse(nowIso);
  const stateMap = new Map(snapshot.states.map((state) => [state.profileId, state]));
  return snapshot.profiles.map((profile) => {
    const state = stateMap.get(profile.id) ?? defaultState(profile.id);
    let eligible = profile.configured;
    let blockReason: string | null = profile.configured ? null : `provider_auth_profile_unconfigured:${profile.id}`;
    let effectiveStatus: LlmAuthProfileStatus = state.status;

    if (eligible && state.status === 'cooldown' && isFuture(state.cooldownUntil, nowMs)) {
      eligible = false;
      blockReason = `provider_auth_profile_cooldown:${profile.id}`;
    } else if (state.status === 'cooldown') {
      effectiveStatus = 'active';
    }

    if (eligible && state.status === 'billing_disabled' && (state.disabledUntil === null || isFuture(state.disabledUntil, nowMs))) {
      eligible = false;
      blockReason = `provider_auth_profile_billing_disabled:${profile.id}`;
    } else if (state.status === 'billing_disabled') {
      effectiveStatus = 'active';
    }

    if (eligible && state.status === 'disabled' && (state.disabledUntil === null || isFuture(state.disabledUntil, nowMs))) {
      eligible = false;
      blockReason = `provider_auth_profile_disabled:${profile.id}`;
    } else if (state.status === 'disabled') {
      effectiveStatus = 'active';
    }

    return {
      ...profile,
      state,
      effectiveStatus,
      eligible,
      blockReason
    };
  });
}

function sortSelectionCandidates(left: LlmAuthProfileReportEntry, right: LlmAuthProfileReportEntry): number {
  if (left.eligible !== right.eligible) {
    return left.eligible ? -1 : 1;
  }
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  const leftLast = left.state.lastSelectedAt ?? '';
  const rightLast = right.state.lastSelectedAt ?? '';
  if (leftLast !== rightLast) {
    return leftLast.localeCompare(rightLast);
  }
  return left.id.localeCompare(right.id);
}

export function selectLlmAuthProfile(input: {
  snapshot: LlmAuthProfileSnapshot;
  provider: LlmAuthProfileProvider;
  nowIso: string;
  pinnedProfileId?: string | null;
}): LlmAuthProfileSelection {
  const pinnedProfileId = input.pinnedProfileId ?? null;
  const candidates = listLlmAuthProfiles(input.snapshot, input.nowIso)
    .filter((profile) => profile.provider === input.provider)
    .sort(sortSelectionCandidates);
  const pinned = pinnedProfileId ? candidates.find((profile) => profile.id === pinnedProfileId) ?? null : null;
  if (pinned?.eligible) {
    return {
      profile: pinned,
      reason: 'session_pinned_profile',
      pinnedProfileId,
      candidates
    };
  }
  const selected = candidates.find((profile) => profile.eligible) ?? null;
  const firstBlockReason = candidates.find((profile) => profile.blockReason !== null)?.blockReason ?? null;
  return {
    profile: selected,
    reason: selected ? 'round_robin_profile' : firstBlockReason ?? `provider_auth_profiles_unavailable:${input.provider}`,
    pinnedProfileId,
    candidates
  };
}

function auditId(input: {
  nowIso: string;
  profileId: string;
  action: 'selected' | 'updated';
  count: number;
}): string {
  const compactNow = input.nowIso.replace(/[^0-9A-Za-z]/g, '');
  const compactProfile = input.profileId.replace(/[^0-9A-Za-z]/g, '').slice(0, 40);
  return `${compactNow}-${input.action}-${compactProfile}-${input.count}`;
}

export function recordLlmAuthProfileSelection(
  snapshot: LlmAuthProfileSnapshot,
  input: {
    profileId: string;
    nowIso: string;
    actor: string;
    reason: string;
    runtime?: string | null;
    model?: string | null;
    sessionId?: string | null;
    runId?: string | null;
  }
): LlmAuthProfileSnapshot {
  const profile = snapshot.profiles.find((candidate) => candidate.id === input.profileId) ?? null;
  if (!profile) {
    return snapshot;
  }
  let nextSelectionCount = 1;
  const states = snapshot.states.map((state) => {
    if (state.profileId !== input.profileId) {
      return state;
    }
    nextSelectionCount = state.selectionCount + 1;
    return {
      ...state,
      lastSelectedAt: input.nowIso,
      selectionCount: nextSelectionCount,
      updatedAt: input.nowIso,
      updatedBy: input.actor
    };
  });
  const auditEntry: LlmAuthProfileAuditEntry = {
    id: auditId({
      nowIso: input.nowIso,
      profileId: input.profileId,
      action: 'selected',
      count: nextSelectionCount
    }),
    at: input.nowIso,
    action: 'selected',
    provider: profile.provider,
    profileId: profile.id,
    actor: input.actor,
    reason: input.reason,
    runtime: input.runtime ?? null,
    model: input.model ?? null,
    sessionId: input.sessionId ?? null,
    runId: input.runId ?? null
  };
  return {
    ...snapshot,
    updatedAt: input.nowIso,
    states,
    audit: [...snapshot.audit, auditEntry].slice(-MAX_AUDIT_ENTRIES)
  };
}

export function parseLlmAuthProfilePatch(input: unknown): { ok: true; patch: LlmAuthProfilePatch } | { ok: false; error: string } {
  if (!isRecord(input)) {
    return { ok: false, error: 'Expected auth profile patch object' };
  }

  const profileProvider = input.provider === undefined ? null : parseProvider(input.provider);
  if (input.provider !== undefined && !profileProvider) {
    return { ok: false, error: 'Invalid provider: expected google or openrouter' };
  }

  const status = input.status === undefined ? null : parseStatus(input.status);
  if (input.status !== undefined && !status) {
    return { ok: false, error: 'Invalid status: expected active, cooldown, billing_disabled, or disabled' };
  }

  const credentialSource = input.credentialSource === undefined ? null : parseCredentialSource(input.credentialSource);
  if (input.credentialSource !== undefined && !credentialSource) {
    return { ok: false, error: 'Invalid credentialSource: expected env, vault, or env_or_vault' };
  }

  const priority = input.priority === undefined ? null : parsePriority(input.priority);
  if (input.priority !== undefined && priority === null) {
    return { ok: false, error: 'Invalid priority: expected a non-negative number' };
  }

  const credentialEnvKey = input.credentialEnvKey === undefined ? null : cleanString(input.credentialEnvKey);
  if (credentialEnvKey && !isSafeEnvKey(credentialEnvKey)) {
    return { ok: false, error: 'Invalid credentialEnvKey: expected an uppercase environment variable name' };
  }

  const cooldownUntil = input.cooldownUntil === undefined ? null : parseIsoTimestamp(input.cooldownUntil);
  if (input.cooldownUntil !== undefined && input.cooldownUntil !== null && cooldownUntil === null) {
    return { ok: false, error: 'Invalid cooldownUntil: expected an ISO timestamp or null' };
  }

  const disabledUntil = input.disabledUntil === undefined ? null : parseIsoTimestamp(input.disabledUntil);
  if (input.disabledUntil !== undefined && input.disabledUntil !== null && disabledUntil === null) {
    return { ok: false, error: 'Invalid disabledUntil: expected an ISO timestamp or null' };
  }

  return {
    ok: true,
    patch: {
      provider: profileProvider,
      label: input.label === undefined ? null : cleanString(input.label),
      priority,
      credentialSource,
      credentialEnvKey,
      credentialVaultKey: input.credentialVaultKey === undefined ? null : cleanString(input.credentialVaultKey),
      status,
      cooldownUntil,
      disabledUntil,
      disabledReason: input.disabledReason === undefined ? null : cleanString(input.disabledReason),
      note: input.note === undefined ? null : cleanString(input.note)
    }
  };
}

export function applyLlmAuthProfilePatch(input: {
  snapshot: LlmAuthProfileSnapshot;
  profileId: string;
  patch: LlmAuthProfilePatch;
  configured: boolean;
  nowIso: string;
  actor: string;
}): { ok: true; snapshot: LlmAuthProfileSnapshot; profile: LlmAuthProfileDefinition } | { ok: false; error: string } {
  if (!isValidLlmAuthProfileId(input.profileId)) {
    return { ok: false, error: 'Invalid auth profile id' };
  }
  const existing = input.snapshot.profiles.find((profile) => profile.id === input.profileId) ?? null;
  if (!existing && !input.patch.provider) {
    return { ok: false, error: 'provider is required when creating an auth profile' };
  }
  const provider = existing?.provider ?? input.patch.provider;
  if (!provider) {
    return { ok: false, error: 'provider is required when creating an auth profile' };
  }
  const profile: LlmAuthProfileDefinition = {
    id: input.profileId,
    provider,
    label: input.patch.label ?? existing?.label ?? input.profileId,
    priority: input.patch.priority ?? existing?.priority ?? 100,
    configured: input.configured,
    credentialSource:
      input.patch.credentialSource ??
      existing?.credentialSource ??
      (input.patch.credentialEnvKey && input.patch.credentialVaultKey ? 'env_or_vault' : input.patch.credentialVaultKey ? 'vault' : 'env'),
    credentialEnvKey: input.patch.credentialEnvKey ?? existing?.credentialEnvKey ?? null,
    credentialVaultKey: input.patch.credentialVaultKey ?? existing?.credentialVaultKey ?? null
  };

  const profileExists = input.snapshot.profiles.some((candidate) => candidate.id === input.profileId);
  const profiles = profileExists
    ? input.snapshot.profiles.map((candidate) => (candidate.id === input.profileId ? profile : candidate))
    : [...input.snapshot.profiles, profile];
  const existingState = input.snapshot.states.find((state) => state.profileId === input.profileId) ?? defaultState(input.profileId);
  const state: LlmAuthProfileState = {
    ...existingState,
    status: input.patch.status ?? existingState.status,
    cooldownUntil: input.patch.cooldownUntil,
    disabledUntil: input.patch.disabledUntil,
    disabledReason: input.patch.disabledReason,
    note: input.patch.note,
    updatedAt: input.nowIso,
    updatedBy: input.actor
  };
  const stateExists = input.snapshot.states.some((candidate) => candidate.profileId === input.profileId);
  const states = stateExists
    ? input.snapshot.states.map((candidate) => (candidate.profileId === input.profileId ? state : candidate))
    : [...input.snapshot.states, state];
  const auditEntry: LlmAuthProfileAuditEntry = {
    id: auditId({
      nowIso: input.nowIso,
      profileId: input.profileId,
      action: 'updated',
      count: state.selectionCount
    }),
    at: input.nowIso,
    action: 'updated',
    provider: profile.provider,
    profileId: profile.id,
    actor: input.actor,
    reason: state.status,
    runtime: null,
    model: null,
    sessionId: null,
    runId: null
  };
  return {
    ok: true,
    profile,
    snapshot: {
      schema: SNAPSHOT_SCHEMA,
      updatedAt: input.nowIso,
      profiles: profiles.sort((left, right) => {
        if (left.provider !== right.provider) {
          return left.provider.localeCompare(right.provider);
        }
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }
        return left.id.localeCompare(right.id);
      }),
      states,
      audit: [...input.snapshot.audit, auditEntry].slice(-MAX_AUDIT_ENTRIES)
    }
  };
}
