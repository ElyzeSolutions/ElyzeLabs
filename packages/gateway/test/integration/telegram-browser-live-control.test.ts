import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BrowserInteractiveProvider } from '../../src/browser-interactive-service.js';
import { createGatewayTestHarness, type GatewayTestHarness } from './test-harness.js';

function telegramPayload(input: { updateId: number; senderId: number; text: string }) {
  return {
    update_id: input.updateId,
    message: {
      text: input.text,
      chat: { id: input.senderId, type: 'private' },
      from: { id: input.senderId, username: `browser${input.senderId}` },
      mentioned: true
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

describe('telegram live browser control', () => {
  const harnesses: GatewayTestHarness[] = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      const harness = harnesses.pop();
      if (harness) {
        await harness.close();
      }
    }
  });

  it('starts, drives rich actions, and closes a live browser session from Telegram commands', async () => {
    const provider: BrowserInteractiveProvider = {
      run: vi.fn(async (input) => ({
        schema: 'ops.browser-interactive-run.v1',
        provider: 'test',
        ok: true,
        startedUrl: input.url,
        finalUrl: input.url,
        actions: [],
        artifacts: [],
        error: null
      })),
      startSession: vi.fn(async (input) => ({
        schema: 'ops.browser-interactive-session-start.v1',
        session: {
          schema: 'ops.browser-interactive-session.v1',
          provider: 'test',
          sessionId: 'live-telegram-1',
          startedUrl: input.url,
          currentUrl: input.url,
          startedAt: '2026-06-01T00:00:00.000Z',
          lastActivityAt: '2026-06-01T00:00:00.000Z',
          expiresAt: null
        },
        control: {
          schema: 'ops.browser-interactive-run.v1',
          provider: 'test',
          ok: true,
          startedUrl: input.url,
          finalUrl: input.url,
          actions: [
            {
              index: 0,
              type: 'open',
              ok: true,
              summary: `Opened ${input.url}`,
              selector: null,
              url: input.url,
              textPreview: null,
              error: null
            }
          ],
          artifacts: [],
          error: null
        }
      })),
      runSessionActions: vi.fn(async (input) => {
        const artifacts = [];
        if (input.actions.some((action) => action.type === 'snapshot')) {
          artifacts.push({
            id: 'interactive_artifact:0:snapshot',
            actionIndex: 0,
            kind: 'snapshot',
            mimeType: 'text/plain',
            sizeBytes: 86,
            contentPreview: 'targets:\n- 1. button "Continue" selector=button:has-text("Continue") box=1,2,3,4',
            contentBase64: null
          });
        }
        if (input.actions.some((action) => action.type === 'read')) {
          artifacts.push({
            id: 'interactive_artifact:0:read',
            actionIndex: 0,
            kind: 'read',
            mimeType: 'text/plain',
            sizeBytes: 18,
            contentPreview: 'Instagram page text',
            contentBase64: null
          });
        }
        if (input.actions.some((action) => action.type === 'screenshot')) {
          artifacts.push({
            id: 'interactive_artifact:0:screenshot',
            actionIndex: 0,
            kind: 'screenshot',
            mimeType: 'image/png',
            sizeBytes: 3,
            contentPreview: '[png screenshot]',
            contentBase64: 'cG5n'
          });
        }
        if (input.actions.some((action) => action.type === 'download')) {
          artifacts.push({
            id: 'interactive_artifact:0:download',
            actionIndex: 0,
            kind: 'download',
            mimeType: 'text/plain',
            sizeBytes: 16,
            contentPreview: 'download fixture',
            contentBase64: null
          });
        }
        return {
          schema: 'ops.browser-interactive-session-action.v1',
          session: {
            schema: 'ops.browser-interactive-session.v1',
            provider: 'test',
            sessionId: input.sessionId,
            startedUrl: 'https://www.instagram.com/',
            currentUrl: 'https://www.instagram.com/#live',
            startedAt: '2026-06-01T00:00:00.000Z',
            lastActivityAt: '2026-06-01T00:00:01.000Z',
            expiresAt: null
          },
          control: {
            schema: 'ops.browser-interactive-run.v1',
            provider: 'test',
            ok: true,
            startedUrl: 'https://www.instagram.com/',
            finalUrl: 'https://www.instagram.com/#live',
            actions: input.actions.map((action, index) => ({
              index,
              type: action.type,
              ok: true,
              summary: `${action.type} completed`,
              selector: action.selector ?? null,
              url: action.url ?? null,
              textPreview: action.type === 'snapshot' ? 'targets captured' : null,
              error: null
            })),
            artifacts,
            error: null
          }
        };
      }),
      closeSession: vi.fn(async (sessionId) => ({
        schema: 'ops.browser-interactive-session-close.v1',
        provider: 'test',
        sessionId,
        closed: true,
        finalUrl: 'https://www.instagram.com/#live',
        error: null
      }))
    };

    const harness = await createGatewayTestHarness(
      'telegram-browser-live-control',
      (config) => {
        config.browser.enabled = true;
        config.browser.allowedAgents = ['ceo-default'];
      },
      {
        buildOptions: {
          interactiveBrowserProvider: provider
        }
      }
    );
    harnesses.push(harness);

    const onboardingResponse = await harness.inject({
      method: 'POST',
      url: '/api/onboarding/ceo-baseline',
      headers: {
        Authorization: `Bearer ${harness.config.server.apiToken}`,
        'x-ops-role': 'operator'
      },
      payload: {
        actor: 'telegram-live-browser-test'
      }
    });
    expect(onboardingResponse.statusCode).toBe(200);

    const senderId = 77101;
    const liveResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771010,
        senderId,
        text: '/browser live instagram'
      })
    });
    expect(liveResponse.statusCode).toBe(200);
    const liveBody = liveResponse.json();
    expect(isRecord(liveBody) ? liveBody.status : null).toBe('command_applied');
    expect(isRecord(liveBody) ? liveBody.liveSessionId : null).toBe('live-telegram-1');
    expect(provider.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://www.instagram.com/'
      })
    );

    const observeResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771011,
        senderId,
        text: '/browser observe'
      })
    });
    expect(observeResponse.statusCode).toBe(200);
    expect(isRecord(observeResponse.json()) ? observeResponse.json().artifactCount : null).toBe(1);

    const clickResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771012,
        senderId,
        text: '/browser click button:has-text("Continue")'
      })
    });
    expect(clickResponse.statusCode).toBe(200);

    const typeResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771013,
        senderId,
        text: '/browser type aria=Search | latest followers'
      })
    });
    expect(typeResponse.statusCode).toBe(200);

    const readResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771014,
        senderId,
        text: '/browser read'
      })
    });
    expect(readResponse.statusCode).toBe(200);
    expect(isRecord(readResponse.json()) ? readResponse.json().artifactCount : null).toBe(1);

    const openResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771015,
        senderId,
        text: '/browser open https://www.instagram.com/direct/inbox/'
      })
    });
    expect(openResponse.statusCode).toBe(200);

    const scrollResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771016,
        senderId,
        text: '/browser scroll #feed | 900'
      })
    });
    expect(scrollResponse.statusCode).toBe(200);

    const keyResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771017,
        senderId,
        text: '/browser key aria=Search | Enter'
      })
    });
    expect(keyResponse.statusCode).toBe(200);

    const screenshotResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771018,
        senderId,
        text: '/browser screenshot'
      })
    });
    expect(screenshotResponse.statusCode).toBe(200);
    expect(isRecord(screenshotResponse.json()) ? screenshotResponse.json().artifactCount : null).toBe(1);

    const downloadResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771019,
        senderId,
        text: '/browser download https://example.test/export.csv'
      })
    });
    expect(downloadResponse.statusCode).toBe(200);

    const uploadResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771020,
        senderId,
        text: '/browser upload #avatar | /tmp/live-avatar.png'
      })
    });
    expect(uploadResponse.statusCode).toBe(200);

    const waitResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771021,
        senderId,
        text: '/browser wait 750'
      })
    });
    expect(waitResponse.statusCode).toBe(200);

    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'snapshot'
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'click',
            selector: 'button:has-text("Continue")'
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'type',
            selector: 'aria=Search',
            text: 'latest followers'
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'read'
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'open',
            url: 'https://www.instagram.com/direct/inbox/'
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'scroll',
            selector: '#feed',
            deltaY: 900
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'keypress',
            selector: 'aria=Search',
            key: 'Enter'
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'screenshot'
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'download',
            url: 'https://example.test/export.csv'
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'upload',
            selector: '#avatar',
            filePaths: ['/tmp/live-avatar.png']
          })
        ]
      })
    );
    expect(provider.runSessionActions).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'live-telegram-1',
        actions: [
          expect.objectContaining({
            type: 'wait',
            timeoutMs: 750
          })
        ]
      })
    );

    const closeResponse = await harness.inject({
      method: 'POST',
      url: '/api/ingress/telegram',
      payload: telegramPayload({
        updateId: 771022,
        senderId,
        text: '/browser live close'
      })
    });
    expect(closeResponse.statusCode).toBe(200);
    expect(provider.closeSession).toHaveBeenCalledWith('live-telegram-1');
  });
});
