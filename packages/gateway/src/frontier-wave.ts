import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import type { ControlPlaneConfig } from '@ops/config';
import type { ControlPlaneDatabase } from '@ops/db';
import { parseJsonSafe, utcNow } from '@ops/shared';

export const FRONTIER_GOVERNANCE_SNAPSHOT_ID = 'frontier.governance.v1';
export const FRONTIER_ISSUE_LOCK_SNAPSHOT_ID = 'frontier.issue_locks.v1';
export const FRONTIER_DEPLOYMENT_SNAPSHOT_ID = 'frontier.deployment.v1';

export function localTrustedOrigins(port: number): string[] {
  return [
    `http://127.0.0.1:${port}`,
    `http://0.0.0.0:${port}`,
    `http://localhost:${port}`,
    'http://127.0.0.1:4173',
    'http://0.0.0.0:4173',
    'http://localhost:4173'
  ].filter((entry, index, all) => all.indexOf(entry) === index);
}

function normalizeMembershipRole(input: unknown): FrontierMembershipRole {
  return input === 'owner' || input === 'admin' || input === 'operator' || input === 'viewer' ? input : 'viewer';
}

type FrontierActorType = 'agent' | 'board_user' | 'local_board_implicit';
export type FrontierMembershipRole = 'owner' | 'admin' | 'operator' | 'viewer';
export type FrontierPermissionKey =
  | 'company.read'
  | 'company.write'
  | 'invite.issue'
  | 'invite.accept'
  | 'join.request'
  | 'join.review'
  | 'claim.create'
  | 'claim.complete'
  | 'issue.wakeup'
  | 'issue.lock.release'
  | 'portability.export'
  | 'portability.import'
  | 'deployment.configure'
  | 'adapter.read';

export interface FrontierPrincipal {
  id: string;
  actorType: FrontierActorType;
  name: string;
  instanceAdmin: boolean;
  active: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
}

interface FrontierCompany {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'archived';
  ownerPrincipalId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface FrontierMembership {
  id: string;
  principalId: string;
  companyId: string;
  role: FrontierMembershipRole;
  status: 'active' | 'suspended';
  source: 'bootstrap' | 'invite' | 'join_request' | 'claim';
  createdAt: string;
  updatedAt: string;
}

interface FrontierGrant {
  id: string;
  principalId: string;
  companyId: string;
  key: FrontierPermissionKey;
  scope: Record<string, unknown>;
  createdAt: string;
  revokedAt: string | null;
}

export interface FrontierInvite {
  id: string;
  companyId: string;
  issuedByPrincipalId: string;
  target: string;
  tokenHash: string;
  expiresAt: string;
  status: 'pending' | 'consumed' | 'expired' | 'revoked';
  createdAt: string;
  consumedAt: string | null;
  consumedByPrincipalId: string | null;
  metadata: Record<string, unknown>;
}

export interface FrontierJoinRequest {
  id: string;
  companyId: string;
  principalId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  note: string | null;
  source: string | null;
}

interface FrontierClaimChallenge {
  id: string;
  companyId: string;
  issuedToPrincipalId: string;
  challengeHash: string;
  expiresAt: string;
  status: 'pending' | 'claimed' | 'expired' | 'revoked';
  createdAt: string;
  claimedAt: string | null;
}

interface FrontierGovernanceAudit {
  id: string;
  ts: string;
  actorPrincipalId: string;
  action: string;
  decision: 'allowed' | 'blocked';
  reason: string;
  companyId: string | null;
  details: Record<string, unknown>;
}

interface FrontierGovernanceState {
  schema: 'ops.frontier-governance.v1';
  version: 1;
  principals: FrontierPrincipal[];
  companies: FrontierCompany[];
  memberships: FrontierMembership[];
  grants: FrontierGrant[];
  invites: FrontierInvite[];
  joinRequests: FrontierJoinRequest[];
  claimChallenges: FrontierClaimChallenge[];
  audit: FrontierGovernanceAudit[];
  migration: {
    sourceMode: 'single_company';
    migratedAt: string;
    compatibilityVersion: 1;
  };
  updatedAt: string;
}

export interface FrontierIssueLock {
  issueId: string;
  ownerAgentId: string;
  ownerRunId: string;
  lockedAt: string;
  updatedAt: string;
}

export interface FrontierIssueWakeup {
  id: string;
  issueId: string;
  requestedByAgentId: string;
  requestedRunId: string | null;
  state: 'coalesced_same_owner' | 'deferred_issue_lock' | 'promoted_after_release' | 'acquired';
  reason: string;
  createdAt: string;
  promotedAt: string | null;
}

export interface FrontierIssueLockState {
  schema: 'ops.frontier-issue-locks.v1';
  version: 1;
  locks: FrontierIssueLock[];
  wakeups: FrontierIssueWakeup[];
  updatedAt: string;
}

type FrontierDeploymentMode = 'local_trusted' | 'authenticated_private' | 'authenticated_public';

interface FrontierDeploymentState {
  schema: 'ops.frontier-deployment.v1';
  version: 1;
  mode: FrontierDeploymentMode;
  allowedHostnames: string[];
  trustedOrigins: string[];
  boardMutationBypassLocalImplicit: boolean;
  updatedAt: string;
}

interface FrontierActorContext {
  principalId: string;
  actorType: FrontierActorType;
  companyId: string | null;
}

interface FrontierAuthorizationResult {
  allowed: boolean;
  reason: string;
  source: 'instance_admin' | 'membership' | 'grant' | 'denied';
}

export interface FrontierManifest {
  schema: 'ops.company-portability.v1';
  version: 1;
  source: {
    mode: 'local' | 'url' | 'git';
    reference: string;
    exportedAt: string;
  };
  company: FrontierCompany;
  principals: FrontierPrincipal[];
  memberships: FrontierMembership[];
  grants: FrontierGrant[];
  requiredSecrets: string[];
  redactions: string[];
  metadata: Record<string, unknown>;
}

export interface FrontierImportCollision {
  type: 'company' | 'principal' | 'membership' | 'grant';
  key: string;
  strategy: 'rename' | 'replace' | 'skip';
  action: 'create' | 'update' | 'skip';
}

export interface FrontierImportPreview {
  schema: 'ops.company-portability-preview.v1';
  version: 1;
  companyId: string;
  strategy: 'rename' | 'replace' | 'skip';
  collisions: FrontierImportCollision[];
  plannedCreates: number;
  plannedUpdates: number;
  plannedSkips: number;
}

function normalizeSlug(input: string): string {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return value.length > 0 ? value : `company-${randomUUID().slice(0, 8)}`;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function plusMinutesIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isExpired(isoTime: string): boolean {
  const timestamp = Date.parse(isoTime);
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return timestamp <= Date.now();
}

function rolePermissions(role: FrontierMembershipRole): Set<FrontierPermissionKey> {
  if (role === 'owner') {
    return new Set<FrontierPermissionKey>([
      'company.read',
      'company.write',
      'invite.issue',
      'invite.accept',
      'join.request',
      'join.review',
      'claim.create',
      'claim.complete',
      'issue.wakeup',
      'issue.lock.release',
      'portability.export',
      'portability.import',
      'deployment.configure',
      'adapter.read'
    ]);
  }
  if (role === 'admin') {
    return new Set<FrontierPermissionKey>([
      'company.read',
      'company.write',
      'invite.issue',
      'invite.accept',
      'join.request',
      'join.review',
      'claim.create',
      'claim.complete',
      'issue.wakeup',
      'issue.lock.release',
      'portability.export',
      'portability.import',
      'adapter.read'
    ]);
  }
  if (role === 'operator') {
    return new Set<FrontierPermissionKey>([
      'company.read',
      'join.request',
      'invite.accept',
      'issue.wakeup',
      'adapter.read',
      'portability.export'
    ]);
  }
  return new Set<FrontierPermissionKey>(['company.read', 'adapter.read']);
}

function loadSnapshot<T>(database: ControlPlaneDatabase, snapshotId: string, fallback: T): T {
  const snapshot = database.getRuntimeStateSnapshot(snapshotId);
  if (!snapshot) {
    return fallback;
  }
  const parsed = parseJsonSafe<Record<string, unknown>>(snapshot.configJson, {});
  if (Object.keys(parsed).length === 0) {
    return fallback;
  }
  return parsed as unknown as T;
}

function saveSnapshot(database: ControlPlaneDatabase, snapshotId: string, payload: Record<string, unknown>): void {
  database.upsertRuntimeStateSnapshot(snapshotId, payload);
}

export function defaultFrontierGovernanceState(companyName: string): FrontierGovernanceState {
  const now = utcNow();
  const rootPrincipal: FrontierPrincipal = {
    id: 'local-board-implicit',
    actorType: 'local_board_implicit',
    name: 'Local Board (Implicit)',
    instanceAdmin: true,
    active: true,
    createdAt: now,
    metadata: {
      source: 'bootstrap'
    }
  };
  const companyId = normalizeSlug(companyName);
  const company: FrontierCompany = {
    id: companyId,
    slug: companyId,
    name: companyName,
    status: 'active',
    ownerPrincipalId: rootPrincipal.id,
    createdAt: now,
    metadata: {
      source: 'bootstrap'
    }
  };
  const membership: FrontierMembership = {
    id: randomUUID(),
    principalId: rootPrincipal.id,
    companyId,
    role: 'owner',
    status: 'active',
    source: 'bootstrap',
    createdAt: now,
    updatedAt: now
  };
  return {
    schema: 'ops.frontier-governance.v1',
    version: 1,
    principals: [rootPrincipal],
    companies: [company],
    memberships: [membership],
    grants: [],
    invites: [],
    joinRequests: [],
    claimChallenges: [],
    audit: [],
    migration: {
      sourceMode: 'single_company',
      migratedAt: now,
      compatibilityVersion: 1
    },
    updatedAt: now
  };
}

export function loadFrontierGovernanceState(database: ControlPlaneDatabase, companyName: string): FrontierGovernanceState {
  const fallback = defaultFrontierGovernanceState(companyName);
  const loaded = loadSnapshot<FrontierGovernanceState>(database, FRONTIER_GOVERNANCE_SNAPSHOT_ID, fallback);
  const normalized = {
    ...fallback,
    ...loaded,
    principals: Array.isArray(loaded.principals) ? loaded.principals : fallback.principals,
    companies: Array.isArray(loaded.companies) ? loaded.companies : fallback.companies,
    memberships: Array.isArray(loaded.memberships) ? loaded.memberships : fallback.memberships,
    grants: Array.isArray(loaded.grants) ? loaded.grants : fallback.grants,
    invites: Array.isArray(loaded.invites) ? loaded.invites : fallback.invites,
    joinRequests: Array.isArray(loaded.joinRequests) ? loaded.joinRequests : fallback.joinRequests,
    claimChallenges: Array.isArray(loaded.claimChallenges) ? loaded.claimChallenges : fallback.claimChallenges,
    audit: Array.isArray(loaded.audit) ? loaded.audit : fallback.audit,
    migration: {
      ...fallback.migration,
      ...asRecord(loaded.migration)
    },
    updatedAt: typeof loaded.updatedAt === 'string' ? loaded.updatedAt : fallback.updatedAt
  };
  if (normalized.companies.length === 0) {
    return fallback;
  }
  return normalized;
}

export function saveFrontierGovernanceState(database: ControlPlaneDatabase, state: FrontierGovernanceState): FrontierGovernanceState {
  const next: FrontierGovernanceState = {
    ...state,
    updatedAt: utcNow()
  };
  saveSnapshot(database, FRONTIER_GOVERNANCE_SNAPSHOT_ID, next as unknown as Record<string, unknown>);
  return next;
}

export function resolveFrontierActorContext(
  inputHeaders: Record<string, unknown>,
  fallbackCompanyId: string
): FrontierActorContext {
  const principalIdRaw = inputHeaders['x-ops-principal-id'];
  const actorTypeRaw = inputHeaders['x-ops-actor-type'];
  const companyIdRaw = inputHeaders['x-ops-company-id'];
  const principalId =
    typeof principalIdRaw === 'string' && principalIdRaw.trim().length > 0 ? principalIdRaw.trim() : 'local-board-implicit';
  const actorTypeNormalized =
    typeof actorTypeRaw === 'string' && actorTypeRaw.trim().length > 0 ? actorTypeRaw.trim().toLowerCase() : 'local_board_implicit';
  const actorType: FrontierActorType =
    actorTypeNormalized === 'agent' || actorTypeNormalized === 'board_user' || actorTypeNormalized === 'local_board_implicit'
      ? (actorTypeNormalized as FrontierActorType)
      : 'local_board_implicit';
  const companyId =
    typeof companyIdRaw === 'string' && companyIdRaw.trim().length > 0 ? companyIdRaw.trim() : fallbackCompanyId;
  return {
    principalId,
    actorType,
    companyId
  };
}

function membershipHasPermission(
  state: FrontierGovernanceState,
  principalId: string,
  companyId: string,
  key: FrontierPermissionKey
): boolean {
  const activeMembership = state.memberships.find(
    (entry) =>
      entry.principalId === principalId && entry.companyId === companyId && entry.status === 'active'
  );
  if (!activeMembership) {
    return false;
  }
  if (rolePermissions(activeMembership.role).has(key)) {
    return true;
  }
  return state.grants.some(
    (entry) =>
      entry.principalId === principalId &&
      entry.companyId === companyId &&
      entry.key === key &&
      entry.revokedAt === null
  );
}

export function authorizeFrontierAction(
  state: FrontierGovernanceState,
  input: {
    principalId: string;
    companyId: string;
    key: FrontierPermissionKey;
  }
): FrontierAuthorizationResult {
  const principal = state.principals.find((entry) => entry.id === input.principalId && entry.active);
  if (principal?.instanceAdmin) {
    return {
      allowed: true,
      reason: 'instance_admin',
      source: 'instance_admin'
    };
  }
  if (!principal) {
    return {
      allowed: false,
      reason: 'principal_not_found',
      source: 'denied'
    };
  }
  if (membershipHasPermission(state, input.principalId, input.companyId, input.key)) {
    return {
      allowed: true,
      reason: 'membership_or_grant',
      source: 'membership'
    };
  }
  return {
    allowed: false,
    reason: 'permission_denied',
    source: 'denied'
  };
}

export function appendGovernanceAudit(
  state: FrontierGovernanceState,
  input: {
    actorPrincipalId: string;
    action: string;
    decision: 'allowed' | 'blocked';
    reason: string;
    companyId: string | null;
    details?: Record<string, unknown>;
  }
): FrontierGovernanceState {
  const auditEntry: FrontierGovernanceAudit = {
    id: randomUUID(),
    ts: utcNow(),
    actorPrincipalId: input.actorPrincipalId,
    action: input.action,
    decision: input.decision,
    reason: input.reason,
    companyId: input.companyId,
    details: input.details ?? {}
  };
  return {
    ...state,
    audit: [auditEntry, ...state.audit].slice(0, 500),
    updatedAt: utcNow()
  };
}

export function issueInvite(
  state: FrontierGovernanceState,
  input: {
    companyId: string;
    issuedByPrincipalId: string;
    target: string;
    ttlMinutes: number;
    metadata?: Record<string, unknown>;
  }
): { state: FrontierGovernanceState; invite: FrontierInvite; plainToken: string } {
  const inviteToken = `inv_${randomUUID().replace(/-/g, '')}`;
  const invite: FrontierInvite = {
    id: randomUUID(),
    companyId: input.companyId,
    issuedByPrincipalId: input.issuedByPrincipalId,
    target: input.target.trim(),
    tokenHash: sha256(inviteToken),
    expiresAt: plusMinutesIso(Math.max(1, input.ttlMinutes)),
    status: 'pending',
    createdAt: utcNow(),
    consumedAt: null,
    consumedByPrincipalId: null,
    metadata: input.metadata ?? {}
  };
  return {
    state: {
      ...state,
      invites: [invite, ...state.invites],
      updatedAt: utcNow()
    },
    invite,
    plainToken: inviteToken
  };
}

export function acceptInvite(
  state: FrontierGovernanceState,
  input: {
    token: string;
    principalId: string;
  }
): { state: FrontierGovernanceState; invite: FrontierInvite | null; accepted: boolean; reason: string } {
  const tokenHash = sha256(input.token.trim());
  const invite = state.invites.find((entry) => entry.tokenHash === tokenHash);
  if (!invite) {
    return {
      state,
      invite: null,
      accepted: false,
      reason: 'invite_not_found'
    };
  }
  if (invite.status !== 'pending') {
    return {
      state,
      invite,
      accepted: false,
      reason: 'invite_not_pending'
    };
  }
  if (isExpired(invite.expiresAt)) {
    const expiredInvites: FrontierInvite[] = state.invites.map((entry) =>
      entry.id === invite.id
        ? {
            ...entry,
            status: 'expired' as const
          }
        : entry
    );
    const expiredState: FrontierGovernanceState = {
      ...state,
      invites: expiredInvites,
      updatedAt: utcNow()
    };
    return {
      state: expiredState,
      invite: {
        ...invite,
        status: 'expired'
      },
      accepted: false,
      reason: 'invite_expired'
    };
  }
  const principal = state.principals.find((entry) => entry.id === input.principalId && entry.active);
  if (!principal) {
    return {
      state,
      invite,
      accepted: false,
      reason: 'principal_not_found'
    };
  }
  const alreadyMember = state.memberships.some(
    (entry) =>
      entry.companyId === invite.companyId &&
      entry.principalId === input.principalId &&
      entry.status === 'active'
  );
  const membershipRole = normalizeMembershipRole(invite.metadata.role);
  const nextMemberships: FrontierMembership[] = alreadyMember
    ? state.memberships
    : [
        {
          id: randomUUID(),
          principalId: input.principalId,
          companyId: invite.companyId,
          role: membershipRole,
          status: 'active' as const,
          source: 'invite' as const,
          createdAt: utcNow(),
          updatedAt: utcNow()
        },
        ...state.memberships
      ];
  const nextInvites: FrontierInvite[] = state.invites.map((entry) =>
    entry.id === invite.id
      ? {
          ...entry,
          status: 'consumed' as const,
          consumedByPrincipalId: input.principalId,
          consumedAt: utcNow()
        }
      : entry
  );
  return {
    state: {
      ...state,
      invites: nextInvites,
      memberships: nextMemberships,
      updatedAt: utcNow()
    },
    invite: nextInvites.find((entry) => entry.id === invite.id) ?? null,
    accepted: true,
    reason: alreadyMember ? 'already_member' : 'accepted'
  };
}

export function createJoinRequest(
  state: FrontierGovernanceState,
  input: {
    companyId: string;
    principalId: string;
    note: string | null;
    source: string | null;
  }
): { state: FrontierGovernanceState; request: FrontierJoinRequest } {
  const request: FrontierJoinRequest = {
    id: randomUUID(),
    companyId: input.companyId,
    principalId: input.principalId,
    status: 'pending',
    createdAt: utcNow(),
    updatedAt: utcNow(),
    note: input.note,
    source: input.source
  };
  return {
    state: {
      ...state,
      joinRequests: [request, ...state.joinRequests],
      updatedAt: utcNow()
    },
    request
  };
}

export function resolveJoinRequest(
  state: FrontierGovernanceState,
  input: {
    requestId: string;
    decision: 'approved' | 'rejected';
    role: FrontierMembershipRole;
  }
): { state: FrontierGovernanceState; request: FrontierJoinRequest | null; reason: string } {
  const request = state.joinRequests.find((entry) => entry.id === input.requestId);
  if (!request) {
    return {
      state,
      request: null,
      reason: 'join_request_not_found'
    };
  }
  if (request.status !== 'pending') {
    return {
      state,
      request,
      reason: 'join_request_not_pending'
    };
  }
  const nextRequests: FrontierJoinRequest[] = state.joinRequests.map((entry) =>
    entry.id === request.id
      ? {
          ...entry,
          status: input.decision,
          updatedAt: utcNow()
        }
      : entry
  );
  let nextMemberships: FrontierMembership[] = state.memberships;
  if (input.decision === 'approved') {
    const existing = state.memberships.find(
      (entry) =>
        entry.companyId === request.companyId &&
        entry.principalId === request.principalId &&
        entry.status === 'active'
    );
    if (!existing) {
      nextMemberships = [
        {
          id: randomUUID(),
          principalId: request.principalId,
          companyId: request.companyId,
          role: input.role,
          status: 'active' as const,
          source: 'join_request' as const,
          createdAt: utcNow(),
          updatedAt: utcNow()
        },
        ...state.memberships
      ];
    }
  }
  return {
    state: {
      ...state,
      joinRequests: nextRequests,
      memberships: nextMemberships,
      updatedAt: utcNow()
    },
    request: nextRequests.find((entry) => entry.id === request.id) ?? null,
    reason: input.decision
  };
}

export function issueClaimChallenge(
  state: FrontierGovernanceState,
  input: {
    companyId: string;
    principalId: string;
    ttlMinutes: number;
  }
): { state: FrontierGovernanceState; challenge: FrontierClaimChallenge; plainToken: string } {
  const challengeToken = `claim_${randomUUID().replace(/-/g, '')}`;
  const challenge: FrontierClaimChallenge = {
    id: randomUUID(),
    companyId: input.companyId,
    issuedToPrincipalId: input.principalId,
    challengeHash: sha256(challengeToken),
    expiresAt: plusMinutesIso(Math.max(1, input.ttlMinutes)),
    status: 'pending',
    createdAt: utcNow(),
    claimedAt: null
  };
  return {
    state: {
      ...state,
      claimChallenges: [challenge, ...state.claimChallenges],
      updatedAt: utcNow()
    },
    challenge,
    plainToken: challengeToken
  };
}

export function completeClaimChallenge(
  state: FrontierGovernanceState,
  input: {
    token: string;
    principalId: string;
  }
): { state: FrontierGovernanceState; claimed: boolean; reason: string; companyId: string | null } {
  const tokenHash = sha256(input.token.trim());
  const challenge = state.claimChallenges.find((entry) => entry.challengeHash === tokenHash);
  if (!challenge) {
    return {
      state,
      claimed: false,
      reason: 'claim_not_found',
      companyId: null
    };
  }
  if (challenge.status !== 'pending') {
    return {
      state,
      claimed: false,
      reason: 'claim_not_pending',
      companyId: challenge.companyId
    };
  }
  if (challenge.issuedToPrincipalId !== input.principalId) {
    return {
      state,
      claimed: false,
      reason: 'claim_principal_mismatch',
      companyId: challenge.companyId
    };
  }
  const principal = state.principals.find((entry) => entry.id === input.principalId && entry.active);
  if (!principal) {
    return {
      state,
      claimed: false,
      reason: 'principal_not_found',
      companyId: challenge.companyId
    };
  }
  if (isExpired(challenge.expiresAt)) {
    const expiredChallenges: FrontierClaimChallenge[] = state.claimChallenges.map((entry) =>
      entry.id === challenge.id
        ? {
            ...entry,
            status: 'expired' as const
          }
        : entry
    );
    const expired: FrontierGovernanceState = {
      ...state,
      claimChallenges: expiredChallenges,
      updatedAt: utcNow()
    };
    return {
      state: expired,
      claimed: false,
      reason: 'claim_expired',
      companyId: challenge.companyId
    };
  }
  const company = state.companies.find((entry) => entry.id === challenge.companyId);
  if (!company) {
    return {
      state,
      claimed: false,
      reason: 'company_not_found',
      companyId: challenge.companyId
    };
  }
  const nextCompanies = state.companies.map((entry) =>
    entry.id === company.id
      ? {
          ...entry,
          ownerPrincipalId: input.principalId
        }
      : entry
  );
  const nextChallenges: FrontierClaimChallenge[] = state.claimChallenges.map((entry) =>
    entry.id === challenge.id
      ? {
          ...entry,
          status: 'claimed' as const,
          claimedAt: utcNow()
        }
      : entry
  );
  const hasOwnerMembership = state.memberships.some(
    (entry) =>
      entry.companyId === company.id &&
      entry.principalId === input.principalId &&
      entry.status === 'active' &&
      entry.role === 'owner'
  );
  const nextMemberships: FrontierMembership[] = hasOwnerMembership
    ? state.memberships
    : [
        {
          id: randomUUID(),
          principalId: input.principalId,
          companyId: company.id,
          role: 'owner' as const,
          status: 'active' as const,
          source: 'claim' as const,
          createdAt: utcNow(),
          updatedAt: utcNow()
        },
        ...state.memberships
      ];
  return {
    state: {
      ...state,
      companies: nextCompanies,
      memberships: nextMemberships,
      claimChallenges: nextChallenges,
      updatedAt: utcNow()
    },
    claimed: true,
    reason: 'claimed',
    companyId: company.id
  };
}

export function defaultIssueLockState(): FrontierIssueLockState {
  return {
    schema: 'ops.frontier-issue-locks.v1',
    version: 1,
    locks: [],
    wakeups: [],
    updatedAt: utcNow()
  };
}

export function loadIssueLockState(database: ControlPlaneDatabase): FrontierIssueLockState {
  const fallback = defaultIssueLockState();
  const loaded = loadSnapshot<FrontierIssueLockState>(database, FRONTIER_ISSUE_LOCK_SNAPSHOT_ID, fallback);
  return {
    ...fallback,
    ...loaded,
    locks: Array.isArray(loaded.locks) ? loaded.locks : [],
    wakeups: Array.isArray(loaded.wakeups) ? loaded.wakeups : [],
    updatedAt: typeof loaded.updatedAt === 'string' ? loaded.updatedAt : fallback.updatedAt
  };
}

export function saveIssueLockState(database: ControlPlaneDatabase, state: FrontierIssueLockState): FrontierIssueLockState {
  const next = {
    ...state,
    updatedAt: utcNow()
  };
  saveSnapshot(database, FRONTIER_ISSUE_LOCK_SNAPSHOT_ID, next as unknown as Record<string, unknown>);
  return next;
}

export function repairStaleIssueLocks(
  state: FrontierIssueLockState,
  activeRunIds: Set<string>
): { state: FrontierIssueLockState; repaired: number } {
  let repaired = 0;
  const nextLocks: FrontierIssueLock[] = [];
  for (const lock of state.locks) {
    if (!activeRunIds.has(lock.ownerRunId)) {
      repaired += 1;
      continue;
    }
    nextLocks.push(lock);
  }
  return {
    state: {
      ...state,
      locks: nextLocks,
      updatedAt: utcNow()
    },
    repaired
  };
}

export function requestIssueWakeup(
  state: FrontierIssueLockState,
  input: {
    issueId: string;
    requestedByAgentId: string;
    requestedRunId: string | null;
    activeRunIds: Set<string>;
  }
): { state: FrontierIssueLockState; wakeup: FrontierIssueWakeup; lock: FrontierIssueLock | null } {
  const repaired = repairStaleIssueLocks(state, input.activeRunIds).state;
  const existingLock = repaired.locks.find((entry) => entry.issueId === input.issueId) ?? null;
  if (!existingLock) {
    const newLock: FrontierIssueLock = {
      issueId: input.issueId,
      ownerAgentId: input.requestedByAgentId,
      ownerRunId: input.requestedRunId ?? `synthetic:${randomUUID()}`,
      lockedAt: utcNow(),
      updatedAt: utcNow()
    };
    const wakeup: FrontierIssueWakeup = {
      id: randomUUID(),
      issueId: input.issueId,
      requestedByAgentId: input.requestedByAgentId,
      requestedRunId: input.requestedRunId,
      state: 'acquired',
      reason: 'no_active_lock',
      createdAt: utcNow(),
      promotedAt: null
    };
    return {
      state: {
        ...repaired,
        locks: [newLock, ...repaired.locks],
        wakeups: [wakeup, ...repaired.wakeups].slice(0, 500),
        updatedAt: utcNow()
      },
      wakeup,
      lock: newLock
    };
  }
  if (existingLock.ownerAgentId === input.requestedByAgentId) {
    const wakeup: FrontierIssueWakeup = {
      id: randomUUID(),
      issueId: input.issueId,
      requestedByAgentId: input.requestedByAgentId,
      requestedRunId: input.requestedRunId,
      state: 'coalesced_same_owner',
      reason: 'same_owner_active',
      createdAt: utcNow(),
      promotedAt: null
    };
    return {
      state: {
        ...repaired,
        wakeups: [wakeup, ...repaired.wakeups].slice(0, 500),
        updatedAt: utcNow()
      },
      wakeup,
      lock: existingLock
    };
  }
  const wakeup: FrontierIssueWakeup = {
    id: randomUUID(),
    issueId: input.issueId,
    requestedByAgentId: input.requestedByAgentId,
    requestedRunId: input.requestedRunId,
    state: 'deferred_issue_lock',
    reason: 'lock_owned_by_another_agent',
    createdAt: utcNow(),
    promotedAt: null
  };
  return {
    state: {
      ...repaired,
      wakeups: [wakeup, ...repaired.wakeups].slice(0, 500),
      updatedAt: utcNow()
    },
    wakeup,
    lock: existingLock
  };
}

export function releaseIssueLock(
  state: FrontierIssueLockState,
  input: {
    issueId: string;
    ownerRunId: string;
  }
): {
  state: FrontierIssueLockState;
  released: boolean;
  promoted: FrontierIssueWakeup | null;
  lock: FrontierIssueLock | null;
} {
  const lock = state.locks.find((entry) => entry.issueId === input.issueId && entry.ownerRunId === input.ownerRunId) ?? null;
  if (!lock) {
    return {
      state,
      released: false,
      promoted: null,
      lock: null
    };
  }
  const remainingLocks = state.locks.filter((entry) => !(entry.issueId === input.issueId && entry.ownerRunId === input.ownerRunId));
  const deferred = state.wakeups
    .filter((entry) => entry.issueId === input.issueId && entry.state === 'deferred_issue_lock')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (deferred.length === 0) {
    return {
      state: {
        ...state,
        locks: remainingLocks,
        updatedAt: utcNow()
      },
      released: true,
      promoted: null,
      lock: null
    };
  }
  const promote = deferred[0]!;
  const nextWakeups: FrontierIssueWakeup[] = state.wakeups.map((entry) =>
    entry.id === promote.id
      ? {
          ...entry,
          state: 'promoted_after_release' as const,
          promotedAt: utcNow(),
          reason: 'promoted_after_owner_release'
        }
      : entry
  );
  const nextLock: FrontierIssueLock = {
    issueId: input.issueId,
    ownerAgentId: promote.requestedByAgentId,
    ownerRunId: promote.requestedRunId ?? `synthetic:${randomUUID()}`,
    lockedAt: utcNow(),
    updatedAt: utcNow()
  };
  return {
    state: {
      ...state,
      locks: [nextLock, ...remainingLocks],
      wakeups: nextWakeups,
      updatedAt: utcNow()
    },
    released: true,
    promoted: nextWakeups.find((entry) => entry.id === promote.id) ?? null,
    lock: nextLock
  };
}

export function defaultDeploymentState(config: ControlPlaneConfig): FrontierDeploymentState {
  const mode: FrontierDeploymentMode =
    config.server.host === '127.0.0.1' || config.server.host === 'localhost' || config.server.host === '::1'
      ? 'local_trusted'
      : 'authenticated_private';
  return {
    schema: 'ops.frontier-deployment.v1',
    version: 1,
    mode,
    allowedHostnames: [config.server.host, '127.0.0.1', 'localhost'].filter((entry, index, all) => all.indexOf(entry) === index),
    trustedOrigins: localTrustedOrigins(config.server.port),
    boardMutationBypassLocalImplicit: true,
    updatedAt: utcNow()
  };
}

export function loadDeploymentState(database: ControlPlaneDatabase, config: ControlPlaneConfig): FrontierDeploymentState {
  const fallback = defaultDeploymentState(config);
  const loaded = loadSnapshot<FrontierDeploymentState>(database, FRONTIER_DEPLOYMENT_SNAPSHOT_ID, fallback);
  const mode =
    loaded.mode === 'local_trusted' || loaded.mode === 'authenticated_private' || loaded.mode === 'authenticated_public'
      ? loaded.mode
      : fallback.mode;
  const loadedTrustedOrigins = Array.isArray(loaded.trustedOrigins)
    ? loaded.trustedOrigins.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
    : [];
  const trustedOrigins =
    mode === 'authenticated_public'
      ? (loadedTrustedOrigins.length > 0 ? loadedTrustedOrigins : fallback.trustedOrigins)
      : Array.from(new Set([...(loadedTrustedOrigins.length > 0 ? loadedTrustedOrigins : []), ...fallback.trustedOrigins]));
  return {
    ...fallback,
    ...loaded,
    mode,
    allowedHostnames: Array.isArray(loaded.allowedHostnames)
      ? loaded.allowedHostnames.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
      : fallback.allowedHostnames,
    trustedOrigins,
    boardMutationBypassLocalImplicit:
      typeof loaded.boardMutationBypassLocalImplicit === 'boolean'
        ? loaded.boardMutationBypassLocalImplicit
        : fallback.boardMutationBypassLocalImplicit,
    updatedAt: typeof loaded.updatedAt === 'string' ? loaded.updatedAt : fallback.updatedAt
  };
}

export function saveDeploymentState(database: ControlPlaneDatabase, state: FrontierDeploymentState): FrontierDeploymentState {
  const next = {
    ...state,
    updatedAt: utcNow()
  };
  saveSnapshot(database, FRONTIER_DEPLOYMENT_SNAPSHOT_ID, next as unknown as Record<string, unknown>);
  return next;
}

function hostFromHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return (value[0] ?? '').trim().toLowerCase();
  }
  return (value ?? '').trim().toLowerCase();
}

export function evaluateDeploymentGuardrails(
  deployment: FrontierDeploymentState,
  input: {
    hostHeader: string | string[] | undefined;
    originHeader: string | string[] | undefined;
    isMutation: boolean;
    actorType: FrontierActorType;
  }
): {
  allowed: boolean;
  reason: string;
  host: string;
  origin: string;
} {
  const host = hostFromHeader(input.hostHeader);
  const origin = hostFromHeader(input.originHeader);
  if (deployment.mode === 'local_trusted') {
    if (!input.isMutation) {
      return {
        allowed: true,
        reason: 'local_trusted_read',
        host,
        origin
      };
    }
    if (deployment.boardMutationBypassLocalImplicit && input.actorType === 'local_board_implicit') {
      return {
        allowed: true,
        reason: 'local_implicit_bypass',
        host,
        origin
      };
    }
    return {
      allowed: true,
      reason: 'local_trusted_mutation',
      host,
      origin
    };
  }
  const allowlistedHost =
    host.length > 0 &&
    deployment.allowedHostnames.some((entry) => {
      const normalized = entry.trim().toLowerCase();
      return normalized.length > 0 && (host === normalized || host.startsWith(`${normalized}:`));
    });
  if (!allowlistedHost) {
    return {
      allowed: false,
      reason: 'hostname_not_allowlisted',
      host,
      origin
    };
  }
  if (!input.isMutation) {
    return {
      allowed: true,
      reason: 'allowlisted_read',
      host,
      origin
    };
  }
  if (origin.length === 0) {
    return {
      allowed: false,
      reason: 'origin_missing',
      host,
      origin
    };
  }
  const trustedOrigin = deployment.trustedOrigins.some((entry) => entry.trim().toLowerCase() === origin);
  if (!trustedOrigin) {
    return {
      allowed: false,
      reason: 'origin_not_trusted',
      host,
      origin
    };
  }
  return {
    allowed: true,
    reason: 'guardrails_pass',
    host,
    origin
  };
}

export function adapterDiagnostics(config: ControlPlaneConfig): Array<{
  runtime: string;
  command: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}> {
  const probes: Array<{ runtime: string; command: string }> = [
    { runtime: 'codex', command: config.runtime.adapters.codex.command },
    { runtime: 'claude', command: config.runtime.adapters.claude.command },
    { runtime: 'gemini', command: config.runtime.adapters.gemini.command },
    { runtime: 'process', command: config.runtime.adapters.process.command }
  ];
  return probes.map((entry) => {
    const binary = entry.command.trim().split(/\s+/)[0] ?? '';
    if (!binary) {
      return {
        runtime: entry.runtime,
        command: entry.command,
        status: 'fail',
        detail: 'adapter command is empty'
      };
    }
    const lookup = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(lookup, [binary], { stdio: 'ignore' });
    if (result.status === 0) {
      return {
        runtime: entry.runtime,
        command: entry.command,
        status: 'pass',
        detail: 'binary available on host PATH'
      };
    }
    return {
      runtime: entry.runtime,
      command: entry.command,
      status: entry.runtime === config.runtime.defaultRuntime ? 'fail' : 'warn',
      detail: 'binary not found on host PATH'
    };
  });
}

export function buildFrontierManifest(
  governance: FrontierGovernanceState,
  companyId: string,
  sourceMode: 'local' | 'url' | 'git',
  reference: string
): FrontierManifest {
  const company = governance.companies.find((entry) => entry.id === companyId);
  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }
  const memberships = governance.memberships.filter((entry) => entry.companyId === company.id);
  const principalIds = new Set(memberships.map((entry) => entry.principalId));
  principalIds.add(company.ownerPrincipalId);
  const principals = governance.principals.filter((entry) => principalIds.has(entry.id));
  const grants = governance.grants.filter((entry) => entry.companyId === company.id && entry.revokedAt === null);

  const requiredSecrets = [
    'providers.openrouter_api_key',
    'providers.google_api_key',
    'providers.github_pat',
    'telegram.bot_token',
    'providers.voyage_api_key'
  ];
  return {
    schema: 'ops.company-portability.v1',
    version: 1,
    source: {
      mode: sourceMode,
      reference,
      exportedAt: utcNow()
    },
    company,
    principals,
    memberships,
    grants,
    requiredSecrets,
    redactions: ['token', 'secret', 'password', 'apiKey', 'auth'],
    metadata: {
      compatibilityVersion: 1
    }
  };
}

export function scrubManifestSecrets(manifest: FrontierManifest): FrontierManifest {
  const clone = structuredClone(manifest);
  const scrub = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => scrub(entry));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(record)) {
      const normalized = key.toLowerCase();
      if (
        normalized.includes('token') ||
        normalized.includes('secret') ||
        normalized.includes('password') ||
        normalized.includes('apikey') ||
        normalized.includes('api_key')
      ) {
        next[key] = '[REDACTED]';
      } else {
        next[key] = scrub(raw);
      }
    }
    return next;
  };
  return scrub(clone) as FrontierManifest;
}

export function previewManifestImport(
  governance: FrontierGovernanceState,
  manifest: FrontierManifest,
  strategy: 'rename' | 'replace' | 'skip'
): FrontierImportPreview {
  const collisions: FrontierImportCollision[] = [];
  const existingCompanyBySlug = governance.companies.find((entry) => entry.slug === manifest.company.slug);
  if (existingCompanyBySlug) {
    collisions.push({
      type: 'company',
      key: manifest.company.slug,
      strategy,
      action: strategy === 'skip' ? 'skip' : 'update'
    });
  }
  for (const principal of manifest.principals) {
    const existing = governance.principals.find((entry) => entry.id === principal.id);
    if (existing) {
      collisions.push({
        type: 'principal',
        key: principal.id,
        strategy,
        action: strategy === 'skip' ? 'skip' : 'update'
      });
    }
  }
  const plannedSkips = collisions.filter((entry) => entry.action === 'skip').length;
  const plannedUpdates = collisions.filter((entry) => entry.action === 'update').length;
  const totalCreatesBase = 1 + manifest.principals.length + manifest.memberships.length + manifest.grants.length;
  const plannedCreates = Math.max(0, totalCreatesBase - plannedUpdates - plannedSkips);
  return {
    schema: 'ops.company-portability-preview.v1',
    version: 1,
    companyId: manifest.company.id,
    strategy,
    collisions,
    plannedCreates,
    plannedUpdates,
    plannedSkips
  };
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T, strategy: 'rename' | 'replace' | 'skip'): T[] {
  const index = existing.findIndex((entry) => entry.id === incoming.id);
  if (index === -1) {
    return [incoming, ...existing];
  }
  if (strategy === 'skip') {
    return existing;
  }
  if (strategy === 'replace') {
    const next = existing.slice();
    next[index] = incoming;
    return next;
  }
  const renamed = {
    ...incoming,
    id: `${incoming.id}-imported-${randomUUID().slice(0, 6)}`
  };
  return [renamed as T, ...existing];
}

export function applyManifestImport(
  governance: FrontierGovernanceState,
  manifest: FrontierManifest,
  strategy: 'rename' | 'replace' | 'skip'
): FrontierGovernanceState {
  let companies = governance.companies.slice();
  const existingCompanyBySlug = companies.find((entry) => entry.slug === manifest.company.slug);
  if (existingCompanyBySlug) {
    if (strategy === 'replace') {
      companies = companies.map((entry) => (entry.id === existingCompanyBySlug.id ? manifest.company : entry));
    } else if (strategy === 'rename') {
      const renamedCompany = {
        ...manifest.company,
        id: `${manifest.company.id}-imported-${randomUUID().slice(0, 6)}`,
        slug: `${manifest.company.slug}-imported-${randomUUID().slice(0, 4)}`
      };
      companies = [renamedCompany, ...companies];
    }
  } else {
    companies = [manifest.company, ...companies];
  }

  let principals = governance.principals.slice();
  for (const principal of manifest.principals) {
    principals = mergeById(principals, principal, strategy);
  }
  let memberships = governance.memberships.slice();
  for (const membership of manifest.memberships) {
    memberships = mergeById(memberships, membership, strategy);
  }
  let grants = governance.grants.slice();
  for (const grant of manifest.grants) {
    grants = mergeById(grants, grant, strategy);
  }
  return {
    ...governance,
    companies,
    principals,
    memberships,
    grants,
    updatedAt: utcNow()
  };
}

export function governanceContractDocument(): Record<string, unknown> {
  return {
    schema: 'ops.governance-contract.v1',
    version: 1,
    actorModel: ['agent', 'board_user', 'local_board_implicit'],
    tenancy: {
      entities: ['companies', 'principals', 'memberships', 'grants', 'invites', 'joinRequests', 'claimChallenges'],
      ownershipBoundary: 'company-scoped with optional instance-admin escalation'
    },
    permissionCatalog: [
      'company.read',
      'company.write',
      'invite.issue',
      'invite.accept',
      'join.request',
      'join.review',
      'claim.create',
      'claim.complete',
      'issue.wakeup',
      'issue.lock.release',
      'portability.export',
      'portability.import',
      'deployment.configure',
      'adapter.read'
    ],
    migration: {
      fromSingleCompany: true,
      compatibilityVersion: 1
    }
  };
}

export function issueLockContractDocument(): Record<string, unknown> {
  return {
    schema: 'ops.issue-lock-contract.v1',
    version: 1,
    invariants: {
      maxActiveOwnersPerIssue: 1,
      wakeupStates: ['coalesced_same_owner', 'deferred_issue_lock', 'promoted_after_release', 'acquired'],
      staleLockRepair: 'remove lock when owner run is no longer active'
    }
  };
}

export function portabilityContractDocument(): Record<string, unknown> {
  return {
    schema: 'ops.company-portability-contract.v1',
    version: 1,
    strategies: ['rename', 'replace', 'skip'],
    sourceModes: ['local', 'url', 'git'],
    redactionPolicy: 'secret-like fields are scrubbed and requiredSecrets inventory is emitted'
  };
}

export function adapterContractDocument(): Record<string, unknown> {
  return {
    schema: 'ops.adapter-protocol.v1',
    version: 1,
    capabilities: ['invoke', 'lifecycle_events', 'usage', 'session_metadata', 'error_envelopes'],
    compatibility: {
      fallbackPolicy: 'warn-on-unknown-fields',
      requiredVersion: 1
    },
    eventTaxonomy: ['run.accepted', 'run.running', 'run.waiting_input', 'run.completed', 'run.failed', 'run.aborted']
  };
}
