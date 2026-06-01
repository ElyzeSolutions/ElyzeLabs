import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type BrowserInteractiveActionType =
  | 'open'
  | 'reload'
  | 'back'
  | 'forward'
  | 'read'
  | 'snapshot'
  | 'hover'
  | 'click'
  | 'type'
  | 'upload'
  | 'download'
  | 'scroll'
  | 'keypress'
  | 'wait'
  | 'screenshot'
  | 'pdf';

export interface BrowserInteractiveActionInput {
  type: BrowserInteractiveActionType;
  url?: string;
  selector?: string;
  text?: string;
  filePath?: string;
  filePaths?: string[];
  key?: string;
  deltaX?: number;
  deltaY?: number;
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
  kind: 'read' | 'snapshot' | 'screenshot' | 'pdf' | 'download';
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
        downloadDir: connection.downloadDir,
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
      downloadDir: connection.downloadDir,
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
      downloadDir: liveSession.connection.downloadDir,
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

interface CdpKeyPress {
  key: string;
  code: string;
  keyCode: number;
  text: string | null;
}

interface CdpConnection {
  client: CdpClient;
  chrome: ChildProcessWithoutNullStreams | null;
  tempUserDataDir: string | null;
  downloadDir: string;
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

interface DownloadedFile {
  path: string;
  fileName: string;
  sizeBytes: number;
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
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ops-interactive-download-'));
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
    await client.send('DOM.enable');
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
        downloadDir,
        closeTabOnRelease: tab.closeOnRelease
      },
      error: null
    };
  } catch (cause) {
    terminateChrome(chrome);
    if (tempUserDataDir) {
      await fs.rm(tempUserDataDir, { recursive: true, force: true });
    }
    await fs.rm(downloadDir, { recursive: true, force: true });
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
  await fs.rm(connection.downloadDir, { recursive: true, force: true });
}

async function executeCdpActionPlan(input: {
  client: CdpCommandClient;
  downloadDir: string;
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
      downloadDir: input.downloadDir,
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
  downloadDir: string;
  action: BrowserInteractiveActionInput;
  index: number;
  previewChars: number;
  artifacts: BrowserInteractiveArtifact[];
  storageState: Record<string, unknown> | null;
}): Promise<BrowserInteractiveActionResult> {
  const { client, downloadDir, action, index, previewChars, artifacts, storageState } = input;
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

    if (action.type === 'reload') {
      await client.send('Page.reload', { ignoreCache: true });
      await delay(Math.min(Math.max(action.timeoutMs ?? 1_000, 250), 5_000));
      return actionResult(index, action, true, 'Reloaded page', null);
    }

    if (action.type === 'back' || action.type === 'forward') {
      const delta = action.type === 'back' ? -1 : 1;
      const navigated = await navigateHistoryRelative(client, delta);
      if (!navigated) {
        throw new Error(action.type === 'back' ? 'No previous browser history entry.' : 'No next browser history entry.');
      }
      await delay(Math.min(Math.max(action.timeoutMs ?? 1_000, 250), 5_000));
      return actionResult(index, action, true, action.type === 'back' ? 'Navigated back' : 'Navigated forward', null);
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

    if (action.type === 'snapshot') {
      const snapshot = await evaluateString(client, interactiveSnapshotExpression());
      artifacts.push(snapshotArtifact(index, snapshot, previewChars));
      return actionResult(index, action, true, `Captured ${String(snapshot.length)} snapshot characters`, snapshot.slice(0, previewChars));
    }

    if (action.type === 'hover') {
      const selector = requireSelector(action);
      const point = await dispatchNativeHover(client, selector);
      if (!point) {
        throw new Error(`Selector not found: ${selector}`);
      }
      await delay(Math.min(Math.max(action.timeoutMs ?? 250, 50), 5_000));
      return actionResult(index, action, true, `Hovered ${selector}`, null);
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

    if (action.type === 'upload') {
      const selector = requireSelector(action);
      const filePaths = await normalizeUploadFilePaths(action);
      const uploaded = await setFileInputFiles(client, selector, filePaths);
      if (!uploaded) {
        throw new Error(`File input selector not found: ${selector}`);
      }
      await delay(Math.min(Math.max(action.timeoutMs ?? 250, 50), 5_000));
      const names = filePaths.map((filePath) => path.basename(filePath));
      return actionResult(
        index,
        action,
        true,
        `Uploaded ${String(filePaths.length)} file${filePaths.length === 1 ? '' : 's'} into ${selector}`,
        names.join(', ').slice(0, previewChars)
      );
    }

    if (action.type === 'download') {
      const downloaded = await runDownloadAction(client, action, downloadDir);
      artifacts.push(await downloadArtifact(index, downloaded, previewChars));
      return actionResult(
        index,
        action,
        true,
        `Downloaded ${downloaded.fileName}`,
        downloaded.fileName.slice(0, previewChars)
      );
    }

    if (action.type === 'scroll') {
      const point = action.selector
        ? await resolveSelectorPoint(client, action.selector)
        : await resolveViewportCenterPoint(client);
      if (!point) {
        throw new Error(action.selector ? `Selector not found: ${action.selector}` : 'Viewport not available for scroll action.');
      }
      const deltaX = normalizeScrollDelta(action.deltaX, 0);
      const deltaY = normalizeScrollDelta(action.deltaY, deltaX === 0 ? 600 : 0);
      await client.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: point.x,
        y: point.y,
        button: 'none',
        buttons: 0,
        deltaX,
        deltaY
      });
      await delay(Math.min(Math.max(action.timeoutMs ?? 250, 50), 5_000));
      return actionResult(
        index,
        action,
        true,
        action.selector ? `Scrolled ${action.selector}` : 'Scrolled page',
        `${String(deltaX)},${String(deltaY)}`.slice(0, previewChars)
      );
    }

    if (action.type === 'keypress') {
      const keyPress = normalizeKeyPress(action.key ?? action.text ?? '');
      if (!keyPress) {
        throw new Error('keypress action requires key.');
      }
      const selector = action.selector?.trim() ?? '';
      if (selector) {
        const point = await dispatchNativeClick(client, selector);
        if (!point) {
          throw new Error(`Selector not found: ${selector}`);
        }
        const focused = await focusSelector(client, selector);
        if (!focused) {
          throw new Error(`Selector not focusable: ${selector}`);
        }
      }
      await dispatchNativeKeyPress(client, keyPress);
      await delay(Math.min(Math.max(action.timeoutMs ?? 150, 50), 5_000));
      return actionResult(
        index,
        action,
        true,
        `Pressed ${keyPress.key}`,
        keyPress.text?.slice(0, previewChars) ?? null
      );
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

async function normalizeUploadFilePaths(action: BrowserInteractiveActionInput): Promise<string[]> {
  const rawPaths: string[] = [];
  if (typeof action.filePath === 'string') {
    rawPaths.push(action.filePath);
  }
  if (Array.isArray(action.filePaths)) {
    for (const filePath of action.filePaths) {
      if (typeof filePath === 'string') {
        rawPaths.push(filePath);
      }
    }
  }
  const uniquePaths = new Set<string>();
  const normalizedPaths: string[] = [];
  for (const rawPath of rawPaths) {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      continue;
    }
    const absolutePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
    if (uniquePaths.has(absolutePath)) {
      continue;
    }
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`Upload path is not a file: ${absolutePath}`);
    }
    uniquePaths.add(absolutePath);
    normalizedPaths.push(absolutePath);
  }
  if (normalizedPaths.length === 0) {
    throw new Error('upload action requires filePath or filePaths.');
  }
  return normalizedPaths;
}

async function runDownloadAction(
  client: CdpCommandClient,
  action: BrowserInteractiveActionInput,
  downloadDir: string
): Promise<DownloadedFile> {
  const before = await listDownloadFiles(downloadDir);
  await configureDownloadBehavior(client, downloadDir);
  const selector = action.selector?.trim() ?? '';
  const url = action.url?.trim() ?? '';
  if (selector) {
    const point = await dispatchNativeClick(client, selector);
    if (!point) {
      throw new Error(`Download selector not found: ${selector}`);
    }
  } else if (url) {
    await client.send('Runtime.evaluate', {
      expression: triggerDownloadExpression(url),
      returnByValue: true,
      awaitPromise: true
    });
  } else {
    throw new Error('download action requires selector or url.');
  }
  const timeoutMs = Math.min(Math.max(action.timeoutMs ?? 10_000, 500), 60_000);
  return waitForDownloadedFile(downloadDir, before, timeoutMs);
}

async function configureDownloadBehavior(client: CdpCommandClient, downloadDir: string): Promise<void> {
  try {
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
      eventsEnabled: true
    });
    return;
  } catch {
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir
    });
  }
}

async function waitForDownloadedFile(
  downloadDir: string,
  before: Map<string, number>,
  timeoutMs: number
): Promise<DownloadedFile> {
  const deadline = Date.now() + timeoutMs;
  let stableCandidate: DownloadedFile | null = null;
  while (Date.now() < deadline) {
    const current = await listDownloadFiles(downloadDir);
    for (const [filePath, sizeBytes] of current) {
      if (isPartialDownload(filePath)) {
        continue;
      }
      const previousSize = before.get(filePath);
      if (previousSize === sizeBytes) {
        continue;
      }
      const candidate = {
        path: filePath,
        fileName: path.basename(filePath),
        sizeBytes
      };
      if (stableCandidate?.path === candidate.path && stableCandidate.sizeBytes === candidate.sizeBytes) {
        return candidate;
      }
      stableCandidate = candidate;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for browser download after ${String(timeoutMs)}ms.`);
}

async function listDownloadFiles(downloadDir: string): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const entries = await fs.readdir(downloadDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = path.join(downloadDir, entry.name);
    const stats = await fs.stat(filePath);
    result.set(filePath, stats.size);
  }
  return result;
}

function isPartialDownload(filePath: string): boolean {
  return filePath.endsWith('.crdownload') || filePath.endsWith('.tmp');
}

function triggerDownloadExpression(url: string): string {
  return `(() => {
    const anchor = document.createElement('a');
    anchor.href = ${JSON.stringify(url)};
    anchor.download = '';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  })()`;
}

function inferMimeType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.csv': 'text/csv',
    '.htm': 'text/html',
    '.html': 'text/html',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.txt': 'text/plain',
    '.webp': 'image/webp'
  };
  return mimeTypes[extension] ?? 'application/octet-stream';
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || mimeType === 'application/json';
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

function snapshotArtifact(index: number, text: string, previewChars: number): BrowserInteractiveArtifact {
  return {
    id: `interactive_artifact:${String(index)}:snapshot`,
    actionIndex: index,
    kind: 'snapshot',
    mimeType: 'text/plain',
    sizeBytes: Buffer.byteLength(text, 'utf8'),
    contentPreview: text.slice(0, previewChars),
    contentBase64: Buffer.from(text, 'utf8').toString('base64')
  };
}

async function downloadArtifact(
  index: number,
  downloaded: DownloadedFile,
  previewChars: number
): Promise<BrowserInteractiveArtifact> {
  const content = await fs.readFile(downloaded.path);
  const mimeType = inferMimeType(downloaded.fileName);
  const preview = isTextMimeType(mimeType)
    ? content.toString('utf8').slice(0, previewChars)
    : `[download ${downloaded.fileName}]`;
  return {
    id: `interactive_artifact:${String(index)}:download`,
    actionIndex: index,
    kind: 'download',
    mimeType,
    sizeBytes: downloaded.sizeBytes,
    contentPreview: preview,
    contentBase64: content.toString('base64')
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
  await bringPageToFront(client);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none',
    buttons: 0
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1
  });
  await delay(40);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1
  });
  return point;
}

async function dispatchNativeHover(client: CdpCommandClient, selector: string): Promise<CdpSelectorPoint | null> {
  const point = await resolveSelectorPoint(client, selector);
  if (!point) {
    return null;
  }
  await bringPageToFront(client);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none',
    buttons: 0
  });
  return point;
}

async function bringPageToFront(client: CdpCommandClient): Promise<void> {
  try {
    await client.send('Page.bringToFront');
  } catch {
    // Some CDP targets do not expose Page.bringToFront. Native input can still proceed.
  }
}

async function resolveSelectorPoint(client: CdpCommandClient, selector: string): Promise<CdpSelectorPoint | null> {
  const response = await client.send('Runtime.evaluate', {
    expression: selectorPointExpression(selector),
    returnByValue: true,
    awaitPromise: true
  });
  return readSelectorPoint(response);
}

async function resolveViewportCenterPoint(client: CdpCommandClient): Promise<CdpSelectorPoint | null> {
  const response = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      return {
        x: width / 2,
        y: height / 2,
        width,
        height
      };
    })()`,
    returnByValue: true
  });
  return readSelectorPoint(response);
}

async function setFileInputFiles(client: CdpCommandClient, selector: string, filePaths: string[]): Promise<boolean> {
  const nodeId = await resolveSelectorNodeId(client, selector);
  if (nodeId === null || nodeId === 0) {
    return false;
  }
  await client.send('DOM.setFileInputFiles', {
    nodeId,
    files: filePaths
  });
  return true;
}

async function resolveSelectorNodeId(client: CdpCommandClient, selector: string): Promise<number | null> {
  await client.send('DOM.getDocument', { depth: -1, pierce: true });
  const response = await client.send('Runtime.evaluate', {
    expression: selectorElementExpression(selector),
    awaitPromise: true
  });
  const objectId = readRemoteObjectId(response);
  if (!objectId) {
    return null;
  }
  try {
    const requestNodeResponse = await client.send('DOM.requestNode', { objectId });
    return readNodeId(requestNodeResponse);
  } finally {
    await releaseRemoteObject(client, objectId);
  }
}

async function releaseRemoteObject(client: CdpCommandClient, objectId: string): Promise<void> {
  try {
    await client.send('Runtime.releaseObject', { objectId });
  } catch {
    // Releasing remote handles is best-effort; action success should not depend on cleanup acknowledgement.
  }
}

async function focusAndSelectSelector(client: CdpCommandClient, selector: string): Promise<boolean> {
  return evaluateBoolean(client, focusAndSelectSelectorExpression(selector));
}

async function focusSelector(client: CdpCommandClient, selector: string): Promise<boolean> {
  return evaluateBoolean(client, focusSelectorExpression(selector));
}

function selectorPointExpression(selector: string): string {
  return deepSelectorExpression(
    selector,
    `if (!found) return null;
    for (const frame of found.frames) {
      if (typeof frame.scrollIntoView === 'function') {
        frame.scrollIntoView({ block: 'center', inline: 'center' });
      }
    }
    if (typeof found.el.scrollIntoView === 'function') {
      found.el.scrollIntoView({ block: 'center', inline: 'center' });
    }
    const el = found.el;
    const rect = el.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width <= 0 || rect.height <= 0) return null;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    let left = rect.left;
    let top = rect.top;
    for (let index = found.frames.length - 1; index >= 0; index -= 1) {
      const frameRect = found.frames[index].getBoundingClientRect();
      left += frameRect.left;
      top += frameRect.top;
    }
    return {
      x: left + rect.width / 2,
      y: top + rect.height / 2,
      width: rect.width,
      height: rect.height
    };`
  );
}

function focusAndSelectSelectorExpression(selector: string): string {
  return deepSelectorExpression(
    selector,
    `if (!found) return false;
    const el = found.el;
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
    return true;`
  );
}

function focusSelectorExpression(selector: string): string {
  return deepSelectorExpression(
    selector,
    `if (!found) return false;
    const el = found.el;
    if (typeof el.focus !== 'function') return false;
    el.focus({ preventScroll: true });
    const doc = el.ownerDocument || document;
    return doc.activeElement === el || el.contains(doc.activeElement);`
  );
}

function selectorElementExpression(selector: string): string {
  return deepSelectorExpression(selector, 'return found ? found.el : null;');
}

function deepSelectorExpression(selector: string, foundBody: string): string {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    const normalizeText = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const unquoteSelectorText = (value) => {
      const trimmed = normalizeText(value);
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    };
    const cssQueryOne = (root, css) => {
      try {
        return root.querySelector(css);
      } catch {
        return null;
      }
    };
    const cssQueryAll = (root, css) => {
      try {
        return Array.from(root.querySelectorAll(css));
      } catch {
        return [];
      }
    };
    const readElementLabel = (node) => {
      const aria = normalizeText(node.getAttribute && node.getAttribute('aria-label'));
      if (aria) return aria;
      const title = normalizeText(node.getAttribute && node.getAttribute('title'));
      if (title) return title;
      const placeholder = normalizeText(node.getAttribute && node.getAttribute('placeholder'));
      if (placeholder) return placeholder;
      const alt = normalizeText(node.getAttribute && node.getAttribute('alt'));
      if (alt) return alt;
      const text = normalizeText(node.innerText || node.textContent);
      if (text) return text;
      const name = normalizeText(node.getAttribute && node.getAttribute('name'));
      return name;
    };
    const parseSpecialSelector = (raw) => {
      const textPrefix = raw.match(/^text=(.*)$/i);
      if (textPrefix) return { mode: 'text', base: '*', value: unquoteSelectorText(textPrefix[1]) };
      const ariaPrefix = raw.match(/^(aria|label)=(.*)$/i);
      if (ariaPrefix) return { mode: 'aria', base: '*', value: unquoteSelectorText(ariaPrefix[2]) };
      const hasText = raw.match(/^(.+):has-text\\((.*)\\)$/i);
      if (hasText) return { mode: 'text', base: normalizeText(hasText[1]) || '*', value: unquoteSelectorText(hasText[2]) };
      return null;
    };
    const actionableSelector =
      'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[contenteditable=""],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
    const isContainerTag = (node) => {
      const tag = node.tagName ? node.tagName.toLowerCase() : '';
      return tag === 'html' || tag === 'body' || tag === 'main' || tag === 'section' || tag === 'article';
    };
    const candidatesForSpecial = (root, special) => {
      if (special.base !== '*') return cssQueryAll(root, special.base);
      const actionable = cssQueryAll(root, actionableSelector);
      if (actionable.length > 0) return actionable;
      return cssQueryAll(root, '*').filter((node) => !isContainerTag(node));
    };
    const elementMatchesSpecial = (node, special) => {
      const needle = normalizeText(special.value).toLowerCase();
      if (!needle) return false;
      const haystack =
        special.mode === 'aria'
          ? readElementLabel(node).toLowerCase()
          : normalizeText(node.innerText || node.textContent || readElementLabel(node)).toLowerCase();
      return haystack.includes(needle);
    };
    const findDeepTarget = (root) => {
      if (!root || typeof root.querySelector !== 'function') return null;
      const special = parseSpecialSelector(selector);
      if (special) {
        const candidates = candidatesForSpecial(root, special);
        const matched = candidates.find((candidate) => elementMatchesSpecial(candidate, special));
        if (matched) return { el: matched, frames: [] };
      } else {
        const direct = cssQueryOne(root, selector);
        if (direct) return { el: direct, frames: [] };
      }
      const all = root.querySelectorAll('*');
      for (const node of all) {
        if (node.shadowRoot) {
          const shadowResult = findDeepTarget(node.shadowRoot);
          if (shadowResult) return shadowResult;
        }
        const tagName = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';
        if (tagName === 'iframe' || tagName === 'frame') {
          let frameDocument = null;
          try {
            frameDocument = node.contentDocument;
          } catch {
            frameDocument = null;
          }
          if (frameDocument) {
            const frameResult = findDeepTarget(frameDocument);
            if (frameResult) return { el: frameResult.el, frames: [node, ...frameResult.frames] };
          }
        }
      }
      return null;
    };
    const found = findDeepTarget(document);
    ${foundBody}
  })()`;
}

function interactiveSnapshotExpression(): string {
  return `(() => {
    const opsInteractiveSnapshot = true;
    const normalizeText = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const quoteAttribute = (value) => String(value).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
    const escapeCssIdent = (value) =>
      window.CSS && typeof window.CSS.escape === 'function'
        ? window.CSS.escape(value)
        : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
    };
    const labelFor = (node) => {
      const aria = normalizeText(node.getAttribute('aria-label'));
      if (aria) return aria;
      const title = normalizeText(node.getAttribute('title'));
      if (title) return title;
      const placeholder = normalizeText(node.getAttribute('placeholder'));
      if (placeholder) return placeholder;
      const alt = normalizeText(node.getAttribute('alt'));
      if (alt) return alt;
      const text = normalizeText(node.innerText || node.textContent);
      if (text) return text;
      return normalizeText(node.getAttribute('name'));
    };
    const roleFor = (node) => {
      const explicit = normalizeText(node.getAttribute('role'));
      if (explicit) return explicit;
      const tag = node.tagName.toLowerCase();
      if (tag === 'a') return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'textarea') return 'textbox';
      if (tag === 'select') return 'combobox';
      if (tag === 'input') {
        const type = normalizeText(node.getAttribute('type')).toLowerCase();
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'submit' || type === 'button') return 'button';
        return 'textbox';
      }
      return tag;
    };
    const uniqueCss = (selector) => {
      try {
        return document.querySelectorAll(selector).length === 1;
      } catch {
        return false;
      }
    };
    const nthSelectorFor = (node) => {
      const parts = [];
      let current = node;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        const index = sameTag.indexOf(current) + 1;
        parts.unshift(sameTag.length > 1 ? tag + ':nth-of-type(' + index + ')' : tag);
        current = parent;
      }
      return parts.join(' > ');
    };
    const selectorFor = (node, label) => {
      const id = normalizeText(node.id);
      if (id && uniqueCss('#' + escapeCssIdent(id))) return '#' + escapeCssIdent(id);
      const testId = normalizeText(node.getAttribute('data-testid'));
      if (testId) return '[data-testid="' + quoteAttribute(testId) + '"]';
      const name = normalizeText(node.getAttribute('name'));
      if (name) return node.tagName.toLowerCase() + '[name="' + quoteAttribute(name) + '"]';
      const aria = normalizeText(node.getAttribute('aria-label'));
      if (aria) return 'aria=' + aria;
      const tag = node.tagName.toLowerCase();
      if (label && (tag === 'button' || tag === 'a' || tag === 'summary')) {
        return tag + ':has-text("' + quoteAttribute(label.slice(0, 120)) + '")';
      }
      if (label) return 'text=' + label.slice(0, 120);
      return nthSelectorFor(node);
    };
    const candidates = Array.from(
      document.querySelectorAll(
        'a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="textbox"],[contenteditable=""],[contenteditable="true"],[tabindex]:not([tabindex="-1"])'
      )
    )
      .filter(isVisible)
      .slice(0, 80);
    const lines = [
      'url: ' + window.location.href,
      'title: ' + normalizeText(document.title),
      'targets:'
    ];
    candidates.forEach((node, index) => {
      const rect = node.getBoundingClientRect();
      const label = labelFor(node).slice(0, 160);
      const role = roleFor(node);
      const selector = selectorFor(node, label);
      const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true' ? ' disabled' : '';
      lines.push(
        '- ' +
          String(index + 1) +
          '. ' +
          role +
          ' "' +
          label.replace(/"/g, '\\"') +
          '" selector=' +
          selector +
          ' box=' +
          [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)].join(',') +
          disabled
      );
    });
    if (candidates.length === 0) {
      lines.push('- none');
    }
    return lines.join('\\n');
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

function readNodeId(response: unknown): number | null {
  if (!isRecord(response)) {
    return null;
  }
  const nodeId = response.nodeId;
  return typeof nodeId === 'number' && Number.isInteger(nodeId) ? nodeId : null;
}

function normalizeScrollDelta(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(-3_000, Math.min(3_000, value));
}

async function navigateHistoryRelative(client: CdpCommandClient, delta: -1 | 1): Promise<boolean> {
  const history = await client.send('Page.getNavigationHistory');
  if (!isRecord(history)) {
    return false;
  }
  const historyEntries = readUnknownArrayField(history, 'entries');
  if (!historyEntries) {
    return false;
  }
  const currentIndex = readFiniteNumberField(history, 'currentIndex');
  if (currentIndex === null) {
    return false;
  }
  const targetIndex = currentIndex + delta;
  const targetEntry = historyEntries[targetIndex];
  if (!isRecord(targetEntry)) {
    return false;
  }
  const entryId = readFiniteNumberField(targetEntry, 'id');
  if (entryId === null) {
    return false;
  }
  await client.send('Page.navigateToHistoryEntry', { entryId });
  return true;
}

async function dispatchNativeKeyPress(client: CdpCommandClient, keyPress: CdpKeyPress): Promise<void> {
  const baseParams = {
    key: keyPress.key,
    code: keyPress.code,
    windowsVirtualKeyCode: keyPress.keyCode,
    nativeVirtualKeyCode: keyPress.keyCode
  };
  await client.send('Input.dispatchKeyEvent', {
    ...baseParams,
    type: 'rawKeyDown'
  });
  if (keyPress.text !== null) {
    await client.send('Input.dispatchKeyEvent', {
      ...baseParams,
      type: 'char',
      text: keyPress.text,
      unmodifiedText: keyPress.text
    });
  }
  await client.send('Input.dispatchKeyEvent', {
    ...baseParams,
    type: 'keyUp'
  });
}

function normalizeKeyPress(value: string): CdpKeyPress | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  const named = namedKeyPress(lower);
  if (named) {
    return named;
  }
  if (trimmed.length !== 1) {
    return null;
  }
  const codePoint = trimmed.codePointAt(0);
  if (codePoint === undefined) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  const code = /^[A-Z]$/u.test(upper)
    ? `Key${upper}`
    : /^[0-9]$/u.test(trimmed)
      ? `Digit${trimmed}`
      : `Key${upper}`;
  return {
    key: trimmed,
    code,
    keyCode: codePoint,
    text: trimmed
  };
}

function namedKeyPress(value: string): CdpKeyPress | null {
  const namedKeys: Record<string, CdpKeyPress> = {
    enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: null },
    return: { key: 'Enter', code: 'Enter', keyCode: 13, text: null },
    tab: { key: 'Tab', code: 'Tab', keyCode: 9, text: null },
    escape: { key: 'Escape', code: 'Escape', keyCode: 27, text: null },
    esc: { key: 'Escape', code: 'Escape', keyCode: 27, text: null },
    backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8, text: null },
    delete: { key: 'Delete', code: 'Delete', keyCode: 46, text: null },
    space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
    arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, text: null },
    arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, text: null },
    arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, text: null },
    arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, text: null },
    pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34, text: null },
    pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33, text: null },
    home: { key: 'Home', code: 'Home', keyCode: 36, text: null },
    end: { key: 'End', code: 'End', keyCode: 35, text: null }
  };
  return namedKeys[value] ?? null;
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

function readRemoteObjectId(response: unknown): string | null {
  if (!isRecord(response) || !isRecord(response.result)) {
    return null;
  }
  const objectId = response.result.objectId;
  return typeof objectId === 'string' && objectId.trim().length > 0 ? objectId : null;
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

function readUnknownArrayField(value: Record<string, unknown>, key: string): unknown[] | null {
  const field = value[key];
  if (!Array.isArray(field)) {
    return null;
  }
  const entries: unknown[] = [];
  for (const entry of field) {
    entries.push(entry);
  }
  return entries;
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
