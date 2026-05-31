import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type BrowserInteractiveActionType = 'open' | 'read' | 'click' | 'type' | 'wait' | 'screenshot' | 'pdf';

export interface BrowserInteractiveActionInput {
  type: BrowserInteractiveActionType;
  url?: string;
  selector?: string;
  text?: string;
  timeoutMs?: number;
}

export interface BrowserInteractiveRunInput {
  url: string;
  actions: BrowserInteractiveActionInput[];
  previewChars: number;
  cookies?: BrowserInteractiveCookie[];
  storageState?: Record<string, unknown> | null;
  cdpEndpoint?: string | null;
  browserProfile?: BrowserInteractiveBrowserProfile | null;
}

export interface BrowserInteractiveCookie {
  name: string;
  value: string;
  domain?: string | null;
  path?: string | null;
  expires?: number | null;
  httpOnly?: boolean | null;
  secure?: boolean | null;
  sameSite?: 'Lax' | 'None' | 'Strict' | null;
  url?: string | null;
}

export interface BrowserInteractiveBrowserProfile {
  browserKind: 'chrome' | 'edge' | 'firefox' | null;
  browserProfileName?: string | null;
  browserProfilePath?: string | null;
  cdpEndpoint?: string | null;
  useRealChrome?: boolean | null;
}

export interface BrowserInteractiveActionResult {
  index: number;
  type: BrowserInteractiveActionType;
  ok: boolean;
  summary: string;
  selector: string | null;
  url: string | null;
  textPreview: string | null;
  error: string | null;
}

export interface BrowserInteractiveArtifact {
  id: string;
  actionIndex: number;
  kind: 'read' | 'screenshot' | 'pdf';
  mimeType: string;
  sizeBytes: number;
  contentPreview: string;
  contentBase64: string | null;
}

export interface BrowserInteractiveRunResult {
  schema: 'ops.browser-interactive-run.v1';
  provider: 'cdp_chrome' | 'test';
  ok: boolean;
  startedUrl: string;
  finalUrl: string | null;
  actions: BrowserInteractiveActionResult[];
  artifacts: BrowserInteractiveArtifact[];
  error: string | null;
}

export interface BrowserInteractiveSessionRecord {
  schema: 'ops.browser-interactive-session.v1';
  provider: 'cdp_chrome' | 'test';
  sessionId: string;
  startedUrl: string;
  currentUrl: string | null;
  startedAt: string;
  lastActivityAt: string;
  expiresAt: string | null;
}

export interface BrowserInteractiveSessionStartResult {
  schema: 'ops.browser-interactive-session-start.v1';
  session: BrowserInteractiveSessionRecord;
  control: BrowserInteractiveRunResult;
}

export interface BrowserInteractiveSessionActionInput {
  sessionId: string;
  actions: BrowserInteractiveActionInput[];
  previewChars: number;
}

export interface BrowserInteractiveSessionActionResult {
  schema: 'ops.browser-interactive-session-action.v1';
  session: BrowserInteractiveSessionRecord;
  control: BrowserInteractiveRunResult;
}

export interface BrowserInteractiveSessionCloseResult {
  schema: 'ops.browser-interactive-session-close.v1';
  provider: 'cdp_chrome' | 'test';
  sessionId: string;
  closed: boolean;
  finalUrl: string | null;
  error: string | null;
}

export interface BrowserInteractiveProvider {
  run(input: BrowserInteractiveRunInput): Promise<BrowserInteractiveRunResult>;
  startSession?(input: BrowserInteractiveRunInput): Promise<BrowserInteractiveSessionStartResult>;
  runSessionActions?(input: BrowserInteractiveSessionActionInput): Promise<BrowserInteractiveSessionActionResult>;
  closeSession?(sessionId: string): Promise<BrowserInteractiveSessionCloseResult>;
}

export class BrowserInteractiveService {
  constructor(private readonly provider: BrowserInteractiveProvider = new CdpChromeInteractiveProvider()) {}

  async run(input: BrowserInteractiveRunInput): Promise<BrowserInteractiveRunResult> {
    return this.provider.run(input);
  }

  async startSession(input: BrowserInteractiveRunInput): Promise<BrowserInteractiveSessionStartResult> {
    if (!this.provider.startSession) {
      throw new Error('Interactive browser provider does not support persistent live sessions.');
    }
    return this.provider.startSession(input);
  }

  async runSessionActions(input: BrowserInteractiveSessionActionInput): Promise<BrowserInteractiveSessionActionResult> {
    if (!this.provider.runSessionActions) {
      throw new Error('Interactive browser provider does not support persistent live sessions.');
    }
    return this.provider.runSessionActions(input);
  }

  async closeSession(sessionId: string): Promise<BrowserInteractiveSessionCloseResult> {
    if (!this.provider.closeSession) {
      throw new Error('Interactive browser provider does not support persistent live sessions.');
    }
    return this.provider.closeSession(sessionId);
  }
}

class CdpChromeInteractiveProvider implements BrowserInteractiveProvider {
  private readonly liveSessions = new Map<string, CdpLiveSession>();

  async run(input: BrowserInteractiveRunInput): Promise<BrowserInteractiveRunResult> {
    const opened = await openCdpConnection(input);
    if (opened.error || !opened.connection) {
      return failedInteractiveRun(input.url, opened.error ?? 'Failed to open Chrome DevTools session.');
    }
    const connection = opened.connection;
    try {
      const actionRun = await executeCdpActionPlan({
        client: connection.client,
        actions: normalizeActionPlan(input),
        previewChars: input.previewChars,
        storageState: input.storageState ?? null
      });
      const finalUrl = await readCurrentUrl(connection.client);
      return {
        schema: 'ops.browser-interactive-run.v1',
        provider: 'cdp_chrome',
        ok: actionRun.actions.every((action) => action.ok),
        startedUrl: input.url,
        finalUrl,
        actions: actionRun.actions,
        artifacts: actionRun.artifacts,
        error: actionRun.actions.find((action) => !action.ok)?.error ?? null
      };
    } finally {
      await closeCdpConnection(connection);
    }
  }

  async startSession(input: BrowserInteractiveRunInput): Promise<BrowserInteractiveSessionStartResult> {
    const opened = await openCdpConnection(input);
    if (opened.error || !opened.connection) {
      throw new Error(opened.error ?? 'Failed to open Chrome DevTools session.');
    }
    const connection = opened.connection;
    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const actionRun = await executeCdpActionPlan({
      client: connection.client,
      actions: [{ type: 'open', url: input.url }],
      previewChars: input.previewChars,
      storageState: input.storageState ?? null
    });
    const finalUrl = await readCurrentUrl(connection.client);
    const control: BrowserInteractiveRunResult = {
      schema: 'ops.browser-interactive-run.v1',
      provider: 'cdp_chrome',
      ok: actionRun.actions.every((action) => action.ok),
      startedUrl: input.url,
      finalUrl,
      actions: actionRun.actions,
      artifacts: actionRun.artifacts,
      error: actionRun.actions.find((action) => !action.ok)?.error ?? null
    };
    if (!control.ok) {
      await closeCdpConnection(connection);
      throw new Error(control.error ?? 'Failed to start live browser session.');
    }
    const session: BrowserInteractiveSessionRecord = {
      schema: 'ops.browser-interactive-session.v1',
      provider: 'cdp_chrome',
      sessionId,
      startedUrl: input.url,
      currentUrl: finalUrl,
      startedAt,
      lastActivityAt: startedAt,
      expiresAt: null
    };
    this.liveSessions.set(sessionId, {
      connection,
      session,
      storageState: input.storageState ?? null
    });
    return {
      schema: 'ops.browser-interactive-session-start.v1',
      session,
      control
    };
  }

  async runSessionActions(input: BrowserInteractiveSessionActionInput): Promise<BrowserInteractiveSessionActionResult> {
    const liveSession = this.liveSessions.get(input.sessionId);
    if (!liveSession) {
      throw new Error(`Interactive browser live session not found: ${input.sessionId}`);
    }
    const actionRun = await executeCdpActionPlan({
      client: liveSession.connection.client,
      actions: input.actions,
      previewChars: input.previewChars,
      storageState: liveSession.storageState
    });
    const finalUrl = await readCurrentUrl(liveSession.connection.client);
    const lastActivityAt = new Date().toISOString();
    const session: BrowserInteractiveSessionRecord = {
      ...liveSession.session,
      currentUrl: finalUrl,
      lastActivityAt
    };
    liveSession.session = session;
    const control: BrowserInteractiveRunResult = {
      schema: 'ops.browser-interactive-run.v1',
      provider: 'cdp_chrome',
      ok: actionRun.actions.every((action) => action.ok),
      startedUrl: session.startedUrl,
      finalUrl,
      actions: actionRun.actions,
      artifacts: actionRun.artifacts,
      error: actionRun.actions.find((action) => !action.ok)?.error ?? null
    };
    return {
      schema: 'ops.browser-interactive-session-action.v1',
      session,
      control
    };
  }

  async closeSession(sessionId: string): Promise<BrowserInteractiveSessionCloseResult> {
    const liveSession = this.liveSessions.get(sessionId);
    if (!liveSession) {
      return {
        schema: 'ops.browser-interactive-session-close.v1',
        provider: 'cdp_chrome',
        sessionId,
        closed: false,
        finalUrl: null,
        error: `Interactive browser live session not found: ${sessionId}`
      };
    }
    this.liveSessions.delete(sessionId);
    let finalUrl: string | null = null;
    let error: string | null = null;
    try {
      finalUrl = await readCurrentUrl(liveSession.connection.client);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      await closeCdpConnection(liveSession.connection);
    }
    return {
      schema: 'ops.browser-interactive-session-close.v1',
      provider: 'cdp_chrome',
      sessionId,
      closed: true,
      finalUrl,
      error
    };
  }
}

interface CdpLaunchPlan {
  executable: string;
  userDataDir: string | null;
  profileDirectory: string | null;
  cdpEndpoint: string | null;
  error: string | null;
}

interface CdpTab {
  webSocketDebuggerUrl: string;
  closeOnRelease: boolean;
}

interface CdpCommandClient {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

interface CdpSelectorPoint {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CdpConnection {
  client: CdpClient;
  chrome: ChildProcessWithoutNullStreams | null;
  tempUserDataDir: string | null;
  closeTabOnRelease: boolean;
}

interface CdpConnectionOpenResult {
  connection: CdpConnection | null;
  error: string | null;
}

interface CdpActionPlanRun {
  actions: BrowserInteractiveActionResult[];
  artifacts: BrowserInteractiveArtifact[];
}

interface CdpLiveSession {
  connection: CdpConnection;
  session: BrowserInteractiveSessionRecord;
  storageState: Record<string, unknown> | null;
}

class CdpClient {
  private sequence = 0;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const parsed = parseJsonObject(typeof event.data === 'string' ? event.data : '');
      if (!parsed) {
        return;
      }
      const id = typeof parsed?.id === 'number' ? parsed.id : null;
      if (id === null) {
        return;
      }
      const pending = this.pending.get(id);
      if (!pending) {
        return;
      }
      this.pending.delete(id);
      const error = isRecord(parsed.error) ? parsed.error : null;
      if (error) {
        pending.reject(new Error(typeof error.message === 'string' ? error.message : 'CDP command failed'));
        return;
      }
      pending.resolve(parsed.result ?? {});
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out connecting to Chrome DevTools.')), 5_000);
      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Failed to connect to Chrome DevTools.'));
      });
    });
    return new CdpClient(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = (this.sequence += 1);
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(payload);
    });
  }

  close(): void {
    this.socket.close();
  }
}

async function openCdpConnection(input: BrowserInteractiveRunInput): Promise<CdpConnectionOpenResult> {
  const launchPlan = resolveCdpLaunchPlan(input.browserProfile ?? null, input.cdpEndpoint ?? null);
  if (launchPlan.error) {
    return {
      connection: null,
      error: launchPlan.error
    };
  }

  const port = launchPlan.cdpEndpoint ? null : await reservePort();
  const tempUserDataDir = launchPlan.cdpEndpoint || launchPlan.userDataDir ? null : await fs.mkdtemp(path.join(os.tmpdir(), 'ops-interactive-browser-'));
  const userDataDir = launchPlan.userDataDir ?? tempUserDataDir ?? '';
  const browserArgs =
    port === null
      ? []
      : [
          `--remote-debugging-port=${String(port)}`,
          `--user-data-dir=${userDataDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--new-window',
          'about:blank'
        ];
  if (port !== null && launchPlan.profileDirectory) {
    browserArgs.splice(2, 0, `--profile-directory=${launchPlan.profileDirectory}`);
  }
  if (port !== null && !launchPlan.userDataDir) {
    browserArgs.splice(4, 0, '--disable-background-networking', '--disable-sync');
  }
  const chrome = port === null ? null : spawn(launchPlan.executable, browserArgs);

  try {
    const tab = launchPlan.cdpEndpoint ? await waitForCdpEndpointTab(launchPlan.cdpEndpoint, input.url) : await waitForCdpTab(port ?? 0, input.url);
    const client = await CdpClient.connect(tab.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    const cookies = mergeInteractiveCookies(readStorageStateCookies(input.storageState ?? null), input.cookies ?? []);
    if (cookies.length > 0) {
      await client.send('Network.setCookies', {
        cookies: cookies.map((cookie) => {
          const expires = normalizeCdpCookieExpires(cookie.expires);
          return {
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain ?? undefined,
            path: cookie.path ?? '/',
            expires: expires ?? undefined,
            httpOnly: cookie.httpOnly === true,
            secure: cookie.secure === true,
            sameSite: cookie.sameSite ?? undefined,
            url: cookie.domain ? undefined : cookie.url ?? input.url
          };
        })
      });
    }
    return {
      connection: {
        client,
        chrome,
        tempUserDataDir,
        closeTabOnRelease: tab.closeOnRelease
      },
      error: null
    };
  } catch (cause) {
    terminateChrome(chrome);
    if (tempUserDataDir) {
      await fs.rm(tempUserDataDir, { recursive: true, force: true });
    }
    return {
      connection: null,
      error: cause instanceof Error ? cause.message : String(cause)
    };
  }
}

async function closeCdpConnection(connection: CdpConnection): Promise<void> {
  if (connection.closeTabOnRelease) {
    try {
      await connection.client.send('Page.close');
    } catch {
      // Closing the socket/browser below is enough if the page is already gone.
    }
  }
  connection.client.close();
  terminateChrome(connection.chrome);
  if (connection.tempUserDataDir) {
    await fs.rm(connection.tempUserDataDir, { recursive: true, force: true });
  }
}

async function executeCdpActionPlan(input: {
  client: CdpCommandClient;
  actions: BrowserInteractiveActionInput[];
  previewChars: number;
  storageState: Record<string, unknown> | null;
}): Promise<CdpActionPlanRun> {
  const actions: BrowserInteractiveActionResult[] = [];
  const artifacts: BrowserInteractiveArtifact[] = [];
  for (let index = 0; index < input.actions.length; index += 1) {
    const action = input.actions[index];
    if (!action) {
      continue;
    }
    const result = await executeCdpAction({
      client: input.client,
      action,
      index,
      previewChars: input.previewChars,
      artifacts,
      storageState: input.storageState
    });
    actions.push(result);
    if (!result.ok) {
      break;
    }
  }
  return {
    actions,
    artifacts
  };
}

function failedInteractiveRun(startedUrl: string, error: string): BrowserInteractiveRunResult {
  return {
    schema: 'ops.browser-interactive-run.v1',
    provider: 'cdp_chrome',
    ok: false,
    startedUrl,
    finalUrl: null,
    actions: [],
    artifacts: [],
    error
  };
}

async function executeCdpAction(input: {
  client: CdpCommandClient;
  action: BrowserInteractiveActionInput;
  index: number;
  previewChars: number;
  artifacts: BrowserInteractiveArtifact[];
  storageState: Record<string, unknown> | null;
}): Promise<BrowserInteractiveActionResult> {
  const { client, action, index, previewChars, artifacts, storageState } = input;
  try {
    if (action.type === 'open') {
      const targetUrl = action.url?.trim() || null;
      if (!targetUrl) {
        throw new Error('open action requires url.');
      }
      await client.send('Page.navigate', { url: targetUrl });
      await delay(Math.min(Math.max(action.timeoutMs ?? 1_000, 250), 5_000));
      const storageApplied = await applyStorageStateToCurrentOrigin(client, targetUrl, storageState);
      if (storageApplied) {
        await client.send('Page.reload', { ignoreCache: true });
        await delay(Math.min(Math.max(action.timeoutMs ?? 1_000, 250), 5_000));
      }
      return actionResult(index, action, true, `Opened ${targetUrl}`, null);
    }

    if (action.type === 'wait') {
      await delay(Math.min(Math.max(action.timeoutMs ?? 500, 100), 10_000));
      return actionResult(index, action, true, `Waited ${String(action.timeoutMs ?? 500)}ms`, null);
    }

    if (action.type === 'read') {
      const text = await evaluateString(client, 'document.body ? document.body.innerText : document.documentElement.innerText');
      artifacts.push(textArtifact(index, text, previewChars));
      return actionResult(index, action, true, `Read ${String(text.length)} characters`, text.slice(0, previewChars));
    }

    if (action.type === 'click') {
      const selector = requireSelector(action);
      const point = await dispatchNativeClick(client, selector);
      if (!point) {
        throw new Error(`Selector not found: ${selector}`);
      }
      await delay(Math.min(Math.max(action.timeoutMs ?? 500, 100), 5_000));
      return actionResult(index, action, true, `Clicked ${selector}`, null);
    }

    if (action.type === 'type') {
      const selector = requireSelector(action);
      const text = action.text ?? '';
      const point = await dispatchNativeClick(client, selector);
      if (!point) {
        throw new Error(`Selector not found: ${selector}`);
      }
      const focused = await focusAndSelectSelector(client, selector);
      if (!focused) {
        throw new Error(`Selector not focusable: ${selector}`);
      }
      await client.send('Input.insertText', { text });
      await delay(Math.min(Math.max(action.timeoutMs ?? 250, 50), 5_000));
      return actionResult(index, action, true, `Typed into ${selector}`, text.slice(0, previewChars));
    }

    if (action.type === 'screenshot') {
      const captured = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const data = readStringField(captured, 'data');
      artifacts.push(binaryArtifact(index, 'screenshot', 'image/png', data, '[png screenshot]'));
      return actionResult(index, action, true, 'Captured screenshot', null);
    }

    if (action.type === 'pdf') {
      const captured = await client.send('Page.printToPDF', { printBackground: true });
      const data = readStringField(captured, 'data');
      artifacts.push(binaryArtifact(index, 'pdf', 'application/pdf', data, '[pdf document]'));
      return actionResult(index, action, true, 'Captured PDF', null);
    }

    throw new Error('Unsupported browser action.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return actionResult(index, action, false, message, null, message);
  }
}

function normalizeCdpCookieExpires(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value === -1 || value > 0) {
    return Math.floor(value > 9_999_999_999 ? value / 1000 : value);
  }
  return null;
}

function mergeInteractiveCookies(left: BrowserInteractiveCookie[], right: BrowserInteractiveCookie[]): BrowserInteractiveCookie[] {
  const result: BrowserInteractiveCookie[] = [];
  const keys = new Set<string>();
  for (const cookie of [...left, ...right]) {
    const key = [cookie.name, cookie.domain ?? '', cookie.path ?? '/'].join('\n');
    if (keys.has(key)) {
      const index = result.findIndex((entry) => [entry.name, entry.domain ?? '', entry.path ?? '/'].join('\n') === key);
      if (index >= 0) {
        result[index] = cookie;
      }
      continue;
    }
    keys.add(key);
    result.push(cookie);
  }
  return result;
}

function readStorageStateCookies(storageState: Record<string, unknown> | null): BrowserInteractiveCookie[] {
  const cookies = Array.isArray(storageState?.cookies) ? storageState.cookies : [];
  const result: BrowserInteractiveCookie[] = [];
  for (const cookie of cookies) {
    if (!isRecord(cookie)) {
      continue;
    }
    const name = typeof cookie.name === 'string' ? cookie.name.trim() : '';
    const value = typeof cookie.value === 'string' ? cookie.value : '';
    if (!name) {
      continue;
    }
    result.push({
      name,
      value,
      domain: typeof cookie.domain === 'string' && cookie.domain.trim().length > 0 ? cookie.domain.trim() : null,
      path: typeof cookie.path === 'string' && cookie.path.trim().length > 0 ? cookie.path.trim() : '/',
      expires: typeof cookie.expires === 'number' && Number.isFinite(cookie.expires) ? cookie.expires : null,
      httpOnly: typeof cookie.httpOnly === 'boolean' ? cookie.httpOnly : null,
      secure: typeof cookie.secure === 'boolean' ? cookie.secure : null,
      sameSite: readSameSite(cookie.sameSite)
    });
  }
  return result;
}

async function applyStorageStateToCurrentOrigin(
  client: CdpCommandClient,
  targetUrl: string,
  storageState: Record<string, unknown> | null
): Promise<boolean> {
  const entries = readStorageStateLocalStorage(storageState, targetUrl);
  if (entries.length === 0) {
    return false;
  }
  const expression = `(() => {
    const entries = ${JSON.stringify(entries)};
    for (const entry of entries) {
      window.localStorage.setItem(entry.name, entry.value);
    }
    return true;
  })()`;
  await client.send('Runtime.evaluate', { expression, returnByValue: true });
  return true;
}

function readStorageStateLocalStorage(
  storageState: Record<string, unknown> | null,
  targetUrl: string
): Array<{ name: string; value: string }> {
  const targetOrigin = safeOrigin(targetUrl);
  if (!targetOrigin) {
    return [];
  }
  const origins = Array.isArray(storageState?.origins) ? storageState.origins : [];
  for (const originRecord of origins) {
    if (!isRecord(originRecord)) {
      continue;
    }
    const origin = typeof originRecord.origin === 'string' ? originRecord.origin.trim() : '';
    if (origin !== targetOrigin) {
      continue;
    }
    const rawEntries = Array.isArray(originRecord.localStorage) ? originRecord.localStorage : [];
    const entries: Array<{ name: string; value: string }> = [];
    for (const rawEntry of rawEntries) {
      if (!isRecord(rawEntry)) {
        continue;
      }
      const name = typeof rawEntry.name === 'string' ? rawEntry.name : '';
      const value = typeof rawEntry.value === 'string' ? rawEntry.value : '';
      if (name) {
        entries.push({ name, value });
      }
    }
    return entries;
  }
  return [];
}

function readSameSite(value: unknown): BrowserInteractiveCookie['sameSite'] {
  return value === 'Lax' || value === 'None' || value === 'Strict' ? value : null;
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeActionPlan(input: BrowserInteractiveRunInput): BrowserInteractiveActionInput[] {
  const hasOpen = input.actions.some((action) => action.type === 'open');
  return hasOpen ? input.actions : [{ type: 'open', url: input.url }, ...input.actions];
}

function actionResult(
  index: number,
  action: BrowserInteractiveActionInput,
  ok: boolean,
  summary: string,
  textPreview: string | null,
  error: string | null = null
): BrowserInteractiveActionResult {
  return {
    index,
    type: action.type,
    ok,
    summary,
    selector: action.selector ?? null,
    url: action.url ?? null,
    textPreview,
    error
  };
}

function textArtifact(index: number, text: string, previewChars: number): BrowserInteractiveArtifact {
  return {
    id: `interactive_artifact:${String(index)}:read`,
    actionIndex: index,
    kind: 'read',
    mimeType: 'text/plain',
    sizeBytes: Buffer.byteLength(text, 'utf8'),
    contentPreview: text.slice(0, previewChars),
    contentBase64: Buffer.from(text, 'utf8').toString('base64')
  };
}

function binaryArtifact(
  index: number,
  kind: 'screenshot' | 'pdf',
  mimeType: string,
  contentBase64: string,
  preview: string
): BrowserInteractiveArtifact {
  return {
    id: `interactive_artifact:${String(index)}:${kind}`,
    actionIndex: index,
    kind,
    mimeType,
    sizeBytes: Buffer.byteLength(contentBase64, 'base64'),
    contentPreview: preview,
    contentBase64
  };
}

async function waitForCdpTab(port: number, fallbackUrl: string): Promise<CdpTab> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const tabs = await fetchJsonArray(`http://127.0.0.1:${String(port)}/json`);
      const tab = tabs.find((entry) => isRecord(entry) && typeof entry.webSocketDebuggerUrl === 'string');
      if (isRecord(tab) && typeof tab.webSocketDebuggerUrl === 'string') {
        return { webSocketDebuggerUrl: tab.webSocketDebuggerUrl, closeOnRelease: true };
      }
      await fetch(`http://127.0.0.1:${String(port)}/json/new?${encodeURIComponent(fallbackUrl)}`);
    } catch {
      await delay(150);
    }
  }
  throw new Error('Timed out waiting for Chrome DevTools tab.');
}

async function waitForCdpEndpointTab(endpoint: string, fallbackUrl: string): Promise<CdpTab> {
  const normalized = endpoint.trim();
  if (normalized.startsWith('ws://') || normalized.startsWith('wss://')) {
    const httpEndpoint = cdpBrowserWebSocketToHttpEndpoint(normalized);
    if (httpEndpoint) {
      return waitForCdpHttpEndpointTab(httpEndpoint, fallbackUrl);
    }
    return { webSocketDebuggerUrl: normalized, closeOnRelease: false };
  }
  return waitForCdpHttpEndpointTab(normalized, fallbackUrl);
}

async function waitForCdpHttpEndpointTab(endpoint: string, fallbackUrl: string): Promise<CdpTab> {
  const baseUrl = normalizeCdpHttpEndpoint(endpoint);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const openedTab = await openCdpTab(baseUrl, fallbackUrl);
      if (openedTab) {
        return openedTab;
      }
      const tabs = await fetchJsonArray(`${baseUrl}/json`);
      const pageTab = tabs.find(
        (entry) =>
          isRecord(entry) &&
          typeof entry.webSocketDebuggerUrl === 'string' &&
          (entry.type === undefined || entry.type === 'page')
      );
      if (isRecord(pageTab) && typeof pageTab.webSocketDebuggerUrl === 'string') {
        return { webSocketDebuggerUrl: pageTab.webSocketDebuggerUrl, closeOnRelease: false };
      }
    } catch {
      await delay(150);
    }
  }
  throw new Error(`Timed out waiting for Chrome DevTools tab at ${baseUrl}.`);
}

function cdpBrowserWebSocketToHttpEndpoint(value: string): string | null {
  try {
    const url = new URL(value);
    if (!url.pathname.startsWith('/devtools/browser/')) {
      return null;
    }
    const protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${url.host}`;
  } catch {
    return null;
  }
}

async function openCdpTab(baseUrl: string, fallbackUrl: string): Promise<CdpTab | null> {
  const target = `${baseUrl}/json/new?${encodeURIComponent(fallbackUrl)}`;
  const getResponse = await fetch(target);
  if (getResponse.ok) {
    return readCdpTabResponse(getResponse);
  }
  const putResponse = await fetch(target, { method: 'PUT' });
  return putResponse.ok ? readCdpTabResponse(putResponse) : null;
}

async function readCdpTabResponse(response: Response): Promise<CdpTab | null> {
  const parsed: unknown = await response.json();
  if (!isRecord(parsed) || typeof parsed.webSocketDebuggerUrl !== 'string') {
    return null;
  }
  return { webSocketDebuggerUrl: parsed.webSocketDebuggerUrl, closeOnRelease: true };
}

function normalizeCdpHttpEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, '');
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return trimmed;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed;
  }
}

async function fetchJsonArray(url: string): Promise<unknown[]> {
  const response = await fetch(url);
  const parsed: unknown = await response.json();
  if (!Array.isArray(parsed)) {
    return [];
  }
  const items: unknown[] = [];
  for (const entry of parsed) {
    items.push(entry);
  }
  return items;
}

async function dispatchNativeClick(client: CdpCommandClient, selector: string): Promise<CdpSelectorPoint | null> {
  const point = await resolveSelectorPoint(client, selector);
  if (!point) {
    return null;
  }
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none'
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  });
  return point;
}

async function resolveSelectorPoint(client: CdpCommandClient, selector: string): Promise<CdpSelectorPoint | null> {
  const response = await client.send('Runtime.evaluate', {
    expression: selectorPointExpression(selector),
    returnByValue: true,
    awaitPromise: true
  });
  return readSelectorPoint(response);
}

async function focusAndSelectSelector(client: CdpCommandClient, selector: string): Promise<boolean> {
  return evaluateBoolean(client, focusAndSelectSelectorExpression(selector));
}

function selectorPointExpression(selector: string): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', inline: 'center' });
    }
    const rect = el.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width <= 0 || rect.height <= 0) return null;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height
    };
  })()`;
}

function focusAndSelectSelectorExpression(selector: string): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    if (typeof el.focus === 'function') {
      el.focus({ preventScroll: true });
    }
    if (typeof el.select === 'function') {
      el.select();
      return true;
    }
    const doc = el.ownerDocument || document;
    const selection = doc.getSelection ? doc.getSelection() : window.getSelection();
    if (selection && doc.createRange) {
      const range = doc.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return true;
  })()`;
}

function readSelectorPoint(response: unknown): CdpSelectorPoint | null {
  const value = readRemoteObject(response);
  if (!value) {
    return null;
  }
  const x = readFiniteNumberField(value, 'x');
  const y = readFiniteNumberField(value, 'y');
  const width = readFiniteNumberField(value, 'width');
  const height = readFiniteNumberField(value, 'height');
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  return { x, y, width, height };
}

async function evaluateString(client: CdpCommandClient, expression: string): Promise<string> {
  const response = await client.send('Runtime.evaluate', { expression, returnByValue: true });
  return readRemoteValue(response);
}

async function evaluateBoolean(client: CdpCommandClient, expression: string): Promise<boolean> {
  const response = await client.send('Runtime.evaluate', { expression, returnByValue: true });
  return readRemoteValue(response) === 'true';
}

async function readCurrentUrl(client: CdpCommandClient): Promise<string | null> {
  const url = await evaluateString(client, 'window.location.href');
  return url.trim() || null;
}

function readRemoteObject(response: unknown): Record<string, unknown> | null {
  if (!isRecord(response) || !isRecord(response.result)) {
    return null;
  }
  const value = response.result.value;
  return isRecord(value) ? value : null;
}

function readRemoteValue(response: unknown): string {
  if (!isRecord(response) || !isRecord(response.result)) {
    return '';
  }
  const value = response.result.value;
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return typeof value === 'string' ? value : '';
}

function readStringField(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : '';
}

function readFiniteNumberField(value: Record<string, unknown>, key: string): number | null {
  const field = value[key];
  return typeof field === 'number' && Number.isFinite(field) ? field : null;
}

function requireSelector(action: BrowserInteractiveActionInput): string {
  const selector = action.selector?.trim() ?? '';
  if (!selector) {
    throw new Error(`${action.type} action requires selector.`);
  }
  return selector;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveCdpLaunchPlan(profile: BrowserInteractiveBrowserProfile | null, requestedCdpEndpoint: string | null): CdpLaunchPlan {
  const cdpEndpoint = requestedCdpEndpoint?.trim() || profile?.cdpEndpoint?.trim() || null;
  if (cdpEndpoint) {
    return {
      executable: '',
      userDataDir: null,
      profileDirectory: null,
      cdpEndpoint,
      error: null
    };
  }

  if (profile?.browserKind === 'firefox') {
    return {
      executable: '',
      userDataDir: null,
      profileDirectory: null,
      cdpEndpoint: null,
      error:
        'Interactive live control currently supports Chromium profile paths only. Firefox/Zen profiles can still be used through imported cookies for governed capture.'
    };
  }

  const executable = profile?.browserKind === 'edge' ? resolveEdgeExecutable() : resolveChromeExecutable();
  if (!executable) {
    return {
      executable: '',
      userDataDir: null,
      profileDirectory: null,
      cdpEndpoint: null,
      error: profile?.browserKind === 'edge' ? 'Microsoft Edge executable was not found on this host.' : 'Chrome executable was not found on this host.'
    };
  }

  const userDataDir = resolveChromiumUserDataDir(profile);
  if (userDataDir && !fsSync.existsSync(userDataDir)) {
    return {
      executable,
      userDataDir: null,
      profileDirectory: null,
      cdpEndpoint: null,
      error: `Chromium user data directory was not found: ${userDataDir}`
    };
  }

  return {
    executable,
    userDataDir,
    profileDirectory: resolveChromiumProfileDirectory(profile),
    cdpEndpoint: null,
    error: null
  };
}

function resolveChromiumUserDataDir(profile: BrowserInteractiveBrowserProfile | null): string | null {
  const profilePath = profile?.browserProfilePath?.trim() ?? '';
  if (!profilePath) {
    return null;
  }
  const basename = path.basename(profilePath);
  const profileName = profile?.browserProfileName?.trim() ?? '';
  if (profileName && basename === profileName) {
    return path.dirname(profilePath);
  }
  if (basename === 'Default' || /^Profile \d+$/i.test(basename)) {
    return path.dirname(profilePath);
  }
  return profilePath;
}

function resolveChromiumProfileDirectory(profile: BrowserInteractiveBrowserProfile | null): string | null {
  const profileName = profile?.browserProfileName?.trim() ?? '';
  if (profileName) {
    return profileName;
  }
  const profilePath = profile?.browserProfilePath?.trim() ?? '';
  if (!profilePath) {
    return null;
  }
  const basename = path.basename(profilePath);
  return basename === 'Default' || /^Profile \d+$/i.test(basename) ? basename : null;
}

function resolveChromeExecutable(): string | null {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.OPS_BROWSER_VISIBLE_CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return candidates.find((candidate) => fileExists(candidate)) ?? null;
}

function resolveEdgeExecutable(): string | null {
  const candidates = [
    process.env.EDGE_BIN,
    process.env.MSEDGE_BIN,
    process.env.OPS_BROWSER_VISIBLE_EDGE_BIN,
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/msedge'
  ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return candidates.find((candidate) => fileExists(candidate)) ?? null;
}

function fileExists(candidate: string): boolean {
  return fsSync.existsSync(candidate);
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
          return;
        }
        reject(new Error('Failed to reserve a local port.'));
      });
    });
    server.on('error', reject);
  });
}

function terminateChrome(chrome: ChildProcessWithoutNullStreams | null): void {
  if (chrome && !chrome.killed) {
    chrome.kill('SIGTERM');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
