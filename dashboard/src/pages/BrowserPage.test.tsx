// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { apiMocks, installPageHarness, renderDashboardPage } from '../test/pageHarness';
import { BrowserPage } from './BrowserPage';

installPageHarness();

describe('BrowserPage', () => {
  it('renders Browser Ops against governed browser mocks', async () => {
    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    expect(await screen.findByText('Browser Operations')).toBeInTheDocument();
    expect(screen.getByText('Provider posture and session management')).toBeInTheDocument();
  });

  it('marks browser policy changes as dirty when a switch toggles', async () => {
    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    const approvalSwitch = await screen.findByRole('switch', { name: 'Global toggle' });

    fireEvent.click(approvalSwitch);

    await waitFor(() => expect(approvalSwitch).not.toBeChecked());
    expect(screen.getByRole('button', { name: /apply policy/i })).toBeEnabled();
  });

  it('opens governed capture controls from the captures tab', async () => {
    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    fireEvent.click(await screen.findByRole('button', { name: 'Captures' }));

    expect(await screen.findByText('Governed Capture')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'URL' })).toBeInTheDocument();
  });

  it('creates an agent-managed browser profile from the overview posture card', async () => {
    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    expect(await screen.findByText('Managed Profiles')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create managed profile' }));

    await waitFor(() => expect(apiMocks.ensureManagedBrowserProfile).toHaveBeenCalledWith('token-123'));
  });

  it('shows managed profile controls in the sessions tab', async () => {
    apiMocks.fetchAgentProfiles.mockResolvedValue([
      {
        id: 'ceo-default',
        name: 'Elyze CEO',
        title: 'Chief Executive Agent',
        parentAgentId: null,
        protectedDefault: true,
        systemPrompt: 'Lead operations.',
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
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z'
      }
    ]);

    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    fireEvent.click(await screen.findByRole('button', { name: 'Sessions' }));

    const createButton = await screen.findByRole('button', { name: 'Create managed' });
    fireEvent.click(createButton);

    await waitFor(() => expect(apiMocks.ensureManagedBrowserProfile).toHaveBeenCalledWith('token-123'));
  });

  it('saves the active Playwright login without asking for a storage-state file', async () => {
    const connectedProfile = {
      id: 'browser_session_profile:instagram-current',
      label: 'Instagram personal login',
      domains: ['www.instagram.com', 'instagram.com'],
      cookieJarId: null,
      headersProfileId: null,
      proxyProfileId: null,
      storageStateId: 'browser_storage_state:instagram-current',
      useRealChrome: false,
      profileClass: 'auth_state',
      isManaged: false,
      isIsolated: true,
      isolationSummary: 'Uses a saved authenticated cookie/storage-state copy.',
      ownerLabel: null,
      visibility: 'shared',
      allowedSessionIds: [],
      siteKey: 'instagram',
      browserKind: 'chrome',
      browserProfileName: null,
      browserProfilePath: null,
      cdpEndpoint: null,
      locale: null,
      countryCode: null,
      timezoneId: null,
      notes: null,
      enabled: true,
      lastVerifiedAt: '2026-05-31T10:00:00.000Z',
      lastVerificationStatus: 'connected',
      lastVerificationSummary: 'Verified Instagram login.',
      health: {
        state: 'healthy',
        summary: 'Verified Instagram login.',
        needsReconnect: false
      },
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-05-31T10:00:00.000Z'
    };
    const vault = {
      cookieJars: [],
      headerProfiles: [],
      proxyProfiles: [],
      storageStates: [],
      sessionProfiles: []
    };
    const connectedVault = {
      ...vault,
      sessionProfiles: [connectedProfile]
    };

    apiMocks.fetchBrowserSessionVault.mockResolvedValue(vault);
    apiMocks.saveCurrentPlaywrightAuthSession.mockResolvedValue({
      storageStatePath: '/tmp/browser-auth/current-instagram/storage-state.json',
      vault: connectedVault,
      storageState: {
        id: 'browser_storage_state:instagram-current',
        label: 'Instagram personal login storage state',
        domains: ['www.instagram.com', 'instagram.com'],
        originCount: 1,
        cookieCount: 1,
        notes: null,
        revokedAt: null,
        createdAt: '2026-05-31T10:00:00.000Z',
        updatedAt: '2026-05-31T10:00:00.000Z'
      },
      sessionProfile: connectedProfile,
      verification: {
        run: {
          id: 'run-browser-verify',
          sessionId: 'session-browser-verify',
          agentId: 'ceo-elyzelabs',
          runtime: 'process',
          prompt: 'Verify Instagram login',
          status: 'completed',
          output: 'Verified',
          error: null,
          startedAt: '2026-05-31T10:00:00.000Z',
          finishedAt: '2026-05-31T10:00:01.000Z',
          costUsd: 0,
          metadata: {}
        },
        trace: null,
        summary: 'Verified Instagram login.',
        method: 'playwright_storage_state',
        site: {
          siteKey: 'instagram',
          label: 'Instagram',
          domains: ['www.instagram.com', 'instagram.com'],
          verifyUrl: 'https://www.instagram.com/',
          extractorId: null,
          intent: 'dynamic_app',
          dynamicLikely: true,
          requiresStealth: true,
          mainContentOnly: false
        }
      }
    });

    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    fireEvent.click(await screen.findByRole('button', { name: 'Sessions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Instagram' }));
    fireEvent.change(await screen.findByLabelText('Live CDP Endpoint'), {
      target: { value: 'http://127.0.0.1:9339' }
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Save current login' }));

    await waitFor(() =>
      expect(apiMocks.saveCurrentPlaywrightAuthSession).toHaveBeenCalledWith(
        'token-123',
        expect.objectContaining({
          siteKey: 'instagram',
          browserKind: 'chrome',
          label: 'Instagram personal login',
          domains: ['www.instagram.com', 'instagram.com'],
          verifyUrl: 'https://www.instagram.com/',
          cdpEndpoint: 'http://127.0.0.1:9339'
        })
      )
    );
    expect(await screen.findByText('Saved Instagram personal login from the current Playwright session.')).toBeInTheDocument();
  });

  it('opens a local profile login window and connects an authenticated social session', async () => {
    const chromeProfile = {
      id: 'local-profile:chrome-default',
      browserKind: 'chrome',
      label: 'Personal Chrome',
      profileName: 'Default',
      profilePath: '/Users/test/Library/Application Support/Google/Chrome/Default',
      isDefault: true,
      importStrategy: 'cookie_import_and_real_chrome'
    };
    const connectedProfile = {
      id: 'browser_session_profile:instagram',
      label: 'Instagram personal login',
      domains: ['www.instagram.com', 'instagram.com'],
      cookieJarId: 'browser_cookie_jar:instagram',
      headersProfileId: null,
      proxyProfileId: null,
      storageStateId: null,
      useRealChrome: true,
      profileClass: 'local_profile',
      isManaged: false,
      isIsolated: false,
      isolationSummary: 'Uses imported cookies from Personal Chrome.',
      ownerLabel: null,
      visibility: 'shared',
      allowedSessionIds: [],
      siteKey: 'instagram',
      browserKind: 'chrome',
      browserProfileName: 'Default',
      browserProfilePath: chromeProfile.profilePath,
      cdpEndpoint: null,
      locale: null,
      countryCode: null,
      timezoneId: null,
      notes: null,
      enabled: true,
      lastVerifiedAt: '2026-05-31T10:00:00.000Z',
      lastVerificationStatus: 'connected',
      lastVerificationSummary: 'Verified Instagram login.',
      health: {
        state: 'healthy',
        summary: 'Verified Instagram login.',
        needsReconnect: false
      },
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-05-31T10:00:00.000Z'
    };
    const vault = {
      cookieJars: [],
      headerProfiles: [],
      proxyProfiles: [],
      storageStates: [],
      sessionProfiles: [],
      localProfiles: [chromeProfile]
    };
    const connectedVault = {
      ...vault,
      sessionProfiles: [connectedProfile]
    };

    apiMocks.fetchBrowserSessionVault.mockResolvedValue(vault);
    apiMocks.startBrowserLoginCapture.mockResolvedValue({
      launched: {
        browserKind: 'chrome',
        browserProfile: chromeProfile,
        site: {
          siteKey: 'instagram',
          label: 'Instagram',
          domains: ['www.instagram.com', 'instagram.com'],
          verifyUrl: 'https://www.instagram.com/'
        },
        command: 'Chrome profile Default',
        url: 'https://www.instagram.com/'
      },
      vault
    });
    apiMocks.connectBrowserAccount.mockResolvedValue({
      vault: connectedVault,
      sessionProfile: connectedProfile,
      verification: {
        run: {
          id: 'run-browser-verify',
          sessionId: 'session-browser-verify',
          agentId: 'ceo-elyzelabs',
          runtime: 'process',
          prompt: 'Verify Instagram login',
          status: 'completed',
          output: 'Verified',
          error: null,
          startedAt: '2026-05-31T10:00:00.000Z',
          finishedAt: '2026-05-31T10:00:01.000Z',
          costUsd: 0,
          metadata: {}
        },
        trace: null,
        summary: 'Verified Instagram login.',
        method: 'browser_profile_import',
        site: {
          siteKey: 'instagram',
          label: 'Instagram',
          domains: ['www.instagram.com', 'instagram.com'],
          verifyUrl: 'https://www.instagram.com/',
          extractorId: null,
          intent: 'dynamic_app',
          dynamicLikely: true,
          requiresStealth: true,
          mainContentOnly: false
        }
      }
    });

    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    fireEvent.click(await screen.findByRole('button', { name: 'Sessions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Instagram' }));
    const importMethodButton = (await screen.findAllByText('Import from browser'))[0]?.closest('button');
    if (!importMethodButton) {
      throw new Error('Import from browser method button was not rendered.');
    }
    fireEvent.click(importMethodButton);

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Local Profile' })).toHaveValue(chromeProfile.id));

    fireEvent.click(screen.getByRole('button', { name: 'Open login window' }));

    await waitFor(() =>
      expect(apiMocks.startBrowserLoginCapture).toHaveBeenCalledWith('token-123', {
        browserKind: 'chrome',
        browserProfileId: chromeProfile.id,
        siteKey: 'instagram',
        verifyUrl: 'https://www.instagram.com/'
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect & Verify' }));

    await waitFor(() =>
      expect(apiMocks.connectBrowserAccount).toHaveBeenCalledWith(
        'token-123',
        expect.objectContaining({
          label: 'Instagram personal login',
          siteKey: 'instagram',
          method: 'browser_profile_import',
          browserKind: 'chrome',
          browserProfileId: chromeProfile.id,
          domains: ['www.instagram.com', 'instagram.com'],
          verifyUrl: 'https://www.instagram.com/'
        })
      )
    );
    expect(await screen.findByText('Verified Instagram login.')).toBeInTheDocument();
  });

  it('connects a mobile handoff session through the cookie vault path', async () => {
    const connectedProfile = {
      id: 'browser_session_profile:tiktok-mobile',
      label: 'TikTok personal login',
      domains: ['www.tiktok.com', 'tiktok.com'],
      cookieJarId: 'browser_cookie_jar:tiktok-mobile',
      headersProfileId: null,
      proxyProfileId: null,
      storageStateId: null,
      useRealChrome: false,
      profileClass: 'auth_state',
      isManaged: false,
      isIsolated: true,
      isolationSummary: 'Uses a saved mobile cookie copy.',
      ownerLabel: null,
      visibility: 'shared',
      allowedSessionIds: [],
      siteKey: 'tiktok',
      browserKind: null,
      browserProfileName: null,
      browserProfilePath: null,
      cdpEndpoint: null,
      locale: null,
      countryCode: null,
      timezoneId: null,
      notes: null,
      enabled: true,
      lastVerifiedAt: '2026-05-31T10:00:00.000Z',
      lastVerificationStatus: 'connected',
      lastVerificationSummary: 'Verified TikTok login.',
      health: {
        state: 'healthy',
        summary: 'Verified TikTok login.',
        needsReconnect: false
      },
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-05-31T10:00:00.000Z'
    };
    const vault = {
      cookieJars: [],
      headerProfiles: [],
      proxyProfiles: [],
      storageStates: [],
      sessionProfiles: [],
      localProfiles: []
    };
    apiMocks.fetchBrowserSessionVault.mockResolvedValue(vault);
    apiMocks.connectBrowserAccount.mockResolvedValue({
      vault: {
        ...vault,
        sessionProfiles: [connectedProfile]
      },
      sessionProfile: connectedProfile,
      cookieJar: null,
      storageState: null,
      verification: {
        run: {
          id: 'run-browser-verify',
          sessionId: 'session-browser-verify',
          agentId: 'ceo-elyzelabs',
          runtime: 'process',
          prompt: 'Verify TikTok login',
          status: 'completed',
          output: 'Verified',
          error: null,
          startedAt: '2026-05-31T10:00:00.000Z',
          finishedAt: '2026-05-31T10:00:01.000Z',
          costUsd: 0,
          metadata: {}
        },
        trace: null,
        summary: 'Verified TikTok login.',
        method: 'mobile_session_import',
        site: {
          siteKey: 'tiktok',
          label: 'TikTok',
          domains: ['www.tiktok.com', 'tiktok.com'],
          verifyUrl: 'https://www.tiktok.com/foryou',
          extractorId: 'tiktok_profile',
          intent: 'structured_extract',
          dynamicLikely: true,
          requiresStealth: true,
          mainContentOnly: false
        }
      }
    });

    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    fireEvent.click(await screen.findByRole('button', { name: 'Sessions' }));
    fireEvent.click(await screen.findByRole('button', { name: /Mobile handoff/ }));
    fireEvent.change(await screen.findByLabelText('Cookie Payload'), {
      target: { value: 'sid=tiktok-mobile' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect & Verify' }));

    await waitFor(() =>
      expect(apiMocks.connectBrowserAccount).toHaveBeenCalledWith(
        'token-123',
        expect.objectContaining({
          method: 'mobile_session_import',
          sourceKind: 'raw_cookie_header',
          raw: 'sid=tiktok-mobile'
        })
      )
    );
  });

  it('creates a one-time phone handoff link for mobile session import', async () => {
    const vault = {
      cookieJars: [],
      headerProfiles: [],
      proxyProfiles: [],
      storageStates: [],
      sessionProfiles: [],
      localProfiles: []
    };
    const mobileSessionProfile = {
      id: 'browser_session_profile:tiktok-mobile',
      label: 'TikTok personal login',
      domains: ['www.tiktok.com', 'tiktok.com'],
      cookieJarId: 'browser_cookie_jar:tiktok-mobile',
      headersProfileId: null,
      proxyProfileId: null,
      storageStateId: null,
      useRealChrome: false,
      profileClass: 'auth_state',
      isManaged: false,
      isIsolated: false,
      isolationSummary: 'Uses a saved mobile cookie copy.',
      ownerLabel: null,
      visibility: 'shared',
      allowedSessionIds: [],
      siteKey: 'tiktok',
      browserKind: null,
      browserProfileName: null,
      browserProfilePath: null,
      cdpEndpoint: null,
      locale: null,
      countryCode: null,
      timezoneId: null,
      notes: null,
      enabled: true,
      lastVerifiedAt: '2026-05-31T10:01:00.000Z',
      lastVerificationStatus: 'connected',
      lastVerificationSummary: 'Verified TikTok mobile login.',
      health: {
        state: 'healthy',
        summary: 'Verified TikTok mobile login.',
        needsReconnect: false
      },
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-05-31T10:01:00.000Z'
    };
    apiMocks.fetchBrowserSessionVault.mockResolvedValue(vault);
    apiMocks.startBrowserMobileHandoff.mockResolvedValue({
      vault,
      handoff: {
        id: 'mobile_handoff:tiktok',
        siteKey: 'tiktok',
        label: 'TikTok personal login',
        domains: ['www.tiktok.com', 'tiktok.com'],
        verifyUrl: 'https://www.tiktok.com/foryou',
        sourceKind: 'raw_cookie_header',
        status: 'pending',
        expiresAt: '2026-05-31T10:15:00.000Z',
        submittedAt: null,
        createdAt: '2026-05-31T10:00:00.000Z'
      },
      submitUrl: 'http://127.0.0.1:8788/mobile-browser-handoff/mobile_handoff%3Atiktok',
      nextStep: 'Open the one-time handoff URL on the phone, choose the cookie export format, paste the payload, submit once, then check status here.'
    });
    apiMocks.fetchBrowserMobileHandoffStatus.mockResolvedValue({
      vault: {
        ...vault,
        sessionProfiles: [mobileSessionProfile]
      },
      handoff: {
        id: 'mobile_handoff:tiktok',
        siteKey: 'tiktok',
        label: 'TikTok personal login',
        domains: ['www.tiktok.com', 'tiktok.com'],
        verifyUrl: 'https://www.tiktok.com/foryou',
        sourceKind: 'raw_cookie_header',
        status: 'submitted',
        expiresAt: '2026-05-31T10:15:00.000Z',
        submittedAt: '2026-05-31T10:01:00.000Z',
        createdAt: '2026-05-31T10:00:00.000Z',
        completedCookieJarId: 'browser_cookie_jar:tiktok-mobile',
        completedSessionProfileId: 'browser_session_profile:tiktok-mobile',
        completedVerificationSummary: 'Verified TikTok mobile login.'
      },
      cookieJar: null,
      sessionProfile: mobileSessionProfile,
      verification: {
        summary: 'Verified TikTok mobile login.',
        method: 'mobile_session_import',
        site: {
          siteKey: 'tiktok',
          label: 'TikTok',
          domains: ['www.tiktok.com', 'tiktok.com'],
          verifyUrl: 'https://www.tiktok.com/foryou',
          extractorId: 'tiktok_profile',
          intent: 'structured_extract',
          dynamicLikely: true,
          requiresStealth: true,
          mainContentOnly: false
        }
      }
    });

    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    fireEvent.click(await screen.findByRole('button', { name: 'Sessions' }));
    fireEvent.click(await screen.findByRole('button', { name: /Mobile handoff/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create phone link' }));

    await waitFor(() =>
      expect(apiMocks.startBrowserMobileHandoff).toHaveBeenCalledWith(
        'token-123',
        expect.objectContaining({
          siteKey: 'tiktok',
          label: 'TikTok personal login',
          sourceKind: 'raw_cookie_header',
          domains: ['www.tiktok.com', 'tiktok.com']
        })
      )
    );
    expect(await screen.findByDisplayValue('http://127.0.0.1:8788/mobile-browser-handoff/mobile_handoff%3Atiktok')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Check submission' }));

    await waitFor(() =>
      expect(apiMocks.fetchBrowserMobileHandoffStatus).toHaveBeenCalledWith('token-123', 'mobile_handoff:tiktok')
    );
    expect((await screen.findAllByText('Verified TikTok mobile login.')).length).toBeGreaterThan(0);
  });

  it('starts a live browser session and sends operator actions from the Live tab', async () => {
    renderDashboardPage(<BrowserPage />, { path: '/browser' });

    fireEvent.click(await screen.findByRole('button', { name: 'Live' }));
    fireEvent.change(await screen.findByLabelText('Live URL'), {
      target: { value: 'https://example.com/app' }
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Start Live Browser' }));

    await waitFor(() =>
      expect(apiMocks.startBrowserInteractiveSession).toHaveBeenCalledWith(
        'token-123',
        expect.objectContaining({
          agentId: 'agent-1',
          url: 'https://example.com/app',
          previewChars: 1000
        })
      )
    );
    expect(await screen.findByText('live-session-1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Live action'), {
      target: { value: 'click' }
    });
    fireEvent.change(screen.getByLabelText('Selector'), {
      target: { value: '#continue' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run Live Action' }));

    await waitFor(() =>
      expect(apiMocks.runBrowserInteractiveSessionActions).toHaveBeenCalledWith(
        'token-123',
        'live-session-1',
        expect.objectContaining({
          actions: [
            expect.objectContaining({
              type: 'click',
              selector: '#continue',
              timeoutMs: 500
            })
          ],
          previewChars: 1000
        })
      )
    );
    expect(await screen.findByText('Clicked #continue')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Live action'), {
      target: { value: 'reload' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run Live Action' }));

    await waitFor(() =>
      expect(apiMocks.runBrowserInteractiveSessionActions).toHaveBeenLastCalledWith(
        'token-123',
        'live-session-1',
        expect.objectContaining({
          actions: [
            expect.objectContaining({
              type: 'reload',
              timeoutMs: 500
            })
          ],
          previewChars: 1000
        })
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Live Browser' }));

    await waitFor(() => expect(apiMocks.closeBrowserInteractiveSession).toHaveBeenCalledWith('token-123', 'live-session-1'));
  });
});
