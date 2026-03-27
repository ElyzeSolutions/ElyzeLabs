import path from 'node:path';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

import type { ControlPlaneConfig } from '@ops/config';
import type { ControlPlaneDatabase } from '@ops/db';
import {
  SCRAPLING_BROWSER_CAPABILITY_CONTRACT,
  assessBrowserPolicy,
  parseJsonSafe,
  planBrowserRoute,
  type BrowserExtractionMode,
  type BrowserHealthState,
  type BrowserToolName,
  type RunStatus,
  type TimelineEvent
} from '@ops/shared';

import { BrowserSessionVault } from './browser-session-vault.js';
import type { BrowserFetchRequest, BrowserStructuredSummary, WebFetchService } from './web-fetch-service.js';

export const BROWSER_CAPABILITY_TOOL = 'browser:scrapling';
export const BROWSER_CAPABILITY_SKILL = 'scrapling-browser';

interface CommandRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface HttpRunnerResult {
  status: number;
  body: string;
}

interface BrowserCapabilityStatus {
  enabled: boolean;
  ready: boolean;
  toolName: string;
  provider: 'scrapling';
  transport: 'stdio' | 'http';
  healthState: BrowserHealthState;
  executable: string | null;
  httpBaseUrl: string | null;
  blockedReasons: string[];
  installCommands: string[];
  dockerSupport: string[];
  allowedAgents: string[];
}

export interface BrowserExecutionInput {
  runId: string;
  sessionId: string;
  agentId: string;
  agentTools: string[];
  workspacePath: string;
  request: BrowserFetchRequest & {
    urls?: string[];
    previewChars?: number;
  };
}

interface BrowserExecutionArtifact {
  url: string;
  tool: BrowserToolName;
  extractionMode: BrowserExtractionMode;
  selector: string | null;
  artifactPath: string;
  previewText: string;
}

interface BrowserExecutionResult {
  ok: boolean;
  ready: boolean;
  provider: 'scrapling';
  transport: 'stdio' | 'http';
  healthState: BrowserHealthState;
  selectedTool: BrowserToolName | null;
  attemptedTools: BrowserToolName[];
  fallbackReason: string | null;
  blockedReason: string | null;
  policyReasons: string[];
  promptInjectionDetected: boolean;
  requiresApproval: boolean;
  artifacts: BrowserExecutionArtifact[];
  summary: BrowserStructuredSummary | null;
  cacheHitCount: number;
  error: string | null;
}

export interface BrowserHistoryArtifact {
  handle: string;
  url: string;
  tool: BrowserToolName;
  extractionMode: BrowserExtractionMode;
  selector: string | null;
  previewText: string;
  artifactPath: string;
  fileName: string;
}

export interface BrowserRunTrace {
  runId: string;
  sessionId: string;
  agentId: string | null;
  runStatus: RunStatus;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  provider: 'scrapling';
  transport: 'stdio' | 'http';
  healthState: BrowserHealthState;
  route:
    | {
        provider: 'scrapling';
        transport: 'stdio' | 'http';
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

interface BrowserHistoryResult {
  rows: BrowserRunTrace[];
  total: number;
  limit: number;
  offset: number;
}

export interface BrowserArtifactContent {
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
  content: string;
}

interface BrowserCapabilityServiceOptions {
  commandExists?: (command: string) => boolean;
  commandRunner?: (input: { command: string; args: string[]; cwd: string }) => Promise<CommandRunnerResult>;
  httpRunner?: (input: { url: string; body: Record<string, unknown> }) => Promise<HttpRunnerResult>;
  sessionVault?: BrowserSessionVault;
  webFetchService?: WebFetchService;
}

export class BrowserCapabilityService {
  constructor(
    private readonly config: ControlPlaneConfig,
    private readonly database: ControlPlaneDatabase,
    private readonly options: BrowserCapabilityServiceOptions = {}
  ) {}

  status(): BrowserCapabilityStatus {
    const blockedReasons: string[] = [];
    const executable = this.config.browser.transport === 'stdio' ? this.config.browser.executable : null;
    const httpBaseUrl = this.config.browser.transport === 'http' ? this.config.browser.httpBaseUrl ?? null : null;
    const commandExists = this.options.commandExists ?? defaultCommandExists;
    let healthState: BrowserHealthState = 'disabled';
    let ready = false;

    if (!this.config.browser.enabled) {
      blockedReasons.push('browser capability disabled');
    } else if (this.config.browser.transport === 'http') {
      if (!this.config.browser.httpBaseUrl) {
        healthState = 'misconfigured';
        blockedReasons.push('browser.httpBaseUrl missing');
      } else {
        healthState = 'ready';
        ready = true;
      }
    } else if (!commandExists(this.config.browser.executable)) {
      healthState = 'missing_dependency';
      blockedReasons.push(describeMissingExecutable(this.config.browser.executable));
    } else {
      healthState = 'ready';
      ready = true;
    }

    return {
      enabled: this.config.browser.enabled,
      ready,
      toolName: BROWSER_CAPABILITY_TOOL,
      provider: 'scrapling',
      transport: this.config.browser.transport,
      healthState,
      executable,
      httpBaseUrl,
      blockedReasons,
      installCommands: SCRAPLING_BROWSER_CAPABILITY_CONTRACT.installDoctor.installCommands,
      dockerSupport: SCRAPLING_BROWSER_CAPABILITY_CONTRACT.installDoctor.dockerSupport,
      allowedAgents: this.config.browser.allowedAgents
    };
  }

  canAgentUse(agentId: string, agentTools: string[]): boolean {
    if (!this.config.browser.enabled) {
      return false;
    }
    if (this.config.browser.allowedAgents.length > 0) {
      return this.config.browser.allowedAgents.includes(agentId);
    }
    return agentTools.includes(BROWSER_CAPABILITY_TOOL);
  }

  promptCapabilitySummary(agentId: string, agentTools: string[]): string {
    const status = this.status();
    const entitled = this.canAgentUse(agentId, agentTools);
    return [
      `browser_capability=${status.enabled ? 'enabled' : 'disabled'}`,
      `provider=${status.provider}`,
      `transport=${status.transport}`,
      `status=${status.healthState}`,
      `entitled=${entitled ? 'yes' : 'no'}`,
      `tool=${status.toolName}`,
      `skill=${BROWSER_CAPABILITY_SKILL}`,
      `default_extraction=${this.config.browser.defaultExtraction}`,
      `prompt_injection=${this.config.browser.policy.promptInjectionEscalation}`
    ].join('; ');
  }

  listHistory(input: { limit: number; offset: number; sessionId?: string }): BrowserHistoryResult {
    const limit = Math.max(1, Math.min(200, input.limit));
    const offset = Math.max(0, input.offset);
    const { rows, total } = this.database.listRunsWithTimelinePrefix({
      typePrefix: 'browser.',
      limit,
      offset,
      sessionId: input.sessionId
    });

    return {
      rows: rows
        .map((run) => this.describeRun(run.id))
        .filter((entry): entry is BrowserRunTrace => entry !== null),
      total,
      limit,
      offset
    };
  }

  describeRun(runId: string): BrowserRunTrace | null {
    const run = this.database.getRunById(runId);
    if (!run) {
      return null;
    }
    const timeline = this.database.listRunTimeline(runId);
    const browserEvents = timeline.filter((event) => event.type.startsWith('browser.'));
    if (browserEvents.length === 0) {
      return null;
    }

    const session = this.database.getSessionById(run.sessionId);
    const routeEvent = browserEvents.find((event) => event.type === 'browser.route') ?? null;
    const resultEvent = [...browserEvents].reverse().find((event) => event.type === 'browser.result') ?? null;
    const errorEvent = [...browserEvents].reverse().find((event) => event.type === 'browser.error') ?? null;
    const blockedEvent = [...browserEvents].reverse().find((event) => event.type === 'browser.policy_blocked') ?? null;

    const routePayload = parseTimelinePayload(routeEvent);
    const resultPayload = parseTimelinePayload(resultEvent);
    const errorPayload = parseTimelinePayload(errorEvent);
    const blockedPayload = parseTimelinePayload(blockedEvent);
    const blockedRoute = parseRouteSummary(blockedPayload);
    const route = parseRouteSummary(routePayload);
    const artifacts = parseArtifacts(resultPayload.artifacts, run.id);
    const provider = route?.provider ?? 'scrapling';
    const transport = route?.transport ?? parseTransport(resultPayload.transport) ?? parseTransport(errorPayload.transport) ?? this.status().transport;
    const healthState = parseHealthState(resultPayload.healthState) ?? parseHealthState(errorPayload.healthState) ?? this.status().healthState;
    const blockedReason =
      parseOptionalString(resultPayload.blockedReason) ??
      parseOptionalString(blockedPayload.reason) ??
      blockedRoute?.blockedReason ??
      parseOptionalString(errorPayload.reason);
    const fallbackReason = parseOptionalString(resultPayload.fallbackReason) ?? route?.fallbackReason ?? null;
    const policyReasons =
      parseStringArray(resultPayload.policyReasons).length > 0
        ? parseStringArray(resultPayload.policyReasons)
        : blockedRoute?.policyReasons ?? route?.policyReasons ?? [];
    const error =
      parseOptionalString(resultPayload.error) ??
      parseOptionalString(errorPayload.error) ??
      parseOptionalString(errorPayload.reason) ??
      null;
    const attemptedTools = parseBrowserTools(resultPayload.attemptedTools);
    const selectedTool = parseBrowserTool(resultPayload.selectedTool);
    const ok = resultEvent ? blockedReason === null : false;

    return {
      runId: run.id,
      sessionId: run.sessionId,
      agentId: session?.agentId ?? null,
      runStatus: run.status,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      provider,
      transport,
      healthState,
      route,
      ok,
      selectedTool,
      attemptedTools,
      fallbackReason,
      blockedReason,
      policyReasons,
      promptInjectionDetected: resultPayload.promptInjectionDetected === true,
      requiresApproval:
        resultPayload.requiresApproval === true ||
        blockedPayload.requiresApproval === true ||
        blockedRoute?.requiresApproval === true,
      error,
      artifacts,
      events: browserEvents.map((event) => ({
        id: event.id,
        ts: event.ts,
        type: event.type,
        details: event.details
      }))
    };
  }

  async inspectArtifact(handle: string): Promise<BrowserArtifactContent | null> {
    const decoded = decodeArtifactHandle(handle);
    if (!decoded) {
      return null;
    }
    const trace = this.describeRun(decoded.runId);
    if (!trace) {
      return null;
    }
    const artifact = trace.artifacts.find((entry) => entry.handle === handle);
    if (!artifact) {
      return null;
    }

    const content = await readArtifactFile(artifact.artifactPath);
    if (!content) {
      return null;
    }

    return {
      handle,
      runId: trace.runId,
      sessionId: trace.sessionId,
      agentId: trace.agentId,
      url: artifact.url,
      tool: artifact.tool,
      extractionMode: artifact.extractionMode,
      selector: artifact.selector,
      fileName: artifact.fileName,
      mimeType: mimeTypeForExtraction(artifact.extractionMode),
      content
    };
  }

  async execute(input: BrowserExecutionInput): Promise<BrowserExecutionResult> {
    const status = this.status();
    const previewChars = Math.max(80, Math.min(2_000, input.request.previewChars ?? 360));
    const urls = input.request.urls && input.request.urls.length > 0 ? input.request.urls : [input.request.url];
    const sessionVault = this.options.sessionVault ?? new BrowserSessionVault(this.database);
    const resolvedSession = sessionVault.resolveForRequest({
      url: urls[0] ?? input.request.url,
      sessionProfileId: input.request.sessionProfileId ?? null,
      cookieJarId: input.request.cookieJarId ?? null,
      headersProfileId: input.request.headersProfileId ?? null,
      proxyProfileId: input.request.proxyProfileId ?? null,
      storageStateId: input.request.storageStateId ?? null,
      extraHeaders: input.request.extraHeaders ?? null,
      extraCookies: input.request.extraCookies ?? null,
      useRealChrome: input.request.useRealChrome ?? null,
      locale: input.request.locale ?? null,
      countryCode: input.request.countryCode ?? null,
      timezoneId: input.request.timezoneId ?? null,
      proxyUrl: input.request.proxyUrl ?? null
    });

    if (!this.canAgentUse(input.agentId, input.agentTools)) {
      this.appendRunEvent(input, 'browser.policy_blocked', 'Browser capability blocked for agent', {
        provider: 'scrapling',
        transport: status.transport,
        healthState: status.healthState,
        reason: 'agent_not_entitled',
        agentId: input.agentId
      });
      return blockedResult(status, 'agent_not_entitled');
    }

    if (!status.ready) {
      this.appendRunEvent(input, 'browser.error', 'Browser capability unavailable', {
        provider: 'scrapling',
        transport: status.transport,
        reason: status.blockedReasons[0] ?? 'browser_unavailable',
        healthState: status.healthState
      });
      return blockedResult(status, status.blockedReasons[0] ?? 'browser_unavailable');
    }

    const policy = {
      allowedDomains: this.config.browser.policy.allowedDomains,
      deniedDomains: this.config.browser.policy.deniedDomains,
      allowProxy: this.config.browser.policy.allowProxy,
      allowStealth: this.config.browser.policy.allowStealth,
      allowVisibleBrowser: this.config.browser.policy.allowVisibleBrowser,
      allowFileDownloads: this.config.browser.policy.allowFileDownloads,
      distrustThirdPartyContent: this.config.browser.policy.distrustThirdPartyContent,
      promptInjectionEscalation: this.config.browser.policy.promptInjectionEscalation,
      requireApprovalForStealth: this.config.browser.policy.requireApprovalForStealth,
      requireApprovalForDownloads: this.config.browser.policy.requireApprovalForDownloads,
      requireApprovalForVisibleBrowser: this.config.browser.policy.requireApprovalForVisibleBrowser,
      requireApprovalForProxy: this.config.browser.policy.requireApprovalForProxy
    } as const;

    const route = planBrowserRoute(
      {
        ...input.request,
        url: urls[0] ?? input.request.url,
        batch: urls.length > 1 || input.request.batch === true,
        useRealChrome: input.request.useRealChrome === true || resolvedSession.useRealChrome === true ? true : undefined,
        requiresProxy:
          input.request.requiresProxy === true ||
          Boolean(input.request.proxyUrl) ||
          Boolean(input.request.proxyProfileId) ||
          Boolean(resolvedSession.proxyUrl)
      },
      {
        policy,
        transport: this.config.browser.transport
      }
    );
    this.appendRunEvent(input, 'browser.route', 'Browser route planned', {
      route,
      urls
    });

    if (route.blockedReason) {
      this.appendRunEvent(input, 'browser.policy_blocked', 'Browser route blocked by policy', {
        route
      });
      return {
        ok: false,
        ready: status.ready,
        provider: 'scrapling',
        transport: status.transport,
        healthState: status.healthState,
        selectedTool: null,
        attemptedTools: [],
        fallbackReason: route.fallbackReason,
        blockedReason: route.blockedReason,
        policyReasons: route.policyReasons,
        promptInjectionDetected: false,
        requiresApproval: route.requiresApproval,
        artifacts: [],
        summary: null,
        cacheHitCount: 0,
        error: null
      };
    }

    const attemptedTools = [route.primaryTool, ...route.fallbackTools];
    const artifacts: BrowserExecutionArtifact[] = [];
    let selectedTool: BrowserToolName | null = null;
    let summary: BrowserStructuredSummary | null = null;
    let cacheHitCount = 0;
    let error: string | null = null;
    let promptInjectionDetected = false;

    for (const tool of attemptedTools) {
      const attemptArtifacts: BrowserExecutionArtifact[] = [];
      let attemptPromptInjectionDetected = false;
      let attemptSummary: BrowserStructuredSummary | null = null;
      let attemptCacheHitCount = 0;
      try {
        for (const targetUrl of urls) {
          const artifactPath = await this.nextArtifactPath(input.workspacePath, input.runId, targetUrl, route.extractionMode, tool);
          let content = '';
          let fromCache = false;
          let structuredSummary: BrowserStructuredSummary | null = null;
          if (status.transport === 'http') {
            content = await this.executeHttpTool(tool, targetUrl, artifactPath, input.request);
          } else if (this.options.webFetchService) {
            const fetchResult = await this.options.webFetchService.execute({
              tool,
              url: targetUrl,
              request: {
                ...input.request,
                url: targetUrl
              },
              resolvedSession,
              artifactPath
            });
            content = fetchResult.content;
            fromCache = fetchResult.fromCache;
            structuredSummary = fetchResult.summary;
          } else {
            content = await this.executeCliTool(tool, targetUrl, artifactPath, input.request);
          }
          const detected = detectPromptInjection(content);
          attemptPromptInjectionDetected ||= detected;
          if (structuredSummary?.summary) {
            attemptSummary = pickPreferredStructuredSummary(attemptSummary, structuredSummary);
          }
          if (fromCache) {
            attemptCacheHitCount += 1;
          }
          const previewText = content.slice(0, previewChars);
          attemptArtifacts.push({
            url: targetUrl,
            tool,
            extractionMode: route.extractionMode,
            selector: input.request.selector?.trim() || null,
            artifactPath,
            previewText
          });
        }

        promptInjectionDetected ||= attemptPromptInjectionDetected;
        if (shouldFallbackForDynamicThinResult(tool, input.request, attemptArtifacts)) {
          throw new Error('browser_dynamic_target_requires_richer_capture');
        }

        artifacts.push(...attemptArtifacts);
        selectedTool = tool;
        summary = pickPreferredStructuredSummary(summary, attemptSummary);
        cacheHitCount += attemptCacheHitCount;
        error = null;
        break;
      } catch (invocationError) {
        promptInjectionDetected ||= attemptPromptInjectionDetected;
        error = invocationError instanceof Error ? invocationError.message : String(invocationError);
      }
    }

    if (!selectedTool) {
      this.appendRunEvent(input, 'browser.error', 'Browser execution failed', {
        provider: 'scrapling',
        transport: status.transport,
        healthState: status.healthState,
        attemptedTools,
        error
      });
      return {
        ok: false,
        ready: status.ready,
        provider: 'scrapling',
        transport: status.transport,
        healthState: status.healthState,
        selectedTool: null,
        attemptedTools,
        fallbackReason: route.fallbackReason,
        blockedReason: null,
        policyReasons: route.policyReasons,
        promptInjectionDetected,
        requiresApproval: route.requiresApproval,
        artifacts: [],
        summary: null,
        cacheHitCount: 0,
        error
      };
    }

    let blockedReason: string | null = null;
    let requiresApproval = route.requiresApproval;
    if (promptInjectionDetected) {
      const assessment = assessBrowserPolicy(
        {
          ...input.request,
          url: urls[0] ?? input.request.url,
          useRealChrome: input.request.useRealChrome === true || resolvedSession.useRealChrome === true ? true : undefined,
          suspiciousPromptInjection: true
        },
        policy
      );
      blockedReason = assessment.blockedReason;
      requiresApproval = requiresApproval || assessment.requiresApproval;
      this.appendRunEvent(input, 'browser.prompt_injection_detected', 'Browser content flagged prompt injection', {
        provider: 'scrapling',
        transport: status.transport,
        healthState: status.healthState,
        route,
        blockedReason,
        requiresApproval
      });
    }

    this.appendRunEvent(input, 'browser.result', 'Browser execution completed', {
      provider: 'scrapling',
      transport: status.transport,
      healthState: status.healthState,
      selectedTool,
      attemptedTools,
      fallbackReason: route.fallbackReason,
      artifacts,
      promptInjectionDetected,
      blockedReason,
      requiresApproval,
      summary,
      cacheHitCount
    });

    return {
      ok: blockedReason === null,
      ready: status.ready,
      provider: 'scrapling',
      transport: status.transport,
      healthState: status.healthState,
      selectedTool,
      attemptedTools,
      fallbackReason: route.fallbackReason,
      blockedReason,
      policyReasons: route.policyReasons,
      promptInjectionDetected,
      requiresApproval,
      artifacts,
      summary,
      cacheHitCount,
      error
    };
  }

  private appendRunEvent(
    input: Pick<BrowserExecutionInput, 'runId' | 'sessionId'>,
    type: string,
    details: string,
    payload: Record<string, unknown>
  ): void {
    this.database.appendRunEvent({
      runId: input.runId,
      sessionId: input.sessionId,
      type,
      details,
      payload
    });
  }

  private async nextArtifactPath(
    workspacePath: string,
    runId: string,
    url: string,
    extractionMode: BrowserExtractionMode,
    tool: BrowserToolName
  ): Promise<string> {
    const extension = extractionMode === 'html' ? 'html' : extractionMode === 'text' ? 'txt' : 'md';
    const outputDir = path.join(workspacePath, '.ops-runtime', 'browser', runId);
    await fs.mkdir(outputDir, { recursive: true });
    const target = `${Date.now().toString(36)}-${safeArtifactStem(url)}-${tool}.${extension}`;
    return path.join(outputDir, target);
  }

  private async executeCliTool(
    tool: BrowserToolName,
    targetUrl: string,
    artifactPath: string,
    request: BrowserExecutionInput['request']
  ): Promise<string> {
    const runner = this.options.commandRunner ?? defaultCommandRunner;
    const args = buildScraplingCliArgs(tool, targetUrl, artifactPath, request);
    const result = await runner({
      command: this.config.browser.executable,
      args,
      cwd: process.cwd()
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `scrapling exited with ${String(result.exitCode)}`);
    }

    const fileContent = await readArtifactFile(artifactPath);
    if (fileContent) {
      return fileContent;
    }
    if (result.stdout.trim()) {
      await fs.writeFile(artifactPath, result.stdout, 'utf8');
      return result.stdout;
    }
    throw new Error('scrapling completed without producing an artifact');
  }

  private async executeHttpTool(
    tool: BrowserToolName,
    targetUrl: string,
    artifactPath: string,
    request: BrowserExecutionInput['request']
  ): Promise<string> {
    const baseUrl = this.config.browser.httpBaseUrl;
    if (!baseUrl) {
      throw new Error('browser.httpBaseUrl is required for http transport');
    }
    const runner = this.options.httpRunner ?? defaultHttpRunner;
    const result = await runner({
      url: `${baseUrl.replace(/\/+$/, '')}/extract`,
      body: {
        tool,
        url: targetUrl,
        extractionMode: request.extractionMode ?? this.config.browser.defaultExtraction,
        selector: request.selector ?? null,
        visibleBrowser: request.requiresVisibleBrowser === true,
        stealth: request.requiresStealth === true,
        realChrome: request.useRealChrome === true
      }
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`browser http transport failed with status ${String(result.status)}`);
    }
    await fs.writeFile(artifactPath, result.body, 'utf8');
    return result.body;
  }
}

function shouldFallbackForDynamicThinResult(
  tool: BrowserToolName,
  request: BrowserExecutionInput['request'],
  artifacts: BrowserExecutionArtifact[]
): boolean {
  if (!(request.dynamicLikely === true || request.intent === 'dynamic_app' || request.intent === 'monitor')) {
    return false;
  }
  if (tool !== 'get' && tool !== 'bulk_get' && tool !== 'fetch' && tool !== 'bulk_fetch') {
    return false;
  }
  if (artifacts.length === 0) {
    return false;
  }
  return artifacts.every(
    (artifact) => isThinDynamicCapture(artifact.previewText) || isBlockedDynamicCapture(artifact.previewText)
  );
}

function isThinDynamicCapture(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return true;
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (nonEmptyLines.length <= 1) {
    return true;
  }
  if (trimmed.length < 80 && nonEmptyLines.length <= 2) {
    return true;
  }
  return false;
}

function isBlockedDynamicCapture(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes('javascript is not available') ||
    normalized.includes('please enable javascript') ||
    normalized.includes('login wall') ||
    normalized.includes('sign in to continue') ||
    normalized.includes('log in to continue') ||
    normalized.includes('something went wrong, but don’t fret') ||
    normalized.includes("something went wrong, but don't fret") ||
    normalized.includes('try again')
  );
}

function parseTimelinePayload(event: TimelineEvent | null): Record<string, unknown> {
  return event ? parseJsonSafe<Record<string, unknown>>(event.payloadJson, {}) : {};
}

function parseRouteSummary(payload: Record<string, unknown>): BrowserRunTrace['route'] {
  const route = isRecord(payload.route) ? payload.route : payload;
  const urls = Array.isArray(payload.urls) ? payload.urls.map((entry) => String(entry)) : [];
  const primaryTool = parseBrowserTool(route.primaryTool);
  const extractionMode = parseExtractionMode(route.extractionMode);
  const transport = parseTransport(route.transport);
  if (!primaryTool || !extractionMode || !transport) {
    return null;
  }

  return {
    provider: 'scrapling',
    transport,
    primaryTool,
    fallbackTools: parseBrowserTools(route.fallbackTools),
    extractionMode,
    selectorStrategy: parseOptionalString(route.selectorStrategy) ?? 'document',
    riskClass: parseOptionalString(route.riskClass) ?? 'low',
    requiresApproval: route.requiresApproval === true,
    distrustPageInstructions: route.distrustPageInstructions === true,
    fallbackReason: parseOptionalString(route.fallbackReason),
    blockedReason: parseOptionalString(route.blockedReason),
    policyReasons: parseStringArray(route.policyReasons),
    urls
  };
}

function parseArtifacts(value: unknown, runId: string): BrowserHistoryArtifact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      const tool = parseBrowserTool(entry.tool);
      const extractionMode = parseExtractionMode(entry.extractionMode);
      const artifactPath = parseOptionalString(entry.artifactPath);
      const url = parseOptionalString(entry.url);
      if (!tool || !extractionMode || !artifactPath || !url) {
        return null;
      }
      return {
        handle: encodeArtifactHandle(runId, artifactPath),
        url,
        tool,
        extractionMode,
        selector: parseOptionalString(entry.selector),
        previewText: parseOptionalString(entry.previewText) ?? '',
        artifactPath,
        fileName: path.basename(artifactPath)
      } satisfies BrowserHistoryArtifact;
    })
    .filter((entry): entry is BrowserHistoryArtifact => entry !== null);
}

function encodeArtifactHandle(runId: string, artifactPath: string): string {
  return `${runId}.${artifactHandleDigest(artifactPath)}`;
}

function decodeArtifactHandle(handle: string): { runId: string; artifactKey: string } | null {
  const match = handle.trim().match(/^([a-f0-9-]{36})\.([a-f0-9]{16})$/i);
  if (!match) {
    return null;
  }
  const runId = match[1] ?? '';
  const artifactKey = match[2] ?? '';
  return {
    runId,
    artifactKey: artifactKey.toLowerCase()
  };
}

function artifactHandleDigest(artifactPath: string): string {
  return createHash('sha256').update(artifactPath).digest('hex').slice(0, 16);
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0) : [];
}

function parseBrowserTool(value: unknown): BrowserToolName | null {
  return typeof value === 'string' && SCRAPLING_BROWSER_CAPABILITY_CONTRACT.toolIntents[value as BrowserToolName]
    ? (value as BrowserToolName)
    : null;
}

function parseBrowserTools(value: unknown): BrowserToolName[] {
  return Array.isArray(value)
    ? value
        .map((entry) => parseBrowserTool(entry))
        .filter((entry): entry is BrowserToolName => entry !== null)
    : [];
}

function parseExtractionMode(value: unknown): BrowserExtractionMode | null {
  return value === 'markdown' || value === 'html' || value === 'text' ? value : null;
}

function parseTransport(value: unknown): 'stdio' | 'http' | null {
  return value === 'stdio' || value === 'http' ? value : null;
}

function parseHealthState(value: unknown): BrowserHealthState | null {
  return value === 'disabled' ||
    value === 'ready' ||
    value === 'degraded' ||
    value === 'missing_dependency' ||
    value === 'misconfigured'
    ? value
    : null;
}

function mimeTypeForExtraction(extractionMode: BrowserExtractionMode): string {
  if (extractionMode === 'html') {
    return 'text/html; charset=utf-8';
  }
  if (extractionMode === 'text') {
    return 'text/plain; charset=utf-8';
  }
  return 'text/markdown; charset=utf-8';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function blockedResult(status: BrowserCapabilityStatus, blockedReason: string): BrowserExecutionResult {
  return {
    ok: false,
    ready: status.ready,
    provider: 'scrapling',
    transport: status.transport,
    healthState: status.healthState,
    selectedTool: null,
    attemptedTools: [],
    fallbackReason: null,
    blockedReason,
    policyReasons: [],
    promptInjectionDetected: false,
    requiresApproval: false,
    artifacts: [],
    summary: null,
    cacheHitCount: 0,
    error: null
  };
}

function pickPreferredStructuredSummary(
  current: BrowserStructuredSummary | null,
  candidate: BrowserStructuredSummary | null
): BrowserStructuredSummary | null {
  if (!candidate?.summary) {
    return current;
  }
  if (!current?.summary) {
    return candidate;
  }
  const rank = (value: BrowserStructuredSummary['confidence']): number =>
    value === 'high' ? 3 : value === 'medium' ? 2 : 1;
  if (rank(candidate.confidence) !== rank(current.confidence)) {
    return rank(candidate.confidence) > rank(current.confidence) ? candidate : current;
  }
  if (candidate.fields.length !== current.fields.length) {
    return candidate.fields.length > current.fields.length ? candidate : current;
  }
  return candidate.summary.length >= current.summary.length ? candidate : current;
}

function buildScraplingCliArgs(
  tool: BrowserToolName,
  targetUrl: string,
  artifactPath: string,
  request: BrowserExecutionInput['request']
): string[] {
  const subcommand = tool === 'get' || tool === 'bulk_get' ? 'get' : tool === 'fetch' || tool === 'bulk_fetch' ? 'fetch' : 'stealthy-fetch';
  const args = ['extract', subcommand, targetUrl, artifactPath];
  const dynamicCapture = request.dynamicLikely === true || request.intent === 'dynamic_app' || request.intent === 'monitor';
  if (request.selector && request.selector.trim()) {
    args.push('--css-selector', request.selector.trim());
  }
  if (request.requiresVisibleBrowser) {
    args.push('--no-headless');
  }
  if (request.useRealChrome) {
    args.push('--real-chrome');
  }
  if (request.requiresStealth) {
    args.push('--solve-cloudflare');
  }
  if (subcommand !== 'get' && dynamicCapture) {
    args.push('--network-idle', '--wait', '1500');
  }
  return args;
}

function safeArtifactStem(targetUrl: string): string {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const pathname = parsed.pathname.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const stem = `${host}${pathname}`.replace(/^-+|-+$/g, '');
    return stem.slice(0, 80) || 'artifact';
  } catch {
    return 'artifact';
  }
}

async function readArtifactFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function detectPromptInjection(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes('ignore previous instructions') ||
    normalized.includes('system prompt') ||
    normalized.includes('execute this command') ||
    normalized.includes('tool call')
  );
}

function defaultCommandExists(command: string): boolean {
  const binary = command.trim().split(/\s+/)[0] ?? '';
  if (!binary) {
    return false;
  }
  if (binary.includes(path.sep) || binary.startsWith('.')) {
    try {
      fsSync.accessSync(path.resolve(binary), fsSync.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(lookup, [binary], { stdio: 'ignore' }).status === 0;
}

function describeMissingExecutable(command: string): string {
  const binary = command.trim().split(/\s+/)[0] ?? '';
  if (!binary) {
    return 'browser executable is not configured';
  }
  if (binary.includes(path.sep) || binary.startsWith('.')) {
    return `browser executable "${command}" is not executable or does not exist`;
  }
  return `browser executable "${command}" not found on PATH`;
}

function defaultCommandRunner(input: { command: string; args: string[]; cwd: string }): Promise<CommandRunnerResult> {
  return new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

async function defaultHttpRunner(input: { url: string; body: Record<string, unknown> }): Promise<HttpRunnerResult> {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(input.body)
  });
  return {
    status: response.status,
    body: await response.text()
  };
}
