#!/usr/bin/env -S node
import fs from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

import { formatValidationResult, validateConfigPath } from '../../packages/gateway/src/config-validator.ts';

type BrowserTransportMode = 'stdio' | 'http';
type BrowserHealthState = 'disabled' | 'ready' | 'degraded' | 'missing_dependency' | 'misconfigured';
type BrowserExtractionMode = 'markdown' | 'html' | 'text';
type BrowserToolName = 'get' | 'bulk_get' | 'fetch' | 'bulk_fetch' | 'stealthy_fetch' | 'bulk_stealthy_fetch';

interface CliArgs {
  command: string[];
  configPath: string;
  host: string;
  token?: string;
}

interface BrowserCapabilityStatus {
  enabled: boolean;
  ready: boolean;
  toolName: string;
  provider: 'scrapling';
  transport: BrowserTransportMode;
  healthState: BrowserHealthState;
  executable: string | null;
  httpBaseUrl: string | null;
  blockedReasons: string[];
  installCommands: string[];
  dockerSupport: string[];
  allowedAgents: string[];
}

interface BrowserCapabilityConfig {
  enabled: boolean;
  provider: 'scrapling';
  transport: BrowserTransportMode;
  defaultExtraction: BrowserExtractionMode;
  executable: string;
  healthcheckCommand: string;
  installCommand: string;
  bootstrapCommand: string;
  httpBaseUrl: string | null;
  allowedAgents: string[];
  policy: {
    allowedDomains: string[];
    deniedDomains: string[];
    allowProxy: boolean;
    allowStealth: boolean;
    allowVisibleBrowser: boolean;
    allowFileDownloads: boolean;
    distrustThirdPartyContent: boolean;
    promptInjectionEscalation: 'annotate' | 'require_confirmation' | 'block';
    requireApprovalForStealth: boolean;
    requireApprovalForDownloads: boolean;
    requireApprovalForVisibleBrowser: boolean;
    requireApprovalForProxy: boolean;
  };
}

interface BrowserValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  path: string;
  message: string;
  hint?: string;
}

interface BrowserCapabilityValidation {
  ok: boolean;
  degraded: boolean;
  checkedAt: string;
  issues: BrowserValidationIssue[];
  errors: BrowserValidationIssue[];
  warnings: BrowserValidationIssue[];
  infos: BrowserValidationIssue[];
  binaryAvailability: Array<{
    name: string;
    command: string;
    installed: boolean;
    required: boolean;
  }>;
}

interface BrowserContract {
  schema: 'ops.browser-capability.v1';
  provider: 'scrapling';
  supportedTransports: BrowserTransportMode[];
  installDoctor: {
    installCommands: string[];
    dockerSupport: string[];
  };
}

interface BrowserHistoryArtifact {
  handle: string;
  url: string;
  tool: BrowserToolName;
  extractionMode: BrowserExtractionMode;
  selector: string | null;
  previewText: string;
  fileName: string;
  inspectUrl: string;
  downloadUrl: string;
}

interface BrowserRunTrace {
  runId: string;
  sessionId: string;
  agentId: string | null;
  runStatus: string;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  provider: 'scrapling';
  transport: BrowserTransportMode;
  healthState: BrowserHealthState;
  route:
    | {
        provider: 'scrapling';
        transport: BrowserTransportMode;
        primaryTool: BrowserToolName;
        fallbackTools: BrowserToolName[];
        extractionMode: BrowserExtractionMode;
        selectorStrategy: string;
        riskClass: string;
        requiresApproval: boolean;
        distrustPageInstructions: boolean;
        fallbackReason: string | null;
        blockedReason: string | null;
        policyReasons: string[];
        urls: string[];
      }
    | null;
  ok: boolean;
  selectedTool: BrowserToolName | null;
  attemptedTools: BrowserToolName[];
  fallbackReason: string | null;
  blockedReason: string | null;
  policyReasons: string[];
  promptInjectionDetected: boolean;
  requiresApproval: boolean;
  error: string | null;
  artifacts: BrowserHistoryArtifact[];
  events: Array<{
    id: string;
    ts: string;
    type: string;
    details: string;
  }>;
}

interface BrowserArtifactContent {
  handle: string;
  runId: string;
  sessionId: string;
  agentId: string | null;
  url: string;
  tool: BrowserToolName;
  extractionMode: BrowserExtractionMode;
  selector: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentPreview: string;
  truncated: boolean;
}

type ScheduleKind = 'builtin' | 'targeted';
type ScheduleSessionTarget = 'origin_session' | 'dedicated_schedule_session' | 'explicit_session';
type ScheduleDeliveryTarget = 'origin_session' | 'dedicated_schedule_session' | 'artifact_only' | 'silent_on_heartbeat';
type ScheduleConcurrencyPolicy = 'skip' | 'queue' | 'replace';

interface ScheduleView {
  id: string;
  label: string;
  category: string;
  kind: ScheduleKind;
  cadenceKind: 'interval' | 'cron';
  cadence: string;
  enabled: boolean;
  pausedAt: string | null;
  pausedBy: string | null;
  paused: boolean;
  isDue: boolean;
  requestedBy: string | null;
  requestingSessionId: string | null;
  originRef: Record<string, unknown>;
  targetAgentId: string | null;
  sessionTarget: ScheduleSessionTarget;
  deliveryTarget: ScheduleDeliveryTarget;
  deliveryTargetSessionId: string | null;
  prompt: string | null;
  runtime: string | null;
  model: string | null;
  jobMode: string | null;
  approvalProfile: string | null;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  domainPolicy: Record<string, unknown>;
  rateLimitPolicy: Record<string, unknown>;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastResult: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  activeRun: {
    runId: string;
    sessionId: string;
    status: string;
  } | null;
}

interface ScheduleHistoryEntry {
  id: string;
  scheduleId: string;
  trigger: string;
  status: string;
  runId: string | null;
  sessionId: string | null;
  requestedBy: string | null;
  deliveryTarget: ScheduleDeliveryTarget;
  summary: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function parseArgs(argv: string[]): CliArgs {
  const command: string[] = [];
  let configPath = 'config/control-plane.yaml';
  let host = process.env.OPS_GATEWAY_URL ?? 'http://127.0.0.1:8788';
  let token = process.env.OPS_API_TOKEN;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if ((current === '--config' || current === '-c') && argv[index + 1]) {
      configPath = argv[index + 1]!;
      index += 1;
      continue;
    }
    if ((current === '--host' || current === '-h') && argv[index + 1]) {
      host = argv[index + 1]!;
      index += 1;
      continue;
    }
    if ((current === '--token' || current === '-t') && argv[index + 1]) {
      token = argv[index + 1]!;
      index += 1;
      continue;
    }
    command.push(current);
  }

  return {
    command,
    configPath,
    host,
    token
  };
}

async function resolveToken(args: CliArgs): Promise<string> {
  if (args.token && args.token.trim().length > 0) {
    return args.token.trim();
  }

  const configPath = path.resolve(args.configPath);
  const raw = await fs.readFile(configPath, 'utf8');
  let parsed: Record<string, unknown>;
  try {
    parsed = YAML.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  }
  const server = parsed.server as Record<string, unknown> | undefined;
  const token = typeof server?.apiToken === 'string' ? server.apiToken.trim() : '';
  if (!token) {
    throw new Error('Unable to resolve API token. Provide --token or set server.apiToken in config.');
  }
  return token;
}

async function apiRequest<T>(args: CliArgs, endpoint: string, init: RequestInit = {}): Promise<T> {
  const token = await resolveToken(args);
  const hasBody = init.body !== undefined;
  const response = await fetch(`${args.host}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-ops-role': 'operator',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : typeof payload.message === 'string'
          ? payload.message
          : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function printHelp(): void {
  console.log('Usage:');
  console.log('  pnpm ops config validate [--config path/to/control-plane.yaml]');
  console.log('  pnpm ops schedule list [--limit N] [--kind builtin|targeted] [--enabled true|false]');
  console.log('  pnpm ops schedule show <scheduleId>');
  console.log('  pnpm ops schedule history <scheduleId>');
  console.log('  pnpm ops schedule create --label LABEL --category CATEGORY --cadence CADENCE --target-agent AGENT --prompt PROMPT');
  console.log('  pnpm ops schedule update <scheduleId> [--label LABEL] [--cadence CADENCE] [...]');
  console.log('  pnpm ops schedule pause <scheduleId>');
  console.log('  pnpm ops schedule resume <scheduleId>');
  console.log('  pnpm ops schedule run <scheduleId>');
  console.log('  pnpm ops schedule route <scheduleId> <deliveryTarget> [deliveryTargetSessionId]');
  console.log('  pnpm ops schedule request --requester-agent AGENT [--requester-session SESSION] --label LABEL --category CATEGORY --cadence CADENCE --prompt PROMPT');
  console.log('  pnpm ops browser status [--host URL] [--token TOKEN]');
  console.log('  pnpm ops browser doctor [--host URL] [--token TOKEN]');
  console.log('  pnpm ops browser test <url> [--agent id] [--selector css] [--mode markdown|html|text]');
  console.log('  pnpm ops browser history [--limit N] [--offset N] [--session sessionId]');
  console.log('  pnpm ops browser show <runId>');
  console.log('  pnpm ops browser artifact <handle>');
  console.log('');
  console.log('Flags: --config --host --token');
}

function parseBrowserTestArgs(tokens: string[]): {
  url: string;
  agentId?: string;
  selector?: string;
  extractionMode?: BrowserExtractionMode;
  previewChars?: number;
  dynamicLikely: boolean;
  requiresStealth: boolean;
  requiresProxy: boolean;
  requiresVisibleBrowser: boolean;
  requiresDownload: boolean;
  suspiciousPromptInjection: boolean;
} {
  const positional: string[] = [];
  let agentId: string | undefined;
  let selector: string | undefined;
  let extractionMode: BrowserExtractionMode | undefined;
  let previewChars: number | undefined;
  let dynamicLikely = false;
  let requiresStealth = false;
  let requiresProxy = false;
  let requiresVisibleBrowser = false;
  let requiresDownload = false;
  let suspiciousPromptInjection = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    if ((current === '--agent' || current === '--agent-id') && tokens[index + 1]) {
      agentId = tokens[index + 1]!;
      index += 1;
      continue;
    }
    if ((current === '--selector' || current === '--css-selector') && tokens[index + 1]) {
      selector = tokens[index + 1]!;
      index += 1;
      continue;
    }
    if ((current === '--mode' || current === '--extraction') && tokens[index + 1]) {
      const nextMode = tokens[index + 1] as BrowserExtractionMode;
      if (!['markdown', 'html', 'text'].includes(nextMode)) {
        throw new Error('Invalid extraction mode. Use markdown|html|text.');
      }
      extractionMode = nextMode;
      index += 1;
      continue;
    }
    if (current === '--preview-chars' && tokens[index + 1]) {
      previewChars = Number(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (current === '--dynamic') {
      dynamicLikely = true;
      continue;
    }
    if (current === '--stealth') {
      requiresStealth = true;
      continue;
    }
    if (current === '--proxy') {
      requiresProxy = true;
      continue;
    }
    if (current === '--visible') {
      requiresVisibleBrowser = true;
      continue;
    }
    if (current === '--download') {
      requiresDownload = true;
      continue;
    }
    if (current === '--prompt-injection') {
      suspiciousPromptInjection = true;
      continue;
    }
    positional.push(current);
  }

  const url = positional[0]?.trim() ?? '';
  if (!url) {
    throw new Error('Usage: pnpm ops browser test <url> [--agent id] [--selector css] [--mode markdown|html|text]');
  }

  return {
    url,
    agentId,
    selector,
    extractionMode,
    previewChars: Number.isFinite(previewChars) ? previewChars : undefined,
    dynamicLikely,
    requiresStealth,
    requiresProxy,
    requiresVisibleBrowser,
    requiresDownload,
    suspiciousPromptInjection
  };
}

function parseHistoryArgs(tokens: string[]): { limit?: number; offset?: number; sessionId?: string } {
  let limit: number | undefined;
  let offset: number | undefined;
  let sessionId: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    if (current === '--limit' && tokens[index + 1]) {
      limit = Number(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (current === '--offset' && tokens[index + 1]) {
      offset = Number(tokens[index + 1]);
      index += 1;
      continue;
    }
    if ((current === '--session' || current === '--session-id') && tokens[index + 1]) {
      sessionId = tokens[index + 1]!;
      index += 1;
    }
  }

  return {
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
    sessionId
  };
}

function parseBooleanFlag(raw: string | undefined): boolean | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return undefined;
}

function parseJsonFlag(raw: string | undefined, label: string): Record<string, unknown> | undefined {
  if (!raw || raw.trim().length === 0) {
    return undefined;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseScheduleListArgs(tokens: string[]): {
  limit?: number;
  kind?: ScheduleKind;
  enabled?: boolean;
  requestedBy?: string;
  targetAgentId?: string;
} {
  let limit: number | undefined;
  let kind: ScheduleKind | undefined;
  let enabled: boolean | undefined;
  let requestedBy: string | undefined;
  let targetAgentId: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    if (current === '--limit' && tokens[index + 1]) {
      limit = Number(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (current === '--kind' && tokens[index + 1]) {
      const nextKind = tokens[index + 1] as ScheduleKind;
      if (nextKind !== 'builtin' && nextKind !== 'targeted') {
        throw new Error('Invalid schedule kind. Use builtin|targeted.');
      }
      kind = nextKind;
      index += 1;
      continue;
    }
    if (current === '--enabled' && tokens[index + 1]) {
      enabled = parseBooleanFlag(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (current === '--requested-by' && tokens[index + 1]) {
      requestedBy = tokens[index + 1]!;
      index += 1;
      continue;
    }
    if (current === '--target-agent' && tokens[index + 1]) {
      targetAgentId = tokens[index + 1]!;
      index += 1;
    }
  }
  return {
    limit: Number.isFinite(limit) ? limit : undefined,
    kind,
    enabled,
    requestedBy,
    targetAgentId
  };
}

function parseScheduleMutationArgs(tokens: string[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if ((current === '--id' || current === '--schedule-id') && next) {
      payload.id = next;
      index += 1;
      continue;
    }
    if (current === '--label' && next) {
      payload.label = next;
      index += 1;
      continue;
    }
    if (current === '--category' && next) {
      payload.category = next;
      index += 1;
      continue;
    }
    if (current === '--cadence' && next) {
      payload.cadence = next;
      index += 1;
      continue;
    }
    if (current === '--target-agent' && next) {
      payload.targetAgentId = next;
      index += 1;
      continue;
    }
    if (current === '--requesting-session' && next) {
      payload.requestingSessionId = next;
      index += 1;
      continue;
    }
    if (current === '--delivery-target-session' && next) {
      payload.deliveryTargetSessionId = next;
      index += 1;
      continue;
    }
    if (current === '--session-target' && next) {
      payload.sessionTarget = next;
      index += 1;
      continue;
    }
    if (current === '--delivery-target' && next) {
      payload.deliveryTarget = next;
      index += 1;
      continue;
    }
    if (current === '--prompt' && next) {
      payload.prompt = next;
      index += 1;
      continue;
    }
    if (current === '--runtime' && next) {
      payload.runtime = next;
      index += 1;
      continue;
    }
    if (current === '--model' && next) {
      payload.model = next;
      index += 1;
      continue;
    }
    if (current === '--job-mode' && next) {
      payload.jobMode = next;
      index += 1;
      continue;
    }
    if (current === '--approval-profile' && next) {
      payload.approvalProfile = next;
      index += 1;
      continue;
    }
    if (current === '--concurrency' && next) {
      payload.concurrencyPolicy = next;
      index += 1;
      continue;
    }
    if (current === '--requested-by' && next) {
      payload.requestedBy = next;
      index += 1;
      continue;
    }
    if (current === '--enabled' && next) {
      payload.enabled = parseBooleanFlag(next);
      index += 1;
      continue;
    }
    if (current === '--metadata-json' && next) {
      payload.metadata = parseJsonFlag(next, 'metadata-json');
      index += 1;
      continue;
    }
    if (current === '--origin-ref-json' && next) {
      payload.originRef = parseJsonFlag(next, 'origin-ref-json');
      index += 1;
      continue;
    }
    if (current === '--domain-policy-json' && next) {
      payload.domainPolicy = parseJsonFlag(next, 'domain-policy-json');
      index += 1;
      continue;
    }
    if (current === '--rate-limit-json' && next) {
      payload.rateLimitPolicy = parseJsonFlag(next, 'rate-limit-json');
      index += 1;
      continue;
    }
  }
  return payload;
}

function printScheduleList(rows: ScheduleView[]): void {
  console.log(`Schedules total=${rows.length}`);
  if (rows.length === 0) {
    console.log('  No schedules found.');
    return;
  }
  rows.forEach((row, index) => {
    console.log(`${index + 1}. ${row.id}`);
    console.log(`   label=${row.label}`);
    console.log(`   cadence=${row.cadence}`);
    console.log(`   target=${row.targetAgentId ?? 'system'}`);
    console.log(`   delivery=${row.deliveryTarget}`);
    console.log(`   status=${row.lastStatus ?? 'n/a'} paused=${row.paused ? 'yes' : 'no'} next=${row.nextRunAt ?? 'n/a'}`);
  });
}

function printSchedule(schedule: ScheduleView): void {
  console.log(`Schedule ${schedule.id}`);
  console.log(`  label=${schedule.label}`);
  console.log(`  category=${schedule.category}`);
  console.log(`  kind=${schedule.kind}`);
  console.log(`  cadence=${schedule.cadence} (${schedule.cadenceKind})`);
  console.log(`  target_agent=${schedule.targetAgentId ?? 'system'}`);
  console.log(`  requester=${schedule.requestedBy ?? 'unknown'}`);
  console.log(`  requesting_session=${schedule.requestingSessionId ?? 'n/a'}`);
  console.log(`  session_target=${schedule.sessionTarget}`);
  console.log(`  delivery_target=${schedule.deliveryTarget}`);
  console.log(`  delivery_session=${schedule.deliveryTargetSessionId ?? 'auto'}`);
  console.log(`  runtime=${schedule.runtime ?? 'default'}`);
  console.log(`  model=${schedule.model ?? 'default'}`);
  console.log(`  concurrency=${schedule.concurrencyPolicy}`);
  console.log(`  approval_profile=${schedule.approvalProfile ?? 'none'}`);
  console.log(`  enabled=${schedule.enabled ? 'yes' : 'no'} paused=${schedule.paused ? 'yes' : 'no'}`);
  console.log(`  due=${schedule.isDue ? 'yes' : 'no'}`);
  console.log(`  last_run=${schedule.lastRunAt ?? 'never'}`);
  console.log(`  next_run=${schedule.nextRunAt ?? 'n/a'}`);
  console.log(`  last_status=${schedule.lastStatus ?? 'n/a'}`);
  console.log(`  last_error=${schedule.lastError ?? 'none'}`);
  if (schedule.prompt) {
    console.log('  prompt');
    console.log(`    ${schedule.prompt}`);
  }
  if (schedule.activeRun) {
    console.log(`  active_run=${schedule.activeRun.runId} (${schedule.activeRun.status})`);
  }
  console.log('  origin_ref');
  console.log(`    ${JSON.stringify(schedule.originRef)}`);
  console.log('  domain_policy');
  console.log(`    ${JSON.stringify(schedule.domainPolicy)}`);
  console.log('  rate_limit_policy');
  console.log(`    ${JSON.stringify(schedule.rateLimitPolicy)}`);
}

function printScheduleHistory(history: ScheduleHistoryEntry[]): void {
  console.log(`Schedule history entries=${history.length}`);
  if (history.length === 0) {
    console.log('  No history yet.');
    return;
  }
  for (const entry of history) {
    console.log(`- ${entry.id}`);
    console.log(`  created_at=${entry.createdAt}`);
    console.log(`  trigger=${entry.trigger}`);
    console.log(`  status=${entry.status}`);
    console.log(`  requested_by=${entry.requestedBy ?? 'unknown'}`);
    console.log(`  run_id=${entry.runId ?? 'n/a'}`);
    console.log(`  summary=${entry.summary ?? 'n/a'}`);
  }
}

function printBrowserStatus(payload: { status: BrowserCapabilityStatus; config: BrowserCapabilityConfig }): void {
  const { status, config } = payload;
  console.log('Browser capability');
  console.log(`  ready=${status.ready ? 'yes' : 'no'}`);
  console.log(`  provider=${status.provider}`);
  console.log(`  transport=${status.transport}`);
  console.log(`  health=${status.healthState}`);
  console.log(`  tool=${status.toolName}`);
  console.log(`  default_extraction=${config.defaultExtraction}`);
  console.log(`  executable=${status.executable ?? 'n/a'}`);
  console.log(`  http_base_url=${status.httpBaseUrl ?? 'n/a'}`);
  console.log(`  allowed_agents=${formatList(status.allowedAgents)}`);
  console.log(`  blocked_reasons=${formatList(status.blockedReasons)}`);
}

function printDoctor(payload: {
  status: BrowserCapabilityStatus;
  config: BrowserCapabilityConfig;
  contract: BrowserContract;
  validation: BrowserCapabilityValidation;
}): void {
  printBrowserStatus(payload);
  console.log('');
  console.log('Doctor');
  console.log(`  schema=${payload.contract.schema}`);
  console.log(`  supported_transports=${payload.contract.supportedTransports.join(', ')}`);
  console.log(`  policy_allowed_domains=${formatList(payload.config.policy.allowedDomains)}`);
  console.log(`  policy_denied_domains=${formatList(payload.config.policy.deniedDomains)}`);
  console.log(`  prompt_injection=${payload.config.policy.promptInjectionEscalation}`);
  console.log(`  issues=${payload.validation.issues.length}`);

  if (payload.validation.issues.length > 0) {
    console.log('');
    console.log('Validation issues');
    for (const issue of payload.validation.issues) {
      console.log(`  - ${issue.severity}: ${issue.message} (${issue.path} / ${issue.code})`);
      if (issue.hint) {
        console.log(`    hint: ${issue.hint}`);
      }
    }
  }

  if (payload.validation.binaryAvailability.length > 0) {
    console.log('');
    console.log('Binary availability');
    for (const entry of payload.validation.binaryAvailability) {
      console.log(`  - ${entry.name}: ${entry.installed ? 'installed' : 'missing'} (${entry.command})`);
    }
  }

  console.log('');
  console.log('Install commands');
  for (const command of payload.contract.installDoctor.installCommands) {
    console.log(`  - ${command}`);
  }
}

function printTraceSummary(trace: BrowserRunTrace, index?: number): void {
  const prefix = index === undefined ? '-' : `${index + 1}.`;
  const url = trace.route?.urls[0] ?? trace.artifacts[0]?.url ?? 'n/a';
  console.log(`${prefix} ${trace.runId}`);
  console.log(`   status=${trace.runStatus}`);
  console.log(`   tool=${trace.selectedTool ?? trace.route?.primaryTool ?? 'n/a'}`);
  console.log(`   health=${trace.healthState}`);
  console.log(`   agent=${trace.agentId ?? 'n/a'}`);
  console.log(`   url=${url}`);
  console.log(`   artifacts=${trace.artifacts.length}`);
  if (trace.fallbackReason) {
    console.log(`   fallback=${trace.fallbackReason}`);
  }
  if (trace.blockedReason) {
    console.log(`   blocked=${trace.blockedReason}`);
  }
  if (trace.error) {
    console.log(`   error=${trace.error}`);
  }
}

function printTrace(trace: BrowserRunTrace): void {
  console.log(`Browser run ${trace.runId}`);
  console.log(`  session=${trace.sessionId}`);
  console.log(`  agent=${trace.agentId ?? 'n/a'}`);
  console.log(`  created_at=${trace.createdAt}`);
  console.log(`  status=${trace.runStatus}`);
  console.log(`  provider=${trace.provider}`);
  console.log(`  transport=${trace.transport}`);
  console.log(`  health=${trace.healthState}`);
  console.log(`  selected_tool=${trace.selectedTool ?? 'n/a'}`);
  console.log(`  attempted_tools=${trace.attemptedTools.join(', ') || 'none'}`);
  console.log(`  blocked_reason=${trace.blockedReason ?? 'none'}`);
  console.log(`  fallback_reason=${trace.fallbackReason ?? 'none'}`);
  console.log(`  prompt_injection=${trace.promptInjectionDetected ? 'yes' : 'no'}`);
  console.log(`  requires_approval=${trace.requiresApproval ? 'yes' : 'no'}`);
  if (trace.route) {
    console.log('  route');
    console.log(`    primary_tool=${trace.route.primaryTool}`);
    console.log(`    extraction_mode=${trace.route.extractionMode}`);
    console.log(`    selector_strategy=${trace.route.selectorStrategy}`);
    console.log(`    risk_class=${trace.route.riskClass}`);
    console.log(`    urls=${trace.route.urls.join(', ')}`);
  }
  if (trace.policyReasons.length > 0) {
    console.log('  policy_reasons');
    for (const reason of trace.policyReasons) {
      console.log(`    - ${reason}`);
    }
  }
  if (trace.artifacts.length > 0) {
    console.log('  artifacts');
    for (const artifact of trace.artifacts) {
      console.log(`    - handle=${artifact.handle}`);
      console.log(`      file=${artifact.fileName}`);
      console.log(`      tool=${artifact.tool}`);
      console.log(`      url=${artifact.url}`);
      console.log(`      selector=${artifact.selector ?? 'document'}`);
    }
  }
  if (trace.events.length > 0) {
    console.log('  events');
    for (const event of trace.events.slice(-6)) {
      console.log(`    - ${event.ts} ${event.type}`);
    }
  }
}

function printArtifact(artifact: BrowserArtifactContent): void {
  console.log(`Browser artifact ${artifact.handle}`);
  console.log(`  run=${artifact.runId}`);
  console.log(`  file=${artifact.fileName}`);
  console.log(`  mime=${artifact.mimeType}`);
  console.log(`  tool=${artifact.tool}`);
  console.log(`  url=${artifact.url}`);
  console.log(`  selector=${artifact.selector ?? 'document'}`);
  console.log(`  size_bytes=${artifact.sizeBytes}`);
  console.log(`  truncated=${artifact.truncated ? 'yes' : 'no'}`);
  console.log('');
  console.log(artifact.contentPreview);
}

async function runConfigValidate(args: CliArgs, extraAction: string | undefined): Promise<void> {
  if (extraAction && extraAction.trim().length > 0) {
    printHelp();
    process.exitCode = 1;
    return;
  }
  const resolvedConfigPath = path.resolve(args.configPath);
  const { result } = validateConfigPath(resolvedConfigPath, {
    cwd: process.cwd(),
    env: process.env
  });
  console.log(formatValidationResult(result));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function runBrowserCommand(args: CliArgs): Promise<void> {
  const action = args.command[1]?.toLowerCase() ?? 'status';

  if (action === 'status') {
    const payload = await apiRequest<{ status: BrowserCapabilityStatus; config: BrowserCapabilityConfig }>(args, '/api/browser/status');
    printBrowserStatus(payload);
    return;
  }

  if (action === 'doctor') {
    const payload = await apiRequest<{
      status: BrowserCapabilityStatus;
      config: BrowserCapabilityConfig;
      contract: BrowserContract;
      validation: BrowserCapabilityValidation;
    }>(args, '/api/browser/doctor');
    printDoctor(payload);
    return;
  }

  if (action === 'test') {
    const options = parseBrowserTestArgs(args.command.slice(2));
    const payload = await apiRequest<{
      run: { id: string; status: string };
      test: BrowserRunTrace;
      status: BrowserCapabilityStatus;
    }>(args, '/api/browser/test', {
      method: 'POST',
      body: JSON.stringify(options)
    });
    printBrowserStatus({ status: payload.status, config: { defaultExtraction: payload.test.route?.extractionMode ?? 'markdown' } as BrowserCapabilityConfig });
    console.log('');
    printTrace(payload.test);
    return;
  }

  if (action === 'history') {
    const options = parseHistoryArgs(args.command.slice(2));
    const params = new URLSearchParams();
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.offset !== undefined) {
      params.set('offset', String(options.offset));
    }
    if (options.sessionId) {
      params.set('sessionId', options.sessionId);
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const payload = await apiRequest<{ history: { total: number; rows: BrowserRunTrace[] } }>(args, `/api/browser/history${suffix}`);
    console.log(`Browser history total=${payload.history.total}`);
    if (payload.history.rows.length === 0) {
      console.log('  No browser traces found.');
      return;
    }
    payload.history.rows.forEach((trace, index) => {
      printTraceSummary(trace, index);
    });
    return;
  }

  if (action === 'show') {
    const runId = args.command[2]?.trim() ?? '';
    if (!runId) {
      throw new Error('Usage: pnpm ops browser show <runId>');
    }
    const payload = await apiRequest<{ trace: BrowserRunTrace }>(args, `/api/browser/history/${encodeURIComponent(runId)}`);
    printTrace(payload.trace);
    return;
  }

  if (action === 'artifact') {
    const handle = args.command[2]?.trim() ?? '';
    if (!handle) {
      throw new Error('Usage: pnpm ops browser artifact <handle>');
    }
    const payload = await apiRequest<{ artifact: BrowserArtifactContent }>(args, `/api/browser/artifacts/${encodeURIComponent(handle)}`);
    printArtifact(payload.artifact);
    return;
  }

  throw new Error(`Unknown browser command: ${action}`);
}

async function runScheduleCommand(args: CliArgs): Promise<void> {
  const action = args.command[1]?.toLowerCase() ?? 'list';

  if (action === 'list') {
    const options = parseScheduleListArgs(args.command.slice(2));
    const params = new URLSearchParams();
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit));
    }
    if (options.kind) {
      params.set('kind', options.kind);
    }
    if (options.enabled !== undefined) {
      params.set('enabled', String(options.enabled));
    }
    if (options.requestedBy) {
      params.set('requestedBy', options.requestedBy);
    }
    if (options.targetAgentId) {
      params.set('targetAgentId', options.targetAgentId);
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const payload = await apiRequest<{ schedules: ScheduleView[] }>(args, `/api/schedules${suffix}`);
    printScheduleList(payload.schedules);
    return;
  }

  if (action === 'show') {
    const scheduleId = args.command[2]?.trim() ?? '';
    if (!scheduleId) {
      throw new Error('Usage: pnpm ops schedule show <scheduleId>');
    }
    const payload = await apiRequest<{ schedule: ScheduleView; history: ScheduleHistoryEntry[] }>(
      args,
      `/api/schedules/${encodeURIComponent(scheduleId)}`
    );
    printSchedule(payload.schedule);
    console.log('');
    printScheduleHistory(payload.history.slice(0, 10));
    return;
  }

  if (action === 'history') {
    const scheduleId = args.command[2]?.trim() ?? '';
    if (!scheduleId) {
      throw new Error('Usage: pnpm ops schedule history <scheduleId>');
    }
    const payload = await apiRequest<{ history: ScheduleHistoryEntry[] }>(
      args,
      `/api/schedules/${encodeURIComponent(scheduleId)}/history`
    );
    printScheduleHistory(payload.history);
    return;
  }

  if (action === 'pause' || action === 'resume' || action === 'run') {
    const scheduleId = args.command[2]?.trim() ?? '';
    if (!scheduleId) {
      throw new Error(`Usage: pnpm ops schedule ${action} <scheduleId>`);
    }
    const payload = await apiRequest<{
      schedule: ScheduleView;
      history?: ScheduleHistoryEntry;
      run?: { id: string };
    }>(args, `/api/schedules/${encodeURIComponent(scheduleId)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({
        actor: 'ops-cli'
      })
    });
    printSchedule(payload.schedule);
    if (payload.history) {
      console.log('');
      printScheduleHistory([payload.history]);
    }
    if (payload.run?.id) {
      console.log(`\nqueued_run=${payload.run.id}`);
    }
    return;
  }

  if (action === 'route') {
    const scheduleId = args.command[2]?.trim() ?? '';
    const deliveryTarget = args.command[3]?.trim() ?? '';
    const deliveryTargetSessionId = args.command[4]?.trim() ?? null;
    if (!scheduleId || !deliveryTarget) {
      throw new Error('Usage: pnpm ops schedule route <scheduleId> <deliveryTarget> [deliveryTargetSessionId]');
    }
    const payload = await apiRequest<{ schedule: ScheduleView }>(args, `/api/schedules/${encodeURIComponent(scheduleId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        actor: 'ops-cli',
        deliveryTarget,
        deliveryTargetSessionId
      })
    });
    printSchedule(payload.schedule);
    return;
  }

  if (action === 'create') {
    const payloadBody = parseScheduleMutationArgs(args.command.slice(2));
    const payload = await apiRequest<{ schedule: ScheduleView }>(args, '/api/schedules', {
      method: 'POST',
      body: JSON.stringify({
        actor: 'ops-cli',
        ...payloadBody
      })
    });
    printSchedule(payload.schedule);
    return;
  }

  if (action === 'update') {
    const scheduleId = args.command[2]?.trim() ?? '';
    if (!scheduleId) {
      throw new Error('Usage: pnpm ops schedule update <scheduleId> [flags]');
    }
    const payloadBody = parseScheduleMutationArgs(args.command.slice(3));
    const payload = await apiRequest<{ schedule: ScheduleView }>(args, `/api/schedules/${encodeURIComponent(scheduleId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        actor: 'ops-cli',
        ...payloadBody
      })
    });
    printSchedule(payload.schedule);
    return;
  }

  if (action === 'request') {
    const payloadBody = parseScheduleMutationArgs(args.command.slice(2));
    const requesterAgentId =
      typeof payloadBody.requestedBy === 'string' && payloadBody.requestedBy.trim().length > 0
        ? payloadBody.requestedBy.trim()
        : typeof payloadBody.targetAgentId === 'string' && payloadBody.targetAgentId.trim().length > 0
          ? payloadBody.targetAgentId.trim()
          : '';
    const requesterAgentFlagIndex = args.command.findIndex((entry) => entry === '--requester-agent');
    const requesterSessionFlagIndex = args.command.findIndex((entry) => entry === '--requester-session');
    const effectiveRequesterAgentId =
      requesterAgentFlagIndex >= 0 && args.command[requesterAgentFlagIndex + 1]
        ? args.command[requesterAgentFlagIndex + 1]!
        : requesterAgentId;
    if (!effectiveRequesterAgentId) {
      throw new Error('Usage: pnpm ops schedule request --requester-agent AGENT [--requester-session SESSION] --label LABEL --category CATEGORY --cadence CADENCE --prompt PROMPT');
    }
    const requesterSessionId =
      requesterSessionFlagIndex >= 0 && args.command[requesterSessionFlagIndex + 1]
        ? args.command[requesterSessionFlagIndex + 1]!
        : null;
    delete payloadBody.requestedBy;
    const payload = await apiRequest<{ schedule: ScheduleView }>(args, '/api/schedules/request', {
      method: 'POST',
      body: JSON.stringify({
        actor: 'ops-cli',
        schema: 'ops.schedule-request.v1',
        version: 1,
        requester: {
          agentId: effectiveRequesterAgentId,
          sessionId: requesterSessionId
        },
        schedule: payloadBody
      })
    });
    printSchedule(payload.schedule);
    return;
  }

  throw new Error(`Unknown schedule command: ${action}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = args.command[0]?.toLowerCase();

  if (!root || root === 'help' || root === '--help') {
    printHelp();
    return;
  }

  if (root === 'config') {
    const sub = args.command[1]?.toLowerCase();
    if (sub !== 'validate') {
      printHelp();
      process.exitCode = 1;
      return;
    }
    await runConfigValidate(args, args.command[2]);
    return;
  }

  if (root === 'browser') {
    await runBrowserCommand(args);
    return;
  }

  if (root === 'schedule') {
    await runScheduleCommand(args);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
