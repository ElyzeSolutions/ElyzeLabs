import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Duplex } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { BrowserInteractiveService } from '../../src/browser-interactive-service.ts';

interface RecordedCdpCommand {
  method: string;
  params: Record<string, unknown>;
}

interface FakeCdpServer {
  endpoint: string;
  commands: RecordedCdpCommand[];
  requests: string[];
  close: () => Promise<void>;
}

interface FakeCdpState {
  downloadPath: string | null;
  downloadWritten: boolean;
}

describe('browser interactive service', () => {
  it('uses native CDP events for click, type, upload, download, scroll, and keypress actions', async () => {
    const fakeCdp = await startFakeCdpServer();
    const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ops-browser-upload-test-'));
    const uploadPath = path.join(uploadRoot, 'fixture.txt');
    await fs.writeFile(uploadPath, 'upload fixture', 'utf8');
    try {
      const service = new BrowserInteractiveService();
      const result = await service.run({
        url: 'https://example.test/form',
        cdpEndpoint: fakeCdp.endpoint,
        previewChars: 120,
        actions: [
          { type: 'open', url: 'https://example.test/form', timeoutMs: 250 },
          { type: 'click', selector: '#continue', timeoutMs: 100 },
          { type: 'type', selector: '#search', text: 'hello native input', timeoutMs: 50 },
          { type: 'upload', selector: '#avatar', filePath: uploadPath, timeoutMs: 50 },
          { type: 'download', selector: '#export', timeoutMs: 500 },
          { type: 'scroll', selector: '#feed', deltaY: 720, timeoutMs: 50 },
          { type: 'keypress', key: 'Enter', timeoutMs: 50 },
          { type: 'read' }
        ]
      });

      expect(result.ok).toBe(true);
      expect(result.provider).toBe('cdp_chrome');
      expect(result.actions.map((action) => action.type)).toEqual([
        'open',
        'click',
        'type',
        'upload',
        'download',
        'scroll',
        'keypress',
        'read'
      ]);

      const mouseEventTypes = fakeCdp.commands
        .filter((command) => command.method === 'Input.dispatchMouseEvent')
        .map((command) => readStringField(command.params, 'type'));
      expect(mouseEventTypes).toEqual([
        'mouseMoved',
        'mousePressed',
        'mouseReleased',
        'mouseMoved',
        'mousePressed',
        'mouseReleased',
        'mouseMoved',
        'mousePressed',
        'mouseReleased',
        'mouseWheel'
      ]);

      const wheelCommand = fakeCdp.commands.find(
        (command) =>
          command.method === 'Input.dispatchMouseEvent' && readStringField(command.params, 'type') === 'mouseWheel'
      );
      expect(wheelCommand ? readNumberField(wheelCommand.params, 'deltaY') : null).toBe(720);

      const insertedTextCommand = fakeCdp.commands.find((command) => command.method === 'Input.insertText');
      expect(insertedTextCommand ? readStringField(insertedTextCommand.params, 'text') : '').toBe('hello native input');

      const uploadCommand = fakeCdp.commands.find((command) => command.method === 'DOM.setFileInputFiles');
      expect(uploadCommand ? readStringArrayField(uploadCommand.params, 'files') : []).toEqual([uploadPath]);
      expect(fakeCdp.commands.some((command) => command.method === 'DOM.requestNode')).toBe(true);
      const selectorExpressions = fakeCdp.commands
        .filter((command) => command.method === 'Runtime.evaluate')
        .map((command) => readStringField(command.params, 'expression'));
      expect(selectorExpressions.some((expression) => expression.includes('shadowRoot'))).toBe(true);
      expect(selectorExpressions.some((expression) => expression.includes('contentDocument'))).toBe(true);

      const downloadCommand = fakeCdp.commands.find((command) => command.method === 'Browser.setDownloadBehavior');
      expect(downloadCommand ? readStringField(downloadCommand.params, 'behavior') : '').toBe('allow');
      const downloadArtifact = result.artifacts.find((artifact) => artifact.kind === 'download');
      expect(downloadArtifact?.contentPreview).toContain('download fixture');

      const keyEventTypes = fakeCdp.commands
        .filter((command) => command.method === 'Input.dispatchKeyEvent')
        .map((command) => readStringField(command.params, 'type'));
      expect(keyEventTypes).toEqual(['rawKeyDown', 'keyUp']);
      const keyDownCommand = fakeCdp.commands.find(
        (command) =>
          command.method === 'Input.dispatchKeyEvent' && readStringField(command.params, 'type') === 'rawKeyDown'
      );
      expect(keyDownCommand ? readStringField(keyDownCommand.params, 'key') : '').toBe('Enter');

      const mutationExpressions = fakeCdp.commands
        .filter((command) => command.method === 'Runtime.evaluate')
        .map((command) => readStringField(command.params, 'expression'))
        .filter((expression) => expression.includes('.value ='));
      expect(mutationExpressions).toEqual([]);
      expect(fakeCdp.requests.some((requestPath) => requestPath.startsWith('/json/new'))).toBe(true);
    } finally {
      await fs.rm(uploadRoot, { recursive: true, force: true });
      await fakeCdp.close();
    }
  });

  it('keeps a persistent CDP live session open across action batches', async () => {
    const fakeCdp = await startFakeCdpServer();
    const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ops-browser-live-upload-test-'));
    const uploadPath = path.join(uploadRoot, 'live-fixture.txt');
    await fs.writeFile(uploadPath, 'live upload fixture', 'utf8');
    try {
      const service = new BrowserInteractiveService();
      const started = await service.startSession({
        url: 'https://example.test/form',
        cdpEndpoint: fakeCdp.endpoint,
        previewChars: 120,
        actions: []
      });

      expect(started.session.provider).toBe('cdp_chrome');
      expect(started.session.sessionId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(started.control.actions.map((action) => action.type)).toEqual(['open']);

      const acted = await service.runSessionActions({
        sessionId: started.session.sessionId,
        previewChars: 120,
        actions: [
          { type: 'click', selector: '#continue', timeoutMs: 100 },
          { type: 'type', selector: '#search', text: 'live session input', timeoutMs: 50 },
          { type: 'upload', selector: '#avatar', filePaths: [uploadPath], timeoutMs: 50 },
          { type: 'download', selector: '#export', timeoutMs: 500 },
          { type: 'scroll', selector: '#feed', deltaY: 500, timeoutMs: 50 },
          { type: 'keypress', key: 'Escape', timeoutMs: 50 },
          { type: 'read' }
        ]
      });

      expect(acted.session.sessionId).toBe(started.session.sessionId);
      expect(acted.session.lastActivityAt >= started.session.lastActivityAt).toBe(true);
      expect(acted.control.ok).toBe(true);
      expect(acted.control.actions.map((action) => action.type)).toEqual([
        'click',
        'type',
        'upload',
        'download',
        'scroll',
        'keypress',
        'read'
      ]);

      const closed = await service.closeSession(started.session.sessionId);
      expect(closed.closed).toBe(true);
      expect(closed.sessionId).toBe(started.session.sessionId);
      expect(fakeCdp.commands.some((command) => command.method === 'Page.close')).toBe(true);

      await expect(
        service.runSessionActions({
          sessionId: started.session.sessionId,
          previewChars: 120,
          actions: [{ type: 'read' }]
        })
      ).rejects.toThrow(/live session not found/u);
    } finally {
      await fs.rm(uploadRoot, { recursive: true, force: true });
      await fakeCdp.close();
    }
  });
});

async function startFakeCdpServer(): Promise<FakeCdpServer> {
  const commands: RecordedCdpCommand[] = [];
  const requests: string[] = [];
  const sockets = new Set<Duplex>();
  const state: FakeCdpState = {
    downloadPath: null,
    downloadWritten: false
  };
  let websocketUrl = '';
  const server = http.createServer((request, response) => {
    requests.push(request.url ?? '');
    if (request.url?.startsWith('/json/new')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ type: 'page', webSocketDebuggerUrl: websocketUrl }));
      return;
    }
    if (request.url?.startsWith('/json')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify([{ type: 'page', webSocketDebuggerUrl: websocketUrl }]));
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  });

  server.on('upgrade', (request, socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
    const key = request.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        ''
      ].join('\r\n')
    );

    let frameBuffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      frameBuffer = Buffer.concat([frameBuffer, chunk]);
      const parsed = readClientTextFrames(frameBuffer);
      frameBuffer = parsed.remaining;
      for (const message of parsed.messages) {
        handleCdpMessage(socket, message, commands, state);
      }
    });
    socket.on('error', () => undefined);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fake CDP server did not expose a TCP port.');
  }
  websocketUrl = `ws://127.0.0.1:${String(address.port)}/devtools/page/test`;
  return {
    endpoint: `http://127.0.0.1:${String(address.port)}`,
    commands,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

function handleCdpMessage(
  socket: { write: (chunk: Buffer | string) => unknown },
  text: string,
  commands: RecordedCdpCommand[],
  state: FakeCdpState
): void {
  const message = parseJsonRecord(text);
  if (!message) {
    return;
  }
  const id = readNumberField(message, 'id');
  const method = readStringField(message, 'method');
  if (id === null || !method) {
    return;
  }
  const params = readRecordField(message, 'params') ?? {};
  commands.push({ method, params });
  writeServerTextFrame(socket, JSON.stringify({ id, result: cdpResultFor(method, params, state) }));
}

function cdpResultFor(method: string, params: Record<string, unknown>, state: FakeCdpState): Record<string, unknown> {
  if (method === 'Runtime.evaluate') {
    return runtimeEvaluateResult(readStringField(params, 'expression'));
  }
  if (method === 'Browser.setDownloadBehavior' || method === 'Page.setDownloadBehavior') {
    state.downloadPath = readStringField(params, 'downloadPath');
    state.downloadWritten = false;
    return {};
  }
  if (
    method === 'Input.dispatchMouseEvent' &&
    readStringField(params, 'type') === 'mouseReleased' &&
    state.downloadPath &&
    !state.downloadWritten
  ) {
    fsSync.mkdirSync(state.downloadPath, { recursive: true });
    fsSync.writeFileSync(path.join(state.downloadPath, 'fake-download.txt'), 'download fixture', 'utf8');
    state.downloadWritten = true;
    return {};
  }
  if (method === 'DOM.getDocument') {
    return { root: { nodeId: 1 } };
  }
  if (method === 'DOM.requestNode') {
    return { nodeId: 7 };
  }
  if (method === 'DOM.querySelector') {
    return { nodeId: readStringField(params, 'selector') === '#missing' ? 0 : 7 };
  }
  if (method === 'Page.captureScreenshot') {
    return { data: Buffer.from('png', 'utf8').toString('base64') };
  }
  return {};
}

function runtimeEvaluateResult(expression: string): Record<string, unknown> {
  if (expression.includes('return found ? found.el : null')) {
    return { result: { type: 'object', objectId: 'deep-node-7' } };
  }
  if (expression === 'window.location.href') {
    return { result: { type: 'string', value: 'https://example.test/form' } };
  }
  if (expression.includes('document.body')) {
    return { result: { type: 'string', value: 'Example page text' } };
  }
  if (expression.includes('getBoundingClientRect')) {
    return {
      result: {
        type: 'object',
        value: {
          x: 96,
          y: 48,
          width: 120,
          height: 36
        }
      }
    };
  }
  if (expression.includes('el.focus')) {
    return { result: { type: 'boolean', value: true } };
  }
  return { result: { type: 'boolean', value: true } };
}

function readClientTextFrames(input: Buffer): { messages: string[]; remaining: Buffer } {
  const messages: string[] = [];
  let offset = 0;
  while (offset + 2 <= input.length) {
    const first = input[offset];
    const second = input[offset + 1];
    if (first === undefined || second === undefined) {
      break;
    }
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let payloadLength = second & 0x7f;
    let headerLength = 2;
    if (payloadLength === 126) {
      if (offset + 4 > input.length) {
        break;
      }
      payloadLength = input.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (offset + 10 > input.length) {
        break;
      }
      const high = input.readUInt32BE(offset + 2);
      const low = input.readUInt32BE(offset + 6);
      if (high !== 0) {
        throw new Error('Fake CDP frame is too large.');
      }
      payloadLength = low;
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;
    if (offset + frameLength > input.length) {
      break;
    }
    if (opcode === 1) {
      const payloadStart = offset + headerLength + maskLength;
      const payload = Buffer.from(input.subarray(payloadStart, payloadStart + payloadLength));
      if (masked) {
        const maskStart = offset + headerLength;
        for (let index = 0; index < payload.length; index += 1) {
          const mask = input[maskStart + (index % 4)] ?? 0;
          payload[index] = payload[index] ^ mask;
        }
      }
      messages.push(payload.toString('utf8'));
    }
    offset += frameLength;
  }
  return { messages, remaining: input.subarray(offset) };
}

function writeServerTextFrame(socket: { write: (chunk: Buffer | string) => unknown }, text: string): void {
  const payload = Buffer.from(text, 'utf8');
  if (payload.length < 126) {
    socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
    return;
  }
  if (payload.length <= 65_535) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    socket.write(Buffer.concat([header, payload]));
    return;
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeUInt32BE(0, 2);
  header.writeUInt32BE(payload.length, 6);
  socket.write(Buffer.concat([header, payload]));
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readRecordField(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const field = value[key];
  return isRecord(field) ? field : null;
}

function readStringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  return typeof field === 'string' ? field : '';
}

function readStringArrayField(value: Record<string, unknown>, key: string): string[] {
  const field = value[key];
  if (!Array.isArray(field)) {
    return [];
  }
  return field.filter((entry): entry is string => typeof entry === 'string');
}

function readNumberField(value: Record<string, unknown>, key: string): number | null {
  const field = value[key];
  return typeof field === 'number' && Number.isFinite(field) ? field : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
