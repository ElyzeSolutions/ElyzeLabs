import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

import type { ControlPlaneDatabase } from '@ops/db';
import type {
  BrowserExtractionMode,
  BrowserExtractorId,
  BrowserToolName
} from '@ops/shared';
import { parseJsonSafe } from '@ops/shared';

import type { ResolvedBrowserSessionState } from './browser-session-vault.js';

export interface BrowserStructuredField {
  key: string;
  label: string;
  value: string;
}

export interface BrowserStructuredSummary {
  extractorId: BrowserExtractorId | 'generic';
  subject: string | null;
  summary: string | null;
  confidence: 'low' | 'medium' | 'high';
  fields: BrowserStructuredField[];
}

export interface BrowserFetchRequest {
  url: string;
  intent:
    | 'article_read'
    | 'document_lookup'
    | 'structured_extract'
    | 'dynamic_app'
    | 'monitor'
    | 'download_probe';
  extractionMode?: BrowserExtractionMode | null;
  batch?: boolean;
  selector?: string | null;
  waitSelector?: string | null;
  urls?: string[];
  dynamicLikely?: boolean;
  requiresStealth?: boolean;
  requiresProxy?: boolean;
  requiresVisibleBrowser?: boolean;
  requiresDownload?: boolean;
  mainContentOnly?: boolean;
  cacheTtlMs?: number | null;
  extractorId?: BrowserExtractorId | null;
  locale?: string | null;
  timezoneId?: string | null;
  countryCode?: string | null;
  verifyTls?: boolean | null;
  proxyUrl?: string | null;
  extraHeaders?: Record<string, string> | null;
  extraCookies?: Record<string, string> | null;
  useRealChrome?: boolean | null;
  sessionProfileId?: string | null;
  cookieJarId?: string | null;
  headersProfileId?: string | null;
  proxyProfileId?: string | null;
  storageStateId?: string | null;
  suspiciousPromptInjection?: boolean;
}

interface McpToolResult {
  ok: boolean;
  status: number | null;
  content: string;
  error: string | null;
}

export class WebFetchService {
  constructor(
    private readonly database: ControlPlaneDatabase,
    private readonly options: {
      executable: string | (() => string);
      commandRunner?: (input: { command: string; args: string[]; cwd: string }) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
    }
  ) {}

  resolveCacheTtlMs(request: BrowserFetchRequest): number {
    if (typeof request.cacheTtlMs === 'number' && Number.isFinite(request.cacheTtlMs)) {
      return Math.max(0, Math.min(24 * 60 * 60 * 1000, Math.floor(request.cacheTtlMs)));
    }
    if (request.intent === 'article_read' || request.intent === 'document_lookup') {
      return 10 * 60 * 1000;
    }
    if (request.intent === 'monitor') {
      return 60 * 1000;
    }
    return 0;
  }

  cacheKey(input: {
      tool: BrowserToolName;
      url: string;
      request: BrowserFetchRequest;
      session: ResolvedBrowserSessionState;
  }): string {
    const payload = {
      tool: input.tool,
      url: input.url,
      extractionMode: input.request.extractionMode ?? 'markdown',
      selector: input.request.selector ?? null,
      mainContentOnly: this.resolveMainContentOnly(input.request),
      extractorId: input.request.extractorId ?? null,
      locale: input.session.locale ?? null,
      timezoneId: input.session.timezoneId ?? null,
      countryCode: input.session.countryCode ?? null,
      useRealChrome: input.request.useRealChrome === true || input.session.useRealChrome === true,
      sessionProfileId: input.request.sessionProfileId ?? null,
      cookieJarId: input.request.cookieJarId ?? input.session.cookieJar?.id ?? null,
      headersProfileId: input.request.headersProfileId ?? input.session.headerProfile?.id ?? null,
      proxyProfileId: input.request.proxyProfileId ?? input.session.proxyProfile?.id ?? null
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  async execute(input: {
    tool: BrowserToolName;
    url: string;
    request: BrowserFetchRequest;
    resolvedSession: ResolvedBrowserSessionState;
    artifactPath: string;
  }): Promise<{
    content: string;
    status: number | null;
    fromCache: boolean;
    summary: BrowserStructuredSummary | null;
  }> {
    const ttlMs = this.resolveCacheTtlMs(input.request);
    const cacheKey = this.cacheKey({
      tool: input.tool,
      url: input.url,
      request: input.request,
      session: input.resolvedSession
    });
    if (ttlMs > 0) {
      const cached = this.database.getBrowserFetchCacheByKey(cacheKey);
      if (cached && Date.parse(cached.expiresAt) > Date.now()) {
        const cachedContent = await fs.readFile(cached.artifactPath, 'utf8').catch(() => '');
        if (cachedContent) {
          await fs.writeFile(input.artifactPath, cachedContent, 'utf8');
          return {
            content: cachedContent,
            status: 200,
            fromCache: true,
            summary: parseJsonSafe<BrowserStructuredSummary | null>(cached.summaryJson, null)
          };
        }
      }
    }

    const result = await this.executeViaMcp({
      tool: input.tool,
      url: input.url,
      request: input.request,
      resolvedSession: input.resolvedSession
    });
    if (!result.ok) {
      throw new Error(result.error ?? 'web_fetch_failed');
    }
    await fs.writeFile(input.artifactPath, result.content, 'utf8');
    const summary = buildStructuredBrowserSummary(result.content, {
      url: input.url,
      extractorId: input.request.extractorId ?? null
    });
    if (ttlMs > 0) {
      this.database.upsertBrowserFetchCache({
        id: `browser_fetch_cache:${cacheKey.slice(0, 16)}`,
        cacheKey,
        url: input.url,
        tool: input.tool,
        extractionMode: input.request.extractionMode ?? 'markdown',
        mainContentOnly: this.resolveMainContentOnly(input.request),
        artifactPath: input.artifactPath,
        previewText: result.content.slice(0, 1200),
        summary: summary ?? {},
        expiresAt: new Date(Date.now() + ttlMs).toISOString()
      });
    }
    return {
      content: result.content,
      status: result.status,
      fromCache: false,
      summary
    };
  }

  resolveMainContentOnly(request: BrowserFetchRequest): boolean {
    if (typeof request.mainContentOnly === 'boolean') {
      return request.mainContentOnly;
    }
    return request.intent === 'article_read' || request.intent === 'document_lookup';
  }

  private async executeViaMcp(input: {
    tool: BrowserToolName;
    url: string;
    request: BrowserFetchRequest;
    resolvedSession: ResolvedBrowserSessionState;
  }): Promise<McpToolResult> {
    const child = spawn(this.resolveExecutable(), ['mcp'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const payload = buildMcpToolArguments(input.tool, input.url, input.request, input.resolvedSession, this.resolveMainContentOnly(input.request));

    return new Promise<McpToolResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (value: McpToolResult): void => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGTERM');
        resolve(value);
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        const messages = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        for (const line of messages) {
          const parsed = parseJsonSafe<Record<string, unknown>>(line, {});
          if (parsed.id === 2 && isRecord(parsed.result)) {
            const result = parsed.result;
            const structured = isRecord(result.structuredContent) ? result.structuredContent : null;
            const contentLines = Array.isArray(structured?.content)
              ? structured?.content.map((entry) => String(entry)).filter((entry) => entry.length > 0)
              : Array.isArray(result.content)
                ? result.content
                    .map((entry) => (isRecord(entry) && typeof entry.text === 'string' ? entry.text : null))
                    .filter((entry): entry is string => Boolean(entry))
                : [];
            const errorText = Array.isArray(result.content)
              ? result.content
                  .map((entry) => (isRecord(entry) && typeof entry.text === 'string' ? entry.text : null))
                  .filter((entry): entry is string => Boolean(entry))
                  .join('\n')
              : null;
            finish({
              ok: result.isError !== true,
              status: structured && typeof structured.status === 'number' ? structured.status : null,
              content: contentLines.join('\n\n'),
              error: result.isError === true ? errorText || 'mcp_tool_failed' : null
            });
            return;
          }
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        finish({
          ok: false,
          status: null,
          content: '',
          error: error.message
        });
      });
      child.on('close', () => {
        finish({
          ok: false,
          status: null,
          content: '',
          error: stderr.trim() || 'mcp_closed_before_result'
        });
      });

      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'elyze-browser',
              version: '1.0.0'
            }
          }
        })}\n`
      );
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: input.tool,
            arguments: payload
          }
        })}\n`
      );
    });
  }

  private resolveExecutable(): string {
    return typeof this.options.executable === 'function' ? this.options.executable() : this.options.executable;
  }
}

export function buildStructuredBrowserSummary(
  value: string,
  options?: {
    url?: string | null;
    extractorId?: BrowserExtractorId | null;
  }
): BrowserStructuredSummary | null {
  const extractor = options?.extractorId ?? inferExtractorId(value, options?.url ?? null);
  if (extractor === 'tiktok_profile' || extractor === 'tiktok_video') {
    const metrics = extractMetricFields(value, [
      ['following', 'Following'],
      ['followers', 'Followers'],
      ['likes', 'Likes'],
      ['comments', 'Comments'],
      ['shares', 'Shares']
    ]);
    if (metrics.length > 0) {
      return {
        extractorId: extractor,
        subject: inferSubject(value, options?.url ?? null),
        summary: formatMetricSummary(inferSubject(value, options?.url ?? null), metrics),
        confidence: metrics.length >= 3 ? 'high' : 'medium',
        fields: metrics
      };
    }
  }

  if (extractor === 'x_profile') {
    const metrics = extractMetricFields(value, [
      ['posts', 'Posts'],
      ['following', 'Following'],
      ['followers', 'Followers']
    ]);
    if (metrics.length > 0) {
      return {
        extractorId: extractor,
        subject: inferSubject(value, options?.url ?? null),
        summary: formatMetricSummary(inferSubject(value, options?.url ?? null), metrics),
        confidence: metrics.length >= 2 ? 'high' : 'medium',
        fields: metrics
      };
    }
  }

  if (extractor === 'reddit_listing') {
    const pageTitle = extractPrimaryTitle(value);
    const titles = extractListItems(value, [/^r\//i, /^u\//i, /^\d+\s*(comments?|votes?)$/i]).filter(
      (entry) => entry !== pageTitle && !/^#+\s*/.test(entry)
    );
    if (titles.length > 0) {
      const subject = inferSubject(value, options?.url ?? null);
      return {
        extractorId: extractor,
        subject,
        summary: subject
          ? `Verified browser capture for ${subject}: top visible posts include ${titles.slice(0, 3).join(', ')}.`
          : `Verified browser capture: top visible posts include ${titles.slice(0, 3).join(', ')}.`,
        confidence: 'medium',
        fields: titles.slice(0, 5).map((title, index) => ({
          key: `post_${index + 1}`,
          label: `Post ${index + 1}`,
          value: title
        }))
      };
    }
  }

  if (extractor === 'blog') {
    const titles = extractBlogNarrativeTitles(value);
    if (titles.length > 0) {
      const subject = inferSubject(value, options?.url ?? null);
      const visibleTitles = formatSummaryList(titles.slice(0, 3));
      return {
        extractorId: extractor,
        subject,
        summary: subject
          ? `Verified browser capture for ${subject}: latest visible posts include ${visibleTitles}.`
          : `Verified browser capture: latest visible posts include ${visibleTitles}.`,
        confidence: titles.length >= 2 ? 'high' : 'medium',
        fields: titles.slice(0, 5).map((title, index) => ({
          key: `post_${index + 1}`,
          label: `Post ${index + 1}`,
          value: title
        }))
      };
    }
  }

  if (extractor === 'pinterest_pin') {
    const title =
      extractUnderlinedHeadings(value).find(
        (heading) =>
          !/^(?:\d+\s+Comments|More about this Pin|Board containing this Pin|Related interests)$/i.test(heading)
      ) ?? null;
    const lines = normalizeLines(value);
    const description =
      value.match(/\n·\n\n([^\n]{20,220})/)?.[1]?.replace(/\s+/g, ' ').trim() ??
      value.match(/Today[^\n]{12,220}/)?.[0]?.replace(/\s+/g, ' ').trim() ??
      lines.find((line) => line.length >= 30 && line.length <= 220 && line !== title) ??
      null;
    if (title || description) {
      const fields: BrowserStructuredField[] = [];
      if (title) {
        fields.push({ key: 'title', label: 'Title', value: title });
      }
      if (description) {
        fields.push({ key: 'description', label: 'Description', value: description });
      }
      return {
        extractorId: extractor,
        subject: title ?? inferSubject(value, options?.url ?? null),
        summary: title && description ? `Verified browser capture for ${title}: ${description}.` : title ? `Verified browser capture for ${title}.` : `Verified browser capture: ${description}.`,
        confidence: 'medium',
        fields
      };
    }
  }

  const genericMetrics = extractMetricFields(value, [
    ['followers', 'Followers'],
    ['following', 'Following'],
    ['likes', 'Likes']
  ]);
  if (genericMetrics.length > 0) {
    return {
      extractorId: extractor,
      subject: inferSubject(value, options?.url ?? null),
      summary: formatMetricSummary(inferSubject(value, options?.url ?? null), genericMetrics),
      confidence: 'medium',
      fields: genericMetrics
    };
  }

  const genericTitle = extractPrimaryTitle(value);
  const genericSnippet = extractPrimarySnippet(value, genericTitle);
  if (!genericTitle && !genericSnippet) {
    return null;
  }
  return {
    extractorId: extractor,
    subject: genericTitle ?? inferSubject(value, options?.url ?? null),
    summary:
      genericTitle && genericSnippet
        ? `Verified browser capture for ${genericTitle}: ${genericSnippet}`
        : genericTitle
          ? `Verified browser capture for ${genericTitle}.`
          : `Verified browser capture: ${genericSnippet}.`,
    confidence: genericTitle && genericSnippet ? 'medium' : 'low',
    fields: [
      ...(genericTitle ? [{ key: 'title', label: 'Title', value: genericTitle }] : []),
      ...(genericSnippet ? [{ key: 'snippet', label: 'Snippet', value: genericSnippet }] : [])
    ]
  };
}

function buildMcpToolArguments(
  tool: BrowserToolName,
  url: string,
  request: BrowserFetchRequest,
  resolvedSession: ResolvedBrowserSessionState,
  mainContentOnly: boolean
): Record<string, unknown> {
  const extractionType = request.extractionMode ?? 'markdown';
  const cookies = resolvedSession.cookies;
  const headers = resolvedSession.headers;
  const shared = {
    extraction_type: extractionType,
    css_selector: request.selector ?? null,
    main_content_only: mainContentOnly,
    locale: resolvedSession.locale ?? undefined,
    timezone_id: resolvedSession.timezoneId ?? undefined
  };
  if (tool === 'get' || tool === 'bulk_get') {
    return {
      ...(tool === 'bulk_get' ? { urls: request.urls && request.urls.length > 0 ? request.urls : [url] } : { url }),
      ...shared,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      cookies: cookies.length > 0 ? Object.fromEntries(cookies.map((entry) => [entry.name, entry.value])) : undefined,
      proxy: resolvedSession.proxyUrl ?? request.proxyUrl ?? undefined,
      verify: request.verifyTls ?? true,
      follow_redirects: true,
      timeout: 30,
      stealthy_headers: true
    };
  }
  const browserShared = {
    ...(tool === 'bulk_fetch' || tool === 'bulk_stealthy_fetch'
      ? { urls: request.urls && request.urls.length > 0 ? request.urls : [url] }
      : { url }),
    ...shared,
    headless: request.requiresVisibleBrowser !== true,
    real_chrome: resolvedSession.useRealChrome === true || request.useRealChrome === true,
    disable_resources: mainContentOnly,
    google_search: false,
    network_idle: request.dynamicLikely === true || request.intent === 'dynamic_app' || request.intent === 'monitor',
    wait_selector: request.waitSelector ?? undefined,
    timeout: 30000,
    cookies: sanitizeBrowserCookies(cookies),
    extra_headers: Object.keys(headers).length > 0 ? headers : undefined,
    proxy: resolvedSession.proxyUrl ?? request.proxyUrl ?? undefined
  };
  if (tool === 'fetch' || tool === 'bulk_fetch') {
    return browserShared;
  }
  return {
    ...browserShared,
    solve_cloudflare: request.requiresStealth === true,
    hide_canvas: request.requiresStealth === true,
    block_webrtc: request.requiresStealth === true
  };
}

function inferExtractorId(value: string, url: string | null): BrowserExtractorId | 'generic' {
  const host = safeHost(url ?? '');
  if (host.includes('tiktok.com')) {
    return /comments?/i.test(value) || /shares?/i.test(value) ? 'tiktok_video' : 'tiktok_profile';
  }
  if (host.includes('x.com') || host.includes('twitter.com')) {
    return 'x_profile';
  }
  if (host.includes('reddit.com')) {
    return 'reddit_listing';
  }
  if (host.includes('pinterest.')) {
    return 'pinterest_pin';
  }
  if (host.includes('blog') || host.includes('carvalh0.xyz')) {
    return 'blog';
  }
  return 'generic';
}

function sanitizeBrowserCookies(cookies: ResolvedBrowserSessionState['cookies']): Array<Record<string, unknown>> | undefined {
  const sanitized = cookies
    .map((entry) => ({
      name: entry.name,
      value: entry.value,
      ...(typeof entry.domain === 'string' && entry.domain.trim().length > 0 ? { domain: entry.domain.trim() } : {}),
      ...(typeof entry.path === 'string' && entry.path.trim().length > 0 ? { path: entry.path.trim() } : {}),
      ...(typeof entry.expires === 'number' && Number.isFinite(entry.expires) ? { expires: entry.expires } : {}),
      ...(typeof entry.httpOnly === 'boolean' ? { httpOnly: entry.httpOnly } : {}),
      ...(typeof entry.secure === 'boolean' ? { secure: entry.secure } : {}),
      ...(entry.sameSite ? { sameSite: entry.sameSite } : {}),
      ...(typeof entry.url === 'string' && entry.url.trim().length > 0 ? { url: entry.url.trim() } : {})
    }))
    .filter((entry) => entry.name.trim().length > 0 && entry.value.length > 0);
  return sanitized.length > 0 ? sanitized : undefined;
}

function inferSubject(value: string, url: string | null): string | null {
  const host = safeHost(url ?? '');
  const contentHandle = inferHandleFromContent(value);
  const urlHandle = inferHandleFromUrl(url);
  if (contentHandle && isSocialHost(host)) {
    return contentHandle;
  }
  if (urlHandle && isSocialHost(host)) {
    return urlHandle;
  }
  if (contentHandle) {
    return contentHandle;
  }
  const title = extractPrimaryTitle(value);
  if (title && !isGenericBrowserChromeTitle(title)) {
    return title;
  }
  if (urlHandle) {
    return urlHandle;
  }
  if (title) {
    return title;
  }
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }
  return null;
}

function inferHandleFromContent(value: string): string | null {
  const lines = normalizeLines(value);
  for (const line of lines) {
    const parenthesized = line.match(/\(@([a-z0-9._-]{2,})\)/i);
    if (parenthesized?.[1]) {
      return `@${parenthesized[1].toLowerCase()}`;
    }
    const direct = line.match(/(^|[\s(])@([a-z0-9._-]{2,})\b/i);
    if (direct?.[2]) {
      return `@${direct[2].toLowerCase()}`;
    }
  }
  return null;
}

function inferHandleFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const first = segments[0];
    if (!first) {
      return null;
    }
    const normalized = first.startsWith('@') ? first.toLowerCase() : `@${first.toLowerCase()}`;
    return /^@[a-z0-9._-]{2,}$/.test(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function isSocialHost(host: string): boolean {
  return host.includes('tiktok.com') || host.includes('x.com') || host.includes('twitter.com');
}

function isGenericBrowserChromeTitle(value: string): boolean {
  return (
    /^tiktok(?:\s*-\s*make your day)?$/i.test(value) ||
    /^profile\s*\/\s*x$/i.test(value) ||
    /^x(?:\s*\/\s*twitter)?$/i.test(value)
  );
}

function extractMetricFields(
  value: string,
  pairs: Array<[key: string, label: string]>
): BrowserStructuredField[] {
  const lines = normalizeLines(value);
  const compact = value.replace(/\*\*/g, '').replace(/\s+/g, ' ');
  const metricValuePattern = /^[0-9][0-9.,KMBAkmbat]*$/i;
  const fields: BrowserStructuredField[] = [];
  for (const [key, label] of pairs) {
    const exactLabelPattern = new RegExp(`^${label}$`, 'i');
    const labelFirstPattern = new RegExp(`^${label}\\s*:?\\s*([0-9][0-9.,KMBAkmbat]*)\\b`, 'i');
    const valueFirstPattern = new RegExp(`([0-9][0-9.,KMBAkmbat]*)(?:\\s+)?${label}\\b`, 'i');
    let metricValue: string | null = null;

    for (let index = 0; index < lines.length - 1 && metricValue === null; index += 1) {
      const current = lines[index] ?? '';
      const next = lines[index + 1] ?? '';
      if (exactLabelPattern.test(current) && metricValuePattern.test(next)) {
        metricValue = next;
        break;
      }
      if (metricValuePattern.test(current) && exactLabelPattern.test(next)) {
        metricValue = current;
        break;
      }
    }

    if (metricValue === null) {
      const lineMatch = lines
        .map((line) => line.match(labelFirstPattern))
        .find((match) => match?.[1]);
      if (lineMatch?.[1]) {
        metricValue = lineMatch[1].trim();
      }
    }

    if (metricValue === null) {
      const compactMatch = compact.match(valueFirstPattern);
      if (compactMatch?.[1]) {
        metricValue = compactMatch[1].trim();
      }
    }

    if (metricValue) {
      fields.push({
        key,
        label,
        value: metricValue
      });
    }
  }
  return fields;
}

function formatMetricSummary(subject: string | null, metrics: BrowserStructuredField[]): string {
  const metricSummary = metrics.map((entry) => `${entry.label} ${entry.value}`).join(', ');
  return subject ? `Verified browser capture for ${subject}: ${metricSummary}.` : `Verified browser capture: ${metricSummary}.`;
}

function normalizeLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function extractUnderlinedHeadings(value: string): string[] {
  const rawLines = value.split(/\r?\n/);
  const headings: string[] = [];
  for (let index = 0; index < rawLines.length - 1; index += 1) {
    const current = rawLines[index]?.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim() ?? '';
    const underline = rawLines[index + 1]?.trim() ?? '';
    if (current.length > 0 && /^[=-]{3,}$/.test(underline)) {
      headings.push(current);
    }
  }
  return headings;
}

function extractListItems(value: string, excludedPatterns: RegExp[]): string[] {
  const results: string[] = [];
  for (const line of normalizeLines(value)) {
    if (line.length < 16 || line.length > 160) {
      continue;
    }
    if (excludedPatterns.some((pattern) => pattern.test(line))) {
      continue;
    }
    if (/^(sign up|log in|create account|share|save|reddit|pinterest)$/i.test(line)) {
      continue;
    }
    if (results.includes(line)) {
      continue;
    }
    results.push(line);
    if (results.length >= 5) {
      break;
    }
  }
  return results;
}

function extractBlogNarrativeTitles(value: string, limit = 3): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const match of value.matchAll(/\[[A-Za-z]+\s+\d{1,2},\s+\d{4}[^\]]*?\n\n([^\n\]]{8,180})\n[-=]{3,}/g)) {
    const title = (match[1] ?? '').replace(/\s+/g, ' ').trim();
    const lowered = title.toLowerCase();
    if (!title || seen.has(lowered)) {
      continue;
    }
    seen.add(lowered);
    titles.push(title);
    if (titles.length >= limit) {
      break;
    }
  }
  return titles;
}

function extractPrimaryTitle(value: string): string | null {
  const lines = normalizeLines(value);
  return lines.find((line) => line.length >= 8 && line.length <= 120 && !/^(log in|sign up|create account)$/i.test(line)) ?? null;
}

function extractPrimarySnippet(value: string, title: string | null): string | null {
  return (
    normalizeLines(value).find(
      (line) =>
        line !== title &&
        line.length >= 32 &&
        line.length <= 220 &&
        !/^(following|followers|likes|posts)$/i.test(line)
    ) ?? null
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function formatSummaryList(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
