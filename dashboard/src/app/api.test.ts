import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiClientError } from './api';
import {
  closeBrowserInteractiveSession,
  createRun,
  downloadBrowserArtifact,
  fetchBrowserSessionVault,
  fetchSessions,
  runBrowserInteractiveSessionActions,
  startBrowserInteractiveSession
} from './api';

describe('dashboard api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes session scope and auth headers when fetching the browser session vault', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/browser/session-vault?sessionId=session-42');
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer token-123'
      });
      return new Response(
        JSON.stringify({
          ok: true,
          cookieJars: [],
          headerProfiles: [],
          proxyProfiles: [],
          storageStates: [],
          sessionProfiles: [],
          localProfiles: []
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const vault = await fetchBrowserSessionVault('token-123', {
      sessionId: 'session-42'
    });

    expect(vault.sessionProfiles).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('downloads browser artifacts through the shared API error path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('/api/browser/artifacts/artifact-7?download=1');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer token-123'
        });
        return new Response('artifact-body', {
          status: 200,
          headers: {
            'content-type': 'text/plain',
            'content-disposition': 'attachment; filename="artifact.txt"'
          }
        });
      })
    );

    const result = await downloadBrowserArtifact('artifact-7', 'token-123');

    expect(result.fileName).toBe('artifact.txt');
    expect(result.mimeType).toBe('text/plain');
    await expect(result.blob.text()).resolves.toBe('artifact-body');
  });

  it('throws a structured ApiClientError for failed downloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('denied by gateway', {
          status: 403,
          headers: {
            'content-type': 'text/plain'
          }
        })
      )
    );

    await expect(downloadBrowserArtifact('artifact-9', 'token-123')).rejects.toMatchObject<ApiClientError>({
      name: 'ApiClientError',
      path: '/api/browser/artifacts/artifact-9?download=1',
      status: 403,
      detail: 'denied by gateway'
    });
  });

  it('unwraps session payloads through the shared envelope helper', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('/api/sessions?limit=300');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer token-123'
        });
        return new Response(
          JSON.stringify({
            ok: true,
            sessions: [
              {
                id: 'session-1',
                sessionKey: 'telegram:123',
                channel: 'telegram',
                chatType: 'private',
                agentId: 'agent-1',
                preferredRuntime: 'gemini',
                preferredModel: 'gemini-2.5-pro',
                state: 'active',
                lastActivityAt: '2026-03-15T12:00:00.000Z'
              }
            ]
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      })
    );

    await expect(fetchSessions('token-123')).resolves.toMatchObject([
      {
        id: 'session-1',
        channel: 'telegram'
      }
    ]);
  });

  it('sends run creation requests with the expected transport contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('/api/sessions/session-9/runs');
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json'
        });
        expect(init?.headers).toHaveProperty('Idempotency-Key');
        if (typeof init?.body !== 'string') {
          throw new Error('expected a serialized request body');
        }
        expect(JSON.parse(init.body)).toMatchObject({
          prompt: 'ship it',
          runtime: 'gemini',
          model: 'gemini-2.5-pro',
          source: 'dashboard'
        });
        return new Response(
          JSON.stringify({
            ok: true,
            run: {
              id: 'run-9',
              sessionId: 'session-9',
              status: 'queued',
              runtime: 'gemini',
              prompt: 'ship it',
              resultSummary: null,
              error: null,
              startedAt: null,
              endedAt: null,
              createdAt: '2026-03-15T12:00:00.000Z',
              updatedAt: '2026-03-15T12:00:00.000Z'
            }
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      })
    );

    await expect(
      createRun('token-123', 'session-9', 'ship it', {
        runtime: 'gemini',
        model: 'gemini-2.5-pro'
      })
    ).resolves.toMatchObject({
      id: 'run-9',
      status: 'queued'
    });
  });

  it('sends live browser session requests through the interactive API contract', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer token-123'
      });

      if (path === '/api/browser/interactive/sessions') {
        expect(init?.method).toBe('POST');
        if (typeof init?.body !== 'string') {
          throw new Error('expected a serialized live session request body');
        }
        expect(JSON.parse(init.body)).toMatchObject({
          agentId: 'agent-1',
          url: 'https://example.com/app',
          sessionProfileId: 'profile-1',
          previewChars: 1000
        });
        return new Response(
          JSON.stringify({
            ok: true,
            run: {
              id: 'run-live-start',
              sessionId: 'session-live',
              status: 'completed',
              runtime: 'process',
              prompt: 'Start live browser',
              resultSummary: 'started',
              error: null,
              startedAt: '2026-05-31T10:00:00.000Z',
              endedAt: '2026-05-31T10:00:01.000Z',
              createdAt: '2026-05-31T10:00:00.000Z',
              updatedAt: '2026-05-31T10:00:01.000Z'
            },
            liveSession: {
              schema: 'ops.browser-interactive-session.v1',
              provider: 'test',
              sessionId: 'live-session-1',
              startedUrl: 'https://example.com/app',
              currentUrl: 'https://example.com/app',
              startedAt: '2026-05-31T10:00:00.000Z',
              lastActivityAt: '2026-05-31T10:00:00.000Z',
              expiresAt: null
            },
            control: {
              schema: 'ops.browser-interactive-run.v1',
              provider: 'test',
              ok: true,
              startedUrl: 'https://example.com/app',
              finalUrl: 'https://example.com/app',
              actions: [],
              artifacts: [],
              error: null
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (path === '/api/browser/interactive/sessions/live-session-1/actions') {
        expect(init?.method).toBe('POST');
        if (typeof init?.body !== 'string') {
          throw new Error('expected a serialized live action request body');
        }
        expect(JSON.parse(init.body)).toMatchObject({
          actions: [
            {
              type: 'click',
              selector: '#continue'
            }
          ],
          previewChars: 1000
        });
        return new Response(
          JSON.stringify({
            ok: true,
            run: {
              id: 'run-live-action',
              sessionId: 'session-live',
              status: 'completed',
              runtime: 'process',
              prompt: 'Live browser action',
              resultSummary: 'clicked',
              error: null,
              startedAt: '2026-05-31T10:00:02.000Z',
              endedAt: '2026-05-31T10:00:03.000Z',
              createdAt: '2026-05-31T10:00:02.000Z',
              updatedAt: '2026-05-31T10:00:03.000Z'
            },
            liveSession: {
              schema: 'ops.browser-interactive-session.v1',
              provider: 'test',
              sessionId: 'live-session-1',
              startedUrl: 'https://example.com/app',
              currentUrl: 'https://example.com/app#clicked',
              startedAt: '2026-05-31T10:00:00.000Z',
              lastActivityAt: '2026-05-31T10:00:03.000Z',
              expiresAt: null
            },
            control: {
              schema: 'ops.browser-interactive-run.v1',
              provider: 'test',
              ok: true,
              startedUrl: 'https://example.com/app',
              finalUrl: 'https://example.com/app#clicked',
              actions: [
                {
                  index: 0,
                  type: 'click',
                  ok: true,
                  summary: 'Clicked #continue',
                  selector: '#continue',
                  url: null,
                  textPreview: null,
                  error: null
                }
              ],
              artifacts: [],
              error: null
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (path === '/api/browser/interactive/sessions/live-session-1') {
        expect(init?.method).toBe('DELETE');
        return new Response(
          JSON.stringify({
            ok: true,
            run: {
              id: 'run-live-close',
              sessionId: 'session-live',
              status: 'completed',
              runtime: 'process',
              prompt: 'Close live browser',
              resultSummary: 'closed',
              error: null,
              startedAt: '2026-05-31T10:00:04.000Z',
              endedAt: '2026-05-31T10:00:05.000Z',
              createdAt: '2026-05-31T10:00:04.000Z',
              updatedAt: '2026-05-31T10:00:05.000Z'
            },
            closed: {
              schema: 'ops.browser-interactive-session-close.v1',
              provider: 'test',
              sessionId: 'live-session-1',
              closed: true,
              finalUrl: 'https://example.com/app#clicked',
              error: null
            }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      throw new Error(`unexpected path: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      startBrowserInteractiveSession('token-123', {
        agentId: 'agent-1',
        url: 'https://example.com/app',
        sessionProfileId: 'profile-1',
        previewChars: 1000
      })
    ).resolves.toMatchObject({
      liveSession: {
        sessionId: 'live-session-1'
      }
    });

    await expect(
      runBrowserInteractiveSessionActions('token-123', 'live-session-1', {
        actions: [{ type: 'click', selector: '#continue' }],
        previewChars: 1000
      })
    ).resolves.toMatchObject({
      control: {
        ok: true
      }
    });

    await expect(closeBrowserInteractiveSession('token-123', 'live-session-1')).resolves.toMatchObject({
      closed: {
        closed: true
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
