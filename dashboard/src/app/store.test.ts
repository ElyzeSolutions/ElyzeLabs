import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentProfileRow } from './types';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

function makeAgentProfile(): AgentProfileRow {
  return {
    id: 'agent-1',
    name: 'Ops Agent',
    title: 'Operator',
    parentAgentId: null,
    systemPrompt: 'Do the work.',
    defaultRuntime: 'gemini',
    defaultModel: 'gemini-2.5-pro',
    allowedRuntimes: ['gemini'],
    skills: [],
    tools: [],
    metadata: {},
    executionMode: 'on_demand',
    harnessRuntime: null,
    persistentHarnessRuntime: null,
    harnessAutoStart: false,
    harnessSessionName: null,
    harnessSessionReady: false,
    harnessCommand: null,
    enabled: true,
    createdAt: '2026-03-15T10:00:00.000Z',
    updatedAt: '2026-03-15T10:00:00.000Z'
  };
}

function makeSession() {
  return {
    id: 'session-1',
    sessionKey: 'telegram:42',
    channel: 'telegram',
    chatType: 'private',
    agentId: 'agent-1',
    preferredRuntime: 'gemini',
    preferredModel: 'gemini-2.5-pro',
    state: 'active',
    lastActivityAt: '2026-03-15T10:00:00.000Z'
  };
}

function makeRun() {
  return {
    id: 'run-1',
    sessionId: 'session-1',
    status: 'running',
    runtime: 'gemini',
    prompt: 'Inspect the queue.',
    resultSummary: null,
    error: null,
    startedAt: '2026-03-15T10:00:00.000Z',
    endedAt: null,
    createdAt: '2026-03-15T10:00:00.000Z',
    updatedAt: '2026-03-15T10:00:00.000Z'
  };
}

async function loadStore() {
  vi.resetModules();
  vi.stubGlobal('localStorage', createMemoryStorage());
  const module = await import('./store');
  return module.useAppStore;
}

describe('dashboard store token actions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('surfaces the shared missing-token error when creating an agent profile', async () => {
    const store = await loadStore();

    const result = await store.getState().createAgentProfile({
      name: 'Ops Agent',
      title: 'Operator',
      systemPrompt: 'Do the work.',
      defaultRuntime: 'gemini'
    });

    expect(result).toBeNull();
    expect(store.getState().error).toBe('Set API token in Settings before creating agent profiles.');
  });

  it('uses the shared token-action path to refresh agent profiles after success', async () => {
    const store = await loadStore();
    const profile = makeAgentProfile();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/agents/profiles') {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json'
        });
        return jsonResponse({
          ok: true,
          agent: profile
        });
      }
      if (path === '/api/agents/profiles?includeDisabled=true') {
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer token-123'
        });
        return jsonResponse({
          ok: true,
          agents: [profile]
        });
      }
      throw new Error(`Unexpected fetch path: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    store.getState().setToken('token-123');
    const result = await store.getState().createAgentProfile({
      name: 'Ops Agent',
      title: 'Operator',
      systemPrompt: 'Do the work.',
      defaultRuntime: 'gemini'
    });

    expect(result).toEqual(profile);
    expect(store.getState().agentProfiles).toEqual([profile]);
    expect(store.getState().error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes the dashboard shell state from the shared API slices', async () => {
    const store = await loadStore();
    const profile = makeAgentProfile();
    const session = makeSession();
    const run = makeRun();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      switch (path) {
        case '/api/sessions?limit=300':
          return jsonResponse({ ok: true, sessions: [session] });
        case '/api/bff/cards':
          return jsonResponse({ ok: true, cards: [{ label: 'Runs', value: '1' }] });
        case '/api/agents/profiles?includeDisabled=true':
          return jsonResponse({ ok: true, agents: [profile] });
        case '/api/runs?limit=250':
          return jsonResponse({ ok: true, runs: [run] });
        case '/api/bff/board':
          return jsonResponse({ ok: true, lanes: { queued: [], running: [run], waiting_input: [], failed: [], completed: [] } });
        case '/api/bff/chats?limit=100':
          return jsonResponse({ ok: true, chats: [{ session, messages: [] }] });
        case '/api/skills':
          return jsonResponse({ ok: true, skills: [] });
        case '/api/tools':
          return jsonResponse({ ok: true, tools: [], diagnostics: [] });
        case '/api/office/presence':
          return jsonResponse({ ok: true, layout: { schema: 'office', nodes: [], edges: [] }, presence: [] });
        case '/api/events?since=0&limit=400':
          return jsonResponse({
            ok: true,
            events: [
              { sequence: 1, kind: 'terminal.chunk', lane: 'default', level: 'info', message: 'hidden', ts: '2026-03-15T10:00:00.000Z', data: {} },
              { sequence: 2, kind: 'run.completed', lane: 'default', level: 'info', message: 'done', ts: '2026-03-15T10:00:01.000Z', data: {} }
            ]
          });
        case '/api/vault/status':
          return jsonResponse({ ok: true, status: 'unlocked', hasMasterKey: true, isLocked: false, configured: true });
        case '/api/vault/secrets?includeRevoked=true':
          return jsonResponse({ ok: true, secrets: [] });
        case '/api/auth/principal':
          return jsonResponse({ ok: true, principal: { role: 'admin', allowedRoles: ['admin', 'operator', 'viewer'] } });
        default:
          throw new Error(`Unexpected fetch path: ${path}`);
      }
    });
    vi.stubGlobal('fetch', fetchMock);

    store.getState().setToken('token-123');
    await store.getState().refreshAll();

    expect(store.getState().sessions).toEqual([session]);
    expect(store.getState().agentProfiles).toEqual([profile]);
    expect(store.getState().runs).toEqual([run]);
    expect(store.getState().events).toEqual([
      expect.objectContaining({
        sequence: 2,
        kind: 'run.completed'
      })
    ]);
    expect(store.getState().lastSequence).toBe(2);
    expect(store.getState().principalRole).toBe('admin');
    expect(store.getState().loading).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it('returns created session link codes through the shared token-action helper', async () => {
    const store = await loadStore();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('/api/sessions/session-1/link-code');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json'
        });
        return jsonResponse({
          ok: true,
          link: {
            code: 'ABC123',
            ttlSec: 600,
            expiresAt: '2026-03-15T10:10:00.000Z',
            command: '/link ABC123'
          }
        });
      })
    );

    store.getState().setToken('token-123');
    await expect(store.getState().createSessionLinkCode('session-1', 600)).resolves.toEqual({
      code: 'ABC123',
      ttlSec: 600,
      expiresAt: '2026-03-15T10:10:00.000Z',
      command: '/link ABC123'
    });
    expect(store.getState().error).toBeNull();
  });
});
