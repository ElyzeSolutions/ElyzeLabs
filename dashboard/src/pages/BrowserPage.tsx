import {
  ArrowsClockwise,
  Browsers,
  FacebookLogo,
  GlobeHemisphereWest,
  InstagramLogo,
  PinterestLogo,
  RedditLogo,
  TiktokLogo,
  XLogo
} from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearch } from '@tanstack/react-router';

import {
  ApiClientError,
  connectBrowserAccount,
  downloadBrowserArtifact,
  deleteBrowserSessionProfile,
  disableBrowserSessionProfile,
  enableBrowserSessionProfile,
  importBrowserCookieJar,
  revokeBrowserSessionProfile,
  revokeBrowserCookieJar,
  revokeBrowserHeaderProfile,
  revokeBrowserProxyProfile,
  revokeBrowserStorageState,
  resetAgentProfileBaseline,
  runBrowserTest,
  saveBrowserConfig,
  startBrowserLoginCapture,
  upsertBrowserHeaderProfile,
  upsertBrowserProxyProfile,
  upsertBrowserStorageState,
  upsertBrowserSessionProfile,
  verifyBrowserSessionProfile
} from '../app/api';
import {
  agentProfilesQueryOptions,
  browserArtifactQueryOptions,
  browserDoctorQueryOptions,
  browserHistoryQueryOptions,
  browserRunQueryOptions,
  browserSessionVaultQueryOptions,
  browserStatusQueryOptions,
  invalidateBoardReadQueries,
  invalidateBrowserReadQueries,
  sessionsQueryOptions
} from '../app/queryOptions';
import { useAppStore } from '../app/store';
import type {
  AgentProfileRow,
  BrowserArtifactContentRow,
  BrowserCapabilityConfigRow,
  BrowserCapabilityStatusRow,
  BrowserCapabilityValidationRow,
  BrowserConnectMethod,
  BrowserConnectSiteKey,
  BrowserConnectVerificationRow,
  BrowserCookieSourceKind,
  BrowserExtractionMode,
  BrowserLocalProfileKind,
  BrowserHistoryState,
  BrowserProviderCapabilityContractRow,
  BrowserRunTraceRow,
  BrowserSessionProfileSummaryRow,
  BrowserSessionProfileVisibility,
  BrowserSessionVaultState,
  BrowserTransportMode,
  BrowserTestRequestRow,
  CardMetric
} from '../app/types';
import { useRouteHeaderMetrics } from '../components/shell/RouteHeaderContext';
import { clampCount, formatRelativeTime } from '../lib/format';
import { toKeyedNonEmptyStrings } from '../lib/listKeys';

const BROWSER_TOOL_NAME = 'browser:scrapling';
const PANEL_CLASS = 'shell-panel rounded-[2rem] border border-white/10';
const PANEL_SOFT_CLASS = 'shell-panel-soft rounded-[1.5rem] border border-white/8';
const STATUS_TONE_CLASS: Record<BrowserCapabilityStatusRow['healthState'], string> = {
  ready: 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100',
  degraded: 'border-amber-400/30 bg-amber-400/12 text-amber-100',
  disabled: 'border-white/10 bg-white/6 text-[var(--shell-text)]',
  misconfigured: 'border-amber-400/30 bg-amber-400/12 text-amber-100',
  missing_dependency: 'border-rose-400/30 bg-rose-400/12 text-rose-100'
};

const EXTRACTION_OPTIONS: BrowserExtractionMode[] = ['markdown', 'html', 'text'];
const TRANSPORT_OPTIONS: BrowserTransportMode[] = ['stdio', 'http'];
const CONNECT_METHOD_OPTIONS: Array<{
  id: BrowserConnectMethod;
  label: string;
  detail: string;
}> = [
  {
    id: 'browser_profile_import',
    label: 'Import from browser',
    detail: 'Best full-fidelity path. Elyze reads cookies from a local Chrome or Firefox profile and saves a reusable session.'
  },
  {
    id: 'real_chrome',
    label: 'Use current Chrome login',
    detail: 'Easiest path. Stay logged into the site in Chrome on this machine, then Elyze reuses that browser session.'
  },
  {
    id: 'cookie_import',
    label: 'Paste cookies',
    detail: 'Fallback for other browsers, exported cookies.txt files, or service accounts.'
  }
];
const CONNECT_SITE_OPTIONS: Array<{
  siteKey: BrowserConnectSiteKey;
  label: string;
  hint: string;
  recommendedMethod: BrowserConnectMethod;
  defaultProfileLabel: string;
  defaultVerifyUrl: string;
  defaultDomains: string;
  icon: typeof GlobeHemisphereWest;
  accentClass: string;
}> = [
  {
    siteKey: 'tiktok',
    label: 'TikTok',
    hint: 'Profiles, likes, videos, and authenticated views.',
    recommendedMethod: 'browser_profile_import',
    defaultProfileLabel: 'TikTok personal login',
    defaultVerifyUrl: 'https://www.tiktok.com/foryou',
    defaultDomains: 'www.tiktok.com\ntiktok.com',
    icon: TiktokLogo,
    accentClass: 'border-rose-400/30 bg-rose-400/12 text-rose-100'
  },
  {
    siteKey: 'instagram',
    label: 'Instagram',
    hint: 'Profiles, reels, saved views, and guarded pages.',
    recommendedMethod: 'browser_profile_import',
    defaultProfileLabel: 'Instagram personal login',
    defaultVerifyUrl: 'https://www.instagram.com/',
    defaultDomains: 'www.instagram.com\ninstagram.com',
    icon: InstagramLogo,
    accentClass: 'border-amber-400/30 bg-amber-400/12 text-amber-100'
  },
  {
    siteKey: 'reddit',
    label: 'Reddit',
    hint: 'Logged-in feeds, saved posts, and private communities.',
    recommendedMethod: 'browser_profile_import',
    defaultProfileLabel: 'Reddit personal login',
    defaultVerifyUrl: 'https://www.reddit.com/',
    defaultDomains: 'www.reddit.com\nreddit.com',
    icon: RedditLogo,
    accentClass: 'border-orange-400/30 bg-orange-400/12 text-orange-100'
  },
  {
    siteKey: 'x',
    label: 'X',
    hint: 'Home feed, searches, and account-specific browsing.',
    recommendedMethod: 'browser_profile_import',
    defaultProfileLabel: 'X personal login',
    defaultVerifyUrl: 'https://x.com/home',
    defaultDomains: 'x.com\nwww.x.com\ntwitter.com\nwww.twitter.com',
    icon: XLogo,
    accentClass: 'border-sky-400/30 bg-sky-400/12 text-sky-100'
  },
  {
    siteKey: 'pinterest',
    label: 'Pinterest',
    hint: 'Boards, private pins, and account-scoped discovery.',
    recommendedMethod: 'browser_profile_import',
    defaultProfileLabel: 'Pinterest personal login',
    defaultVerifyUrl: 'https://www.pinterest.com/',
    defaultDomains: 'www.pinterest.com\npinterest.com',
    icon: PinterestLogo,
    accentClass: 'border-red-400/30 bg-red-400/12 text-red-100'
  },
  {
    siteKey: 'facebook',
    label: 'Facebook',
    hint: 'Feeds, pages, and logged-in web views.',
    recommendedMethod: 'browser_profile_import',
    defaultProfileLabel: 'Facebook personal login',
    defaultVerifyUrl: 'https://www.facebook.com/',
    defaultDomains: 'www.facebook.com\nfacebook.com\nm.facebook.com',
    icon: FacebookLogo,
    accentClass: 'border-blue-400/30 bg-blue-400/12 text-blue-100'
  },
  {
    siteKey: 'generic',
    label: 'Other website',
    hint: 'Use a custom domain and verify URL for anything else.',
    recommendedMethod: 'cookie_import',
    defaultProfileLabel: 'Website login',
    defaultVerifyUrl: 'https://example.com/',
    defaultDomains: 'example.com',
    icon: GlobeHemisphereWest,
    accentClass: 'border-white/12 bg-white/[0.04] text-[var(--shell-text)]'
  }
];
type BrowserOpsState = {
  status: BrowserCapabilityStatusRow | null;
  config: BrowserCapabilityConfigRow | null;
  configDraft: BrowserCapabilityConfigRow | null;
  validation: BrowserCapabilityValidationRow | null;
  contract: BrowserProviderCapabilityContractRow | null;
  vault: BrowserSessionVaultState | null;
  history: BrowserHistoryState | null;
  selectedRun: BrowserRunTraceRow | null;
  selectedArtifact: BrowserArtifactContentRow | null;
  loading: boolean;
  refreshing: boolean;
  testRunning: boolean;
  configSaving: boolean;
  assignmentBusy: string | null;
  downloadBusy: string | null;
  vaultBusy: string | null;
  error: string | null;
  notice: string | null;
  selectedRunId: string | null;
  selectedArtifactHandle: string | null;
  showAdvanced: boolean;
};

type BrowserFormState = {
  form: {
    agentId: string;
    url: string;
    selector: string;
    extractionMode: BrowserExtractionMode;
    dynamicLikely: boolean;
    requiresStealth: boolean;
    requiresProxy: boolean;
    requiresVisibleBrowser: boolean;
    requiresDownload: boolean;
    mainContentOnly: boolean;
    sessionProfileId: string;
    suspiciousPromptInjection: boolean;
    previewChars: string;
  };
  cookieImportForm: {
    label: string;
    domains: string;
    sourceKind: BrowserCookieSourceKind;
    raw: string;
    notes: string;
  };
  connectForm: {
    siteKey: BrowserConnectSiteKey;
    method: BrowserConnectMethod;
    browserKind: BrowserLocalProfileKind;
    browserProfileId: string;
    label: string;
    ownerLabel: string;
    visibility: BrowserSessionProfileVisibility;
    allowedSessionId: string;
    verifyUrl: string;
    domains: string;
    sourceKind: BrowserCookieSourceKind;
    raw: string;
    notes: string;
    locale: string;
    countryCode: string;
    timezoneId: string;
    headersProfileId: string;
    proxyProfileId: string;
    storageStateId: string;
  };
  connectBusy: boolean;
  loginCaptureBusy: boolean;
  profileActionBusy: string | null;
  verifyingProfileId: string | null;
  lastConnectVerification: BrowserConnectVerificationRow | null;
  sessionProfileForm: {
    label: string;
    domains: string;
    cookieJarId: string;
    headersProfileId: string;
    proxyProfileId: string;
    storageStateId: string;
    locale: string;
    countryCode: string;
    timezoneId: string;
    notes: string;
  };
  headerProfileForm: {
    label: string;
    domains: string;
    headers: string;
    notes: string;
  };
  proxyProfileForm: {
    label: string;
    domains: string;
    server: string;
    username: string;
    password: string;
    notes: string;
  };
  storageStateForm: {
    label: string;
    domains: string;
    storageState: string;
    notes: string;
  };
};

function connectSiteConfig(siteKey: BrowserConnectSiteKey) {
  return CONNECT_SITE_OPTIONS.find((entry) => entry.siteKey === siteKey) ?? CONNECT_SITE_OPTIONS[CONNECT_SITE_OPTIONS.length - 1];
}

function cloneBrowserConfig(config: BrowserCapabilityConfigRow): BrowserCapabilityConfigRow {
  return {
    ...config,
    allowedAgents: [...config.allowedAgents],
    policy: {
      ...config.policy,
      allowedDomains: [...config.policy.allowedDomains],
      deniedDomains: [...config.policy.deniedDomains]
    }
  };
}

function normalizeBrowserConfig(config: BrowserCapabilityConfigRow): BrowserCapabilityConfigRow {
  return {
    ...config,
    executable: config.executable.trim(),
    healthcheckCommand: config.healthcheckCommand.trim(),
    installCommand: config.installCommand.trim(),
    bootstrapCommand: config.bootstrapCommand.trim(),
    httpBaseUrl: config.httpBaseUrl?.trim() || null,
    allowedAgents: Array.from(new Set(config.allowedAgents.map((entry) => entry.trim()).filter((entry) => entry.length > 0))).sort(),
    policy: {
      ...config.policy,
      allowedDomains: Array.from(
        new Set(config.policy.allowedDomains.map((entry) => entry.trim()).filter((entry) => entry.length > 0))
      ).sort(),
      deniedDomains: Array.from(
        new Set(config.policy.deniedDomains.map((entry) => entry.trim()).filter((entry) => entry.length > 0))
      ).sort()
    }
  };
}

function parseLineList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

function parseKeyValueLines(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && entry.includes(':'))
      .map((entry) => {
        const separatorIndex = entry.indexOf(':');
        return [entry.slice(0, separatorIndex).trim(), entry.slice(separatorIndex + 1).trim()] as const;
      })
      .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0)
  );
}

function stringifyJsonObject(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function CapabilitySwitch({
  id,
  enabled,
  disabled,
  label,
  onChange
}: {
  id?: string;
  enabled: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={enabled}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--shell-accent-border)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${
          enabled
            ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)]'
            : 'border-white/10 bg-white/[0.04]'
        }`}
      >
        <m.span
          layout
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className={`pointer-events-none inline-block h-4 w-4 rounded-full ${enabled ? 'translate-x-6 bg-[var(--shell-accent)]' : 'translate-x-1 bg-white/45'}`}
        />
      </span>
    </label>
  );
}

function effectiveBrowserAccess(
  agent: AgentProfileRow,
  status: BrowserCapabilityStatusRow | null
): { effective: boolean; source: 'config_allowlist' | 'profile_tool' | 'none' } {
  if (!status) {
    return {
      effective: agent.tools.includes(BROWSER_TOOL_NAME),
      source: agent.tools.includes(BROWSER_TOOL_NAME) ? 'profile_tool' : 'none'
    };
  }
  if (status.allowedAgents.length > 0) {
    return {
      effective: status.allowedAgents.includes(agent.id),
      source: status.allowedAgents.includes(agent.id) ? 'config_allowlist' : 'none'
    };
  }
  return {
    effective: agent.tools.includes(BROWSER_TOOL_NAME),
    source: agent.tools.includes(BROWSER_TOOL_NAME) ? 'profile_tool' : 'none'
  };
}

function BrowserStatusBadge({ status }: { status: BrowserCapabilityStatusRow }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.72rem] font-medium ${STATUS_TONE_CLASS[status.healthState]}`}>
      <span className={`h-2 w-2 rounded-full ${status.ready ? 'bg-current' : 'bg-current opacity-70'}`} />
      {status.ready ? 'Ready' : status.healthState.replace(/_/g, ' ')}
    </span>
  );
}

function BrowserPageSkeleton() {
  return (
    <section className="space-y-4">
      <div className={`${PANEL_CLASS} p-6`}>
        <div className="skeleton h-8 w-40" />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="skeleton h-[36rem] w-full rounded-[2rem]" />
        <div className="skeleton h-[36rem] w-full rounded-[2rem]" />
      </div>
    </section>
  );
}

function useBrowserPageModel() {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const updateAgentProfile = useAppStore((state) => state.updateAgentProfile);
  const routeSearch = useSearch({ from: '/browser' });

  const [opsState, setOpsState] = useState<BrowserOpsState>({
    status: null,
    config: null,
    configDraft: null,
    validation: null,
    contract: null,
    vault: null,
    history: null,
    selectedRun: null,
    selectedArtifact: null,
    loading: true,
    refreshing: false,
    testRunning: false,
    configSaving: false,
    assignmentBusy: null,
    downloadBusy: null,
    vaultBusy: null,
    error: null,
    notice: null,
    selectedRunId: null,
    selectedArtifactHandle: null,
    showAdvanced: false
  });
  const {
    status,
    config,
    configDraft,
    validation,
    contract,
    vault,
    history,
    selectedRun,
    selectedArtifact,
    refreshing,
    testRunning,
    configSaving,
    assignmentBusy,
    downloadBusy,
    vaultBusy,
    error,
    notice,
    selectedRunId,
    selectedArtifactHandle,
    showAdvanced
  } = opsState;
  const agentProfiles = useQuery(agentProfilesQueryOptions(token)).data ?? [];
  const enabledAgents = useMemo(() => agentProfiles.filter((agent) => agent.enabled), [agentProfiles]);
  const sessions = useQuery(sessionsQueryOptions(token)).data ?? [];
  const browserStatusResult = useQuery(browserStatusQueryOptions(token));
  const browserDoctorResult = useQuery(browserDoctorQueryOptions(token));
  const browserVaultResult = useQuery(browserSessionVaultQueryOptions(token));
  const browserHistoryResult = useQuery(browserHistoryQueryOptions(token, { limit: 18 }));
  const selectedRunResult = useQuery(browserRunQueryOptions(token, selectedRunId));
  const selectedArtifactResult = useQuery(browserArtifactQueryOptions(token, selectedArtifactHandle));
  const syncedConfigSignatureRef = useRef<string | null>(null);
  const [formState, setFormState] = useState<BrowserFormState>(() => {
    const preset = connectSiteConfig('tiktok');
    return {
      form: {
        agentId: '',
        url: 'https://example.com/report',
        selector: '',
        extractionMode: 'markdown',
        dynamicLikely: false,
        requiresStealth: false,
        requiresProxy: false,
        requiresVisibleBrowser: false,
        requiresDownload: false,
        mainContentOnly: false,
        sessionProfileId: '',
        suspiciousPromptInjection: false,
        previewChars: '360'
      },
      cookieImportForm: {
        label: 'TikTok session',
        domains: 'www.tiktok.com\ntiktok.com',
        sourceKind: 'netscape_cookies_txt',
        raw: '',
        notes: ''
      },
      connectForm: {
        siteKey: 'tiktok',
        method: preset.recommendedMethod,
        browserKind: 'chrome',
        browserProfileId: '',
        label: preset.defaultProfileLabel,
        ownerLabel: '',
        visibility: 'shared',
        allowedSessionId: '',
        verifyUrl: preset.defaultVerifyUrl,
        domains: preset.defaultDomains,
        sourceKind: 'netscape_cookies_txt',
        raw: '',
        notes: '',
        locale: '',
        countryCode: '',
        timezoneId: '',
        headersProfileId: '',
        proxyProfileId: '',
        storageStateId: ''
      },
      connectBusy: false,
      loginCaptureBusy: false,
      profileActionBusy: null,
      verifyingProfileId: null,
      lastConnectVerification: null,
      sessionProfileForm: {
        label: 'TikTok authenticated',
        domains: 'www.tiktok.com\ntiktok.com',
        cookieJarId: '',
        headersProfileId: '',
        proxyProfileId: '',
        storageStateId: '',
        locale: '',
        countryCode: '',
        timezoneId: '',
        notes: ''
      },
      headerProfileForm: {
        label: 'Mobile browser headers',
        domains: 'www.tiktok.com\nwww.instagram.com',
        headers: 'User-Agent: Mozilla/5.0\nAccept-Language: en-US,en;q=0.9',
        notes: ''
      },
      proxyProfileForm: {
        label: 'Geo proxy',
        domains: 'www.tiktok.com\nwww.instagram.com',
        server: '',
        username: '',
        password: '',
        notes: ''
      },
      storageStateForm: {
        label: 'Visible login state',
        domains: 'www.tiktok.com',
        storageState: stringifyJsonObject({ cookies: [], origins: [] }),
        notes: ''
      }
    };
  });
  const {
    form,
    cookieImportForm,
    connectForm,
    connectBusy,
    loginCaptureBusy,
    profileActionBusy,
    verifyingProfileId,
    lastConnectVerification,
    sessionProfileForm,
    headerProfileForm,
    proxyProfileForm,
    storageStateForm
  } = formState;
  const setOpsField = useCallback(
    <K extends keyof BrowserOpsState>(key: K, value: BrowserOpsState[K] | ((current: BrowserOpsState[K]) => BrowserOpsState[K])) => {
      setOpsState((current) => ({
        ...current,
        [key]: typeof value === 'function' ? (value as (current: BrowserOpsState[K]) => BrowserOpsState[K])(current[key]) : value
      }));
    },
    []
  );
  const setFormField = useCallback(
    <K extends keyof BrowserFormState>(
      key: K,
      value: BrowserFormState[K] | ((current: BrowserFormState[K]) => BrowserFormState[K])
    ) => {
      setFormState((current) => ({
        ...current,
        [key]: typeof value === 'function' ? (value as (current: BrowserFormState[K]) => BrowserFormState[K])(current[key]) : value
      }));
    },
    []
  );
  const setStatus = useCallback((value: BrowserCapabilityStatusRow | null) => setOpsField('status', value), [setOpsField]);
  const setConfig = useCallback((value: BrowserCapabilityConfigRow | null) => setOpsField('config', value), [setOpsField]);
  const setConfigDraft = useCallback(
    (value: BrowserCapabilityConfigRow | null | ((current: BrowserCapabilityConfigRow | null) => BrowserCapabilityConfigRow | null)) =>
      setOpsField('configDraft', value),
    [setOpsField]
  );
  const setValidation = useCallback((value: BrowserCapabilityValidationRow | null) => setOpsField('validation', value), [setOpsField]);
  const setContract = useCallback((value: BrowserProviderCapabilityContractRow | null) => setOpsField('contract', value), [setOpsField]);
  const setVault = useCallback((value: BrowserSessionVaultState | null) => setOpsField('vault', value), [setOpsField]);
  const setHistory = useCallback((value: BrowserHistoryState | null) => setOpsField('history', value), [setOpsField]);
  const setSelectedRun = useCallback((value: BrowserRunTraceRow | null) => setOpsField('selectedRun', value), [setOpsField]);
  const setSelectedArtifact = useCallback((value: BrowserArtifactContentRow | null) => setOpsField('selectedArtifact', value), [setOpsField]);
  const setLoading = useCallback((value: boolean) => setOpsField('loading', value), [setOpsField]);
  const setRefreshing = useCallback((value: boolean) => setOpsField('refreshing', value), [setOpsField]);
  const setTestRunning = useCallback((value: boolean) => setOpsField('testRunning', value), [setOpsField]);
  const setConfigSaving = useCallback((value: boolean) => setOpsField('configSaving', value), [setOpsField]);
  const setAssignmentBusy = useCallback((value: string | null) => setOpsField('assignmentBusy', value), [setOpsField]);
  const setDownloadBusy = useCallback((value: string | null) => setOpsField('downloadBusy', value), [setOpsField]);
  const setVaultBusy = useCallback((value: string | null) => setOpsField('vaultBusy', value), [setOpsField]);
  const setError = useCallback((value: string | null) => setOpsField('error', value), [setOpsField]);
  const setNotice = useCallback((value: string | null) => setOpsField('notice', value), [setOpsField]);
  const setSelectedRunId = useCallback((value: string | null) => setOpsField('selectedRunId', value), [setOpsField]);
  const setSelectedArtifactHandle = useCallback((value: string | null) => setOpsField('selectedArtifactHandle', value), [setOpsField]);
  const setShowAdvanced = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => setOpsField('showAdvanced', value),
    [setOpsField]
  );
  const setForm = useCallback(
    (value: BrowserFormState['form'] | ((current: BrowserFormState['form']) => BrowserFormState['form'])) => setFormField('form', value),
    [setFormField]
  );
  const setCookieImportForm = useCallback(
    (
      value:
        | BrowserFormState['cookieImportForm']
        | ((current: BrowserFormState['cookieImportForm']) => BrowserFormState['cookieImportForm'])
    ) => setFormField('cookieImportForm', value),
    [setFormField]
  );
  const setConnectForm = useCallback(
    (value: BrowserFormState['connectForm'] | ((current: BrowserFormState['connectForm']) => BrowserFormState['connectForm'])) =>
      setFormField('connectForm', value),
    [setFormField]
  );
  const setConnectBusy = useCallback((value: boolean) => setFormField('connectBusy', value), [setFormField]);
  const setLoginCaptureBusy = useCallback((value: boolean) => setFormField('loginCaptureBusy', value), [setFormField]);
  const setProfileActionBusy = useCallback((value: string | null) => setFormField('profileActionBusy', value), [setFormField]);
  const setVerifyingProfileId = useCallback((value: string | null) => setFormField('verifyingProfileId', value), [setFormField]);
  const setLastConnectVerification = useCallback((value: BrowserConnectVerificationRow | null) => setFormField('lastConnectVerification', value), [setFormField]);
  const setSessionProfileForm = useCallback(
    (
      value:
        | BrowserFormState['sessionProfileForm']
        | ((current: BrowserFormState['sessionProfileForm']) => BrowserFormState['sessionProfileForm'])
    ) => setFormField('sessionProfileForm', value),
    [setFormField]
  );
  const setHeaderProfileForm = useCallback(
    (
      value:
        | BrowserFormState['headerProfileForm']
        | ((current: BrowserFormState['headerProfileForm']) => BrowserFormState['headerProfileForm'])
    ) => setFormField('headerProfileForm', value),
    [setFormField]
  );
  const setProxyProfileForm = useCallback(
    (
      value:
        | BrowserFormState['proxyProfileForm']
        | ((current: BrowserFormState['proxyProfileForm']) => BrowserFormState['proxyProfileForm'])
    ) => setFormField('proxyProfileForm', value),
    [setFormField]
  );
  const setStorageStateForm = useCallback(
    (
      value:
        | BrowserFormState['storageStateForm']
        | ((current: BrowserFormState['storageStateForm']) => BrowserFormState['storageStateForm'])
    ) => setFormField('storageStateForm', value),
    [setFormField]
  );
  const updateTestForm = useCallback(
    <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
      setForm((current) => ({
        ...current,
        [key]: value
      }));
    },
    []
  );
  const applyConnectSite = useCallback((siteKey: BrowserConnectSiteKey) => {
    const preset = connectSiteConfig(siteKey);
    setConnectForm((current) => ({
      ...current,
      siteKey,
      method: preset.recommendedMethod,
      label: current.label.trim().length > 0 && current.siteKey === siteKey ? current.label : preset.defaultProfileLabel,
      verifyUrl: preset.defaultVerifyUrl,
      domains: preset.defaultDomains,
      sourceKind: siteKey === 'generic' ? current.sourceKind : 'netscape_cookies_txt'
    }));
  }, []);
  const handleConnectAccount = useCallback(async () => {
    if (!token) {
      setError('Set API token in Settings before connecting browser accounts.');
      return;
    }
    setConnectBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await connectBrowserAccount(token, {
        label: connectForm.label.trim(),
        ownerLabel: connectForm.ownerLabel.trim() || null,
        siteKey: connectForm.siteKey,
        method: connectForm.method,
        browserKind: connectForm.method === 'browser_profile_import' ? connectForm.browserKind : null,
        browserProfileId: connectForm.method === 'browser_profile_import' ? connectForm.browserProfileId || null : null,
        visibility: connectForm.visibility,
        allowedSessionIds: connectForm.allowedSessionId ? [connectForm.allowedSessionId] : [],
        domains: parseLineList(connectForm.domains),
        verifyUrl: connectForm.verifyUrl.trim() || null,
        sourceKind: connectForm.method === 'cookie_import' ? connectForm.sourceKind : undefined,
        raw: connectForm.method === 'cookie_import' ? connectForm.raw : undefined,
        headersProfileId: connectForm.headersProfileId || null,
        proxyProfileId: connectForm.proxyProfileId || null,
        storageStateId: connectForm.storageStateId || null,
        locale: connectForm.locale.trim() || null,
        countryCode: connectForm.countryCode.trim() || null,
        timezoneId: connectForm.timezoneId.trim() || null,
        notes: connectForm.notes.trim() || null
      });
      setVault(result.vault);
      setLastConnectVerification(result.verification);
      setNotice(`Connected ${result.sessionProfile.label} and ran a verification capture.`);
      updateTestForm('sessionProfileId', result.sessionProfile.id);
      setSessionProfileForm((current) => ({
        ...current,
        label: result.sessionProfile.label,
        domains: result.sessionProfile.domains.join('\n'),
        cookieJarId: result.sessionProfile.cookieJarId ?? '',
        headersProfileId: result.sessionProfile.headersProfileId ?? current.headersProfileId,
        proxyProfileId: result.sessionProfile.proxyProfileId ?? current.proxyProfileId,
        storageStateId: result.sessionProfile.storageStateId ?? current.storageStateId,
        locale: result.sessionProfile.locale ?? '',
        countryCode: result.sessionProfile.countryCode ?? '',
        timezoneId: result.sessionProfile.timezoneId ?? '',
        notes: result.sessionProfile.notes ?? ''
      }));
      if (connectForm.method === 'cookie_import') {
        setConnectForm((current) => ({ ...current, raw: '' }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to connect browser account.');
    } finally {
      setConnectBusy(false);
    }
  }, [connectForm, token, updateTestForm]);
  const handleVerifySessionProfile = useCallback(
    async (sessionProfileId: string) => {
      if (!token) {
        setError('Set API token in Settings before verifying browser session profiles.');
        return;
      }
      setVerifyingProfileId(sessionProfileId);
      setError(null);
      setNotice(null);
      try {
        const result = await verifyBrowserSessionProfile(token, sessionProfileId);
        setVault(result.vault);
        setLastConnectVerification(result.verification);
        updateTestForm('sessionProfileId', result.sessionProfile.id);
        setNotice(`Rechecked ${result.sessionProfile.label}.`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to verify browser session profile.');
      } finally {
        setVerifyingProfileId(null);
      }
    },
    [token, updateTestForm]
  );
  const activeConnectSite = useMemo(() => connectSiteConfig(connectForm.siteKey), [connectForm.siteKey]);
  const localProfiles = useMemo(() => vault?.localProfiles ?? [], [vault?.localProfiles]);
  const filteredLocalProfiles = useMemo(
    () => localProfiles.filter((profile) => profile.browserKind === connectForm.browserKind),
    [connectForm.browserKind, localProfiles]
  );
  const routeSite = routeSearch.site ?? null;
  const routeBrowser = routeSearch.browser ?? null;
  const routeOwner = routeSearch.owner ?? null;
  const routeVisibility = routeSearch.visibility ?? null;
  const routeSessionId = routeSearch.sessionId ?? null;
  const connectableSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.state === 'active')
        .sort((left, right) => new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime()),
    [sessions]
  );
  const reconnectProfiles = useMemo(
    () => (vault?.sessionProfiles ?? []).filter((profile) => profile.health.needsReconnect),
    [vault?.sessionProfiles]
  );

  useEffect(() => {
    if (connectForm.method !== 'browser_profile_import') {
      return;
    }
    if (connectForm.browserProfileId || filteredLocalProfiles.length === 0) {
      return;
    }
    const preferred = filteredLocalProfiles.find((profile) => profile.isDefault) ?? filteredLocalProfiles[0];
    if (!preferred) {
      return;
    }
    setConnectForm((current) => ({ ...current, browserProfileId: preferred.id }));
  }, [connectForm.browserProfileId, connectForm.method, filteredLocalProfiles]);

  useEffect(() => {
    if (!routeSite && !routeBrowser && !routeOwner && !routeVisibility && !routeSessionId) {
      return;
    }
    setConnectForm((current) => {
      const preset = connectSiteConfig(routeSite ?? current.siteKey);
      const nextSiteKey = routeSite ?? current.siteKey;
      const nextMethod = current.method === 'cookie_import' ? current.method : preset.recommendedMethod;
      const nextBrowserKind = routeBrowser ?? current.browserKind;
      const nextLabel = current.label.trim().length > 0 ? current.label : preset.defaultProfileLabel;
      const nextOwnerLabel = routeOwner ?? current.ownerLabel;
      const nextVisibility = routeVisibility === 'session_only' ? 'session_only' : current.visibility;
      const nextAllowedSessionId = routeSessionId ?? current.allowedSessionId;
      const nextVerifyUrl = routeSite ? preset.defaultVerifyUrl : current.verifyUrl;
      const nextDomains = routeSite ? preset.defaultDomains : current.domains;

      if (
        current.siteKey === nextSiteKey &&
        current.method === nextMethod &&
        current.browserKind === nextBrowserKind &&
        current.label === nextLabel &&
        current.ownerLabel === nextOwnerLabel &&
        current.visibility === nextVisibility &&
        current.allowedSessionId === nextAllowedSessionId &&
        current.verifyUrl === nextVerifyUrl &&
        current.domains === nextDomains
      ) {
        return current;
      }

      return {
        ...current,
        siteKey: nextSiteKey,
        method: nextMethod,
        browserKind: nextBrowserKind,
        label: nextLabel,
        ownerLabel: nextOwnerLabel,
        visibility: nextVisibility,
        allowedSessionId: nextAllowedSessionId,
        verifyUrl: nextVerifyUrl,
        domains: nextDomains
      };
    });
  }, [routeBrowser, routeOwner, routeSessionId, routeSite, routeVisibility]);
  const handleStartLoginCapture = useCallback(async () => {
    if (!token) {
      setError('Set API token in Settings before starting a login capture.');
      return;
    }
    if (!connectForm.browserProfileId) {
      setError(`Choose a ${connectForm.browserKind} profile before starting login capture.`);
      return;
    }
    setLoginCaptureBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await startBrowserLoginCapture(token, {
        browserKind: connectForm.browserKind,
        browserProfileId: connectForm.browserProfileId,
        siteKey: connectForm.siteKey,
        verifyUrl: connectForm.verifyUrl.trim() || null
      });
      setVault(result.vault);
      setNotice(`Opened ${result.launched.site.label} in ${result.launched.command}. Log in there, then click Connect and test.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start login capture.');
    } finally {
      setLoginCaptureBusy(false);
    }
  }, [connectForm.browserKind, connectForm.browserProfileId, connectForm.siteKey, connectForm.verifyUrl, token]);
  const handleSessionProfileAction = useCallback(
    async (profile: BrowserSessionProfileSummaryRow, action: 'enable' | 'disable' | 'revoke' | 'delete') => {
      if (!token) {
        setError('Set API token in Settings before changing browser session profiles.');
        return;
      }
      setProfileActionBusy(`${action}:${profile.id}`);
      setError(null);
      setNotice(null);
      try {
        const nextVault =
          action === 'enable'
            ? await enableBrowserSessionProfile(token, profile.id)
            : action === 'disable'
              ? await disableBrowserSessionProfile(token, profile.id)
              : action === 'revoke'
                ? await revokeBrowserSessionProfile(token, profile.id)
                : await deleteBrowserSessionProfile(token, profile.id);
        setVault(nextVault);
        setNotice(
          action === 'delete'
            ? `Deleted ${profile.label}.`
            : action === 'revoke'
              ? `Revoked ${profile.label}.`
              : `${action === 'enable' ? 'Enabled' : 'Disabled'} ${profile.label}.`
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : `Failed to ${action} ${profile.label}.`);
      } finally {
        setProfileActionBusy(null);
      }
    },
    [token]
  );

  const entitledAgents = useMemo(
    () => enabledAgents.filter((agent) => effectiveBrowserAccess(agent, status).effective),
    [enabledAgents, status]
  );
  const headerMetrics = useMemo<CardMetric[]>(
    () => [
      {
        id: 'browser_ready',
        label: 'Provider',
        value: status?.ready ? 1 : 0,
        displayValue: status?.ready ? 'Ready' : status?.healthState.replace(/_/g, ' ') ?? 'Unknown',
        tone: status?.ready ? 'positive' : validation?.errors.length ? 'critical' : 'warn'
      },
      {
        id: 'browser_entitled_agents',
        label: 'Capable Agents',
        value: entitledAgents.length,
        displayValue: clampCount(entitledAgents.length),
        tone: entitledAgents.length > 0 ? 'positive' : 'warn'
      },
      {
        id: 'browser_history_total',
        label: 'Recent Runs',
        value: history?.total ?? 0,
        displayValue: clampCount(history?.total ?? 0),
        tone: (history?.total ?? 0) > 0 ? 'neutral' : 'warn'
      },
      {
        id: 'browser_validation_issues',
        label: 'Doctor Issues',
        value: (validation?.errors.length ?? 0) + (validation?.warnings.length ?? 0),
        displayValue: clampCount((validation?.errors.length ?? 0) + (validation?.warnings.length ?? 0)),
        tone: (validation?.errors.length ?? 0) > 0 ? 'critical' : (validation?.warnings.length ?? 0) > 0 ? 'warn' : 'positive'
      }
    ],
    [entitledAgents.length, history?.total, status, validation?.errors.length, validation?.warnings.length]
  );

  useRouteHeaderMetrics(headerMetrics);

  useEffect(() => {
    if (!token) {
      setOpsState((current) => ({
        ...current,
        loading: false,
        refreshing: false,
        status: null,
        config: null,
        configDraft: null,
        validation: null,
        contract: null,
        vault: null,
        history: null,
        selectedRun: null,
        selectedArtifact: null
      }));
      return;
    }
    setOpsState((current) => ({
      ...current,
      loading:
        browserStatusResult.isPending ||
        browserDoctorResult.isPending ||
        browserVaultResult.isPending ||
        browserHistoryResult.isPending
    }));
  }, [
    browserDoctorResult.isPending,
    browserHistoryResult.isPending,
    browserStatusResult.isPending,
    browserVaultResult.isPending,
    setOpsState,
    token
  ]);

  useEffect(() => {
    if (!browserStatusResult.data) {
      return;
    }
    setOpsState((current) => {
      const nextSignature = JSON.stringify(normalizeBrowserConfig(browserStatusResult.data.config));
      const previousSignature = syncedConfigSignatureRef.current;
      const currentSignature =
        current.configDraft === null ? null : JSON.stringify(normalizeBrowserConfig(current.configDraft));
      const shouldHydrateDraft =
        current.configDraft === null ||
        (previousSignature !== nextSignature && currentSignature === previousSignature);
      syncedConfigSignatureRef.current = nextSignature;
      return {
        ...current,
        status: browserStatusResult.data.status,
        config: browserStatusResult.data.config,
        configDraft: shouldHydrateDraft ? cloneBrowserConfig(browserStatusResult.data.config) : current.configDraft
      };
    });
  }, [browserStatusResult.data, setOpsState]);

  useEffect(() => {
    if (!browserDoctorResult.data) {
      return;
    }
    setOpsState((current) => ({
      ...current,
      validation: browserDoctorResult.data.validation,
      contract: browserDoctorResult.data.contract
    }));
  }, [browserDoctorResult.data, setOpsState]);

  useEffect(() => {
    setOpsState((current) => ({
      ...current,
      vault: token ? (browserVaultResult.data ?? null) : null
    }));
  }, [browserVaultResult.data, setOpsState, token]);

  useEffect(() => {
    setOpsState((current) => {
      if (!token) {
        return {
          ...current,
          history: null
        };
      }
      const nextHistory = browserHistoryResult.data ?? null;
      if (!nextHistory) {
        return {
          ...current,
          history: null
        };
      }
      const preferredRunId = current.selectedRunId;
      const nextRunId =
        preferredRunId && (nextHistory.rows.some((row) => row.runId === preferredRunId) || current.selectedRun?.runId === preferredRunId)
          ? preferredRunId
          : nextHistory.rows[0]?.runId ?? null;
      return {
        ...current,
        history: nextHistory,
        selectedRunId: nextRunId,
        selectedRun: nextRunId ? current.selectedRun : null,
        selectedArtifact: nextRunId ? current.selectedArtifact : null,
        selectedArtifactHandle: nextRunId ? current.selectedArtifactHandle : null
      };
    });
  }, [browserHistoryResult.data, setOpsState, token]);

  useEffect(() => {
    if (!selectedRunId) {
      setOpsState((current) => ({
        ...current,
        selectedRun: null,
        selectedArtifact: null,
        selectedArtifactHandle: null
      }));
      return;
    }
    if (!selectedRunResult.data) {
      return;
    }
    const trace = selectedRunResult.data;
    setOpsState((current) => {
      const currentArtifactHandle = current.selectedArtifactHandle;
      const nextArtifactHandle =
        currentArtifactHandle && trace.artifacts.some((artifact) => artifact.handle === currentArtifactHandle)
          ? currentArtifactHandle
          : trace.artifacts[0]?.handle ?? null;
      return {
        ...current,
        selectedRun: trace,
        selectedArtifactHandle: nextArtifactHandle,
        selectedArtifact: nextArtifactHandle ? current.selectedArtifact : null
      };
    });
  }, [selectedRunId, selectedRunResult.data, setOpsState]);

  useEffect(() => {
    if (!selectedArtifactHandle) {
      setOpsState((current) => ({
        ...current,
        selectedArtifact: null
      }));
      return;
    }
    if (!selectedArtifactResult.data) {
      return;
    }
    setOpsState((current) => ({
      ...current,
      selectedArtifact: selectedArtifactResult.data
    }));
  }, [selectedArtifactHandle, selectedArtifactResult.data, setOpsState]);

  useEffect(() => {
    const nextError =
      browserStatusResult.error ??
      browserDoctorResult.error ??
      browserVaultResult.error ??
      browserHistoryResult.error;
    if (!nextError) {
      return;
    }
    setOpsState((current) => ({
      ...current,
      error: nextError instanceof Error ? nextError.message : 'Failed to load browser operations.'
    }));
  }, [
    browserDoctorResult.error,
    browserHistoryResult.error,
    browserStatusResult.error,
    browserVaultResult.error,
    setOpsState
  ]);

  useEffect(() => {
    if (!selectedRunResult.error) {
      return;
    }
    const cause = selectedRunResult.error;
    if (cause instanceof ApiClientError && cause.status === 404) {
      setOpsState((current) => ({
        ...current,
        selectedRun: null,
        selectedArtifact: null,
        selectedArtifactHandle: null
      }));
      return;
    }
    setOpsState((current) => ({
      ...current,
      error: cause instanceof Error ? cause.message : 'Failed to load browser trace.'
    }));
  }, [selectedRunResult.error, setOpsState]);

  useEffect(() => {
    if (!selectedArtifactResult.error) {
      return;
    }
    const cause = selectedArtifactResult.error;
    if (cause instanceof ApiClientError && cause.status === 404) {
      setOpsState((current) => ({
        ...current,
        selectedArtifact: null
      }));
      return;
    }
    setOpsState((current) => ({
      ...current,
      error: cause instanceof Error ? cause.message : 'Failed to load artifact preview.'
    }));
  }, [selectedArtifactResult.error, setOpsState]);

  const loadArtifact = useCallback(
    async (handle: string | null, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setError(null);
      }
      setSelectedArtifactHandle(handle);
      if (!handle) {
        setSelectedArtifact(null);
      }
    },
    [setError, setSelectedArtifact, setSelectedArtifactHandle]
  );

  const loadRun = useCallback(
    async (runId: string | null, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setError(null);
      }
      setSelectedRunId(runId);
      if (!runId) {
        setSelectedRun(null);
        setSelectedArtifact(null);
        setSelectedArtifactHandle(null);
      }
    },
    [setError, setSelectedArtifact, setSelectedArtifactHandle, setSelectedRun, setSelectedRunId]
  );

  const refresh = useCallback(
    async (options?: { preserveSelection?: boolean; silent?: boolean; preferredRunId?: string | null }) => {
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        setStatus(null);
        setConfig(null);
        setValidation(null);
        setContract(null);
        setVault(null);
        setHistory(null);
        setSelectedRun(null);
        setSelectedArtifact(null);
        return;
      }

      const preserveSelection = options?.preserveSelection ?? true;
      if (!options?.silent) {
        setError(null);
      }
      setRefreshing(true);

      try {
        if (options?.preferredRunId && options.preferredRunId.trim().length > 0) {
          setSelectedRunId(options.preferredRunId.trim());
        } else if (!preserveSelection) {
          setSelectedRun(null);
          setSelectedRunId(null);
          setSelectedArtifact(null);
          setSelectedArtifactHandle(null);
        }
        await Promise.all([
          invalidateBrowserReadQueries(queryClient, token),
          invalidateBoardReadQueries(queryClient, token)
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load browser operations.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [queryClient, setConfig, setContract, setError, setHistory, setLoading, setRefreshing, setSelectedArtifact, setSelectedArtifactHandle, setSelectedRun, setSelectedRunId, setStatus, setValidation, setVault, token]
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    void refresh({ preserveSelection: true });
  }, [refresh]);

  useEffect(() => {
    if (!form.agentId) {
      const preferred = entitledAgents[0]?.id ?? enabledAgents[0]?.id ?? '';
      if (preferred) {
        setForm((current) => ({ ...current, agentId: preferred }));
      }
    }
  }, [enabledAgents, entitledAgents, form.agentId]);

  const allowedAgentOverride = Boolean(status && status.allowedAgents.length > 0);
  const draftAllowedAgentOverride = Boolean(configDraft && configDraft.allowedAgents.length > 0);
  const configDirty = useMemo(() => {
    if (!config || !configDraft) {
      return false;
    }
    return JSON.stringify(normalizeBrowserConfig(config)) !== JSON.stringify(normalizeBrowserConfig(configDraft));
  }, [config, configDraft]);
  const stealthMode = useMemo<'adaptive' | 'approval' | 'off'>(() => {
    if (!configDraft?.policy.allowStealth) {
      return 'off';
    }
    return configDraft.policy.requireApprovalForStealth ? 'approval' : 'adaptive';
  }, [configDraft]);
  const validationIssues = useMemo(
    () => [...(validation?.errors ?? []), ...(validation?.warnings ?? []), ...(validation?.infos ?? [])],
    [validation]
  );
  const effectiveAllowedAgents = configDraft?.allowedAgents ?? [];

  const setDraftValue = useCallback(<K extends keyof BrowserCapabilityConfigRow>(key: K, value: BrowserCapabilityConfigRow[K]) => {
    setConfigDraft((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const setDraftPolicy = useCallback(
    <K extends keyof BrowserCapabilityConfigRow['policy']>(key: K, value: BrowserCapabilityConfigRow['policy'][K]) => {
      setConfigDraft((current) =>
        current
          ? {
              ...current,
              policy: {
                ...current.policy,
                [key]: value
              }
            }
          : current
      );
    },
    []
  );

  const applyStealthPreset = useCallback((mode: 'adaptive' | 'approval' | 'off') => {
    setConfigDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        policy: {
          ...current.policy,
          allowStealth: mode !== 'off',
          requireApprovalForStealth: mode === 'approval'
        }
      };
    });
  }, []);

  const handleAccessModeChange = useCallback(
    (mode: 'profile_tool' | 'config_allowlist') => {
      setConfigDraft((current) => {
        if (!current) {
          return current;
        }
        if (mode === 'profile_tool') {
          return {
            ...current,
            allowedAgents: []
          };
        }
        const seededAllowlist =
          current.allowedAgents.length > 0
            ? current.allowedAgents
            : enabledAgents.filter((agent) => agent.tools.includes(BROWSER_TOOL_NAME)).map((agent) => agent.id);
        return {
          ...current,
          allowedAgents: seededAllowlist.length > 0 ? seededAllowlist : enabledAgents.slice(0, 1).map((agent) => agent.id)
        };
      });
    },
    [enabledAgents]
  );

  const handleToggleAllowlistedAgent = useCallback((agentId: string) => {
    setConfigDraft((current) => {
      if (!current) {
        return current;
      }
      const nextAllowedAgents = current.allowedAgents.includes(agentId)
        ? current.allowedAgents.filter((entry) => entry !== agentId)
        : [...current.allowedAgents, agentId];
      return {
        ...current,
        allowedAgents: nextAllowedAgents
      };
    });
  }, []);

  const handleSaveConfig = useCallback(async () => {
    if (!token || !configDraft) {
      setError('Set API token in Settings before saving browser defaults.');
      return;
    }
    setConfigSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = normalizeBrowserConfig(configDraft);
      const result = await saveBrowserConfig(token, payload);
      setStatus(result.status);
      setConfig(result.config);
      setConfigDraft(cloneBrowserConfig(result.config));
      syncedConfigSignatureRef.current = JSON.stringify(normalizeBrowserConfig(result.config));
      setNotice(
        result.restartRequired
          ? 'Browser settings saved. Restart the gateway to apply transport-level changes.'
          : 'Browser settings saved. Adaptive capture defaults are live now.'
      );
      await refresh({ preserveSelection: true, silent: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save browser settings.');
    } finally {
      setConfigSaving(false);
    }
  }, [configDraft, refresh, token]);

  const handleTestRun = useCallback(async () => {
    if (!token) {
      setError('Set API token in Settings before running browser tests.');
      return;
    }

    setTestRunning(true);
    setError(null);
    setNotice(null);
    try {
      const payload: BrowserTestRequestRow = {
        agentId: form.agentId || undefined,
        url: form.url.trim(),
        selector: form.selector.trim() || undefined,
        extractionMode: form.extractionMode,
        dynamicLikely: form.dynamicLikely,
        requiresStealth: form.requiresStealth,
        requiresProxy: form.requiresProxy,
        requiresVisibleBrowser: form.requiresVisibleBrowser,
        requiresDownload: form.requiresDownload,
        mainContentOnly: form.mainContentOnly,
        sessionProfileId: form.sessionProfileId || undefined,
        suspiciousPromptInjection: form.suspiciousPromptInjection,
        previewChars: Number.isFinite(Number(form.previewChars)) ? Number(form.previewChars) : undefined
      };
      const result = await runBrowserTest(token, payload);
      setStatus(result.status);
      setSelectedRun(result.test);
      setSelectedRunId(result.test.runId);
      const firstArtifactHandle = result.test.artifacts[0]?.handle ?? null;
      if (firstArtifactHandle) {
        await loadArtifact(firstArtifactHandle, { silent: true });
      } else {
        setSelectedArtifact(null);
        setSelectedArtifactHandle(null);
      }
      setNotice(result.test.ok ? `Captured ${result.test.artifacts.length} artifact(s) from ${payload.url}.` : 'Browser test finished with policy blocks or provider errors.');
      await refresh({ preserveSelection: true, silent: true, preferredRunId: result.test.runId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Browser test failed.');
    } finally {
      setTestRunning(false);
    }
  }, [form, loadArtifact, refresh, token]);

  const handleImportCookieJar = useCallback(async () => {
    if (!token) {
      setError('Set API token in Settings before importing cookies.');
      return;
    }
    if (!cookieImportForm.label.trim() || !cookieImportForm.raw.trim()) {
      setError('Cookie import needs a label and raw cookie content.');
      return;
    }
    setVaultBusy('cookie-import');
    setError(null);
    setNotice(null);
    try {
      const nextVault = await importBrowserCookieJar(token, {
        label: cookieImportForm.label.trim(),
        domains: parseLineList(cookieImportForm.domains),
        sourceKind: cookieImportForm.sourceKind,
        raw: cookieImportForm.raw,
        notes: cookieImportForm.notes.trim() || null
      });
      setVault(nextVault);
      const latestCookieJarId = nextVault.cookieJars[0]?.id ?? '';
      if (latestCookieJarId) {
        setSessionProfileForm((current) => ({
          ...current,
          cookieJarId: current.cookieJarId || latestCookieJarId
        }));
      }
      setNotice(`Imported cookie jar ${cookieImportForm.label.trim()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to import cookie jar.');
    } finally {
      setVaultBusy(null);
    }
  }, [cookieImportForm, token]);

  const handleSaveHeaderProfile = useCallback(async () => {
    if (!token) {
      setError('Set API token in Settings before saving header profiles.');
      return;
    }
    if (!headerProfileForm.label.trim()) {
      setError('Header profile label is required.');
      return;
    }
    const headers = parseKeyValueLines(headerProfileForm.headers);
    if (Object.keys(headers).length === 0) {
      setError('Header profiles need at least one Header: value line.');
      return;
    }
    setVaultBusy('header-profile');
    setError(null);
    setNotice(null);
    try {
      const nextVault = await upsertBrowserHeaderProfile(token, {
        label: headerProfileForm.label.trim(),
        domains: parseLineList(headerProfileForm.domains),
        headers,
        notes: headerProfileForm.notes.trim() || null
      });
      setVault(nextVault);
      const latestProfileId = nextVault.headerProfiles[0]?.id ?? '';
      if (latestProfileId) {
        setSessionProfileForm((current) => ({
          ...current,
          headersProfileId: current.headersProfileId || latestProfileId
        }));
      }
      setNotice(`Saved header profile ${headerProfileForm.label.trim()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save header profile.');
    } finally {
      setVaultBusy(null);
    }
  }, [headerProfileForm, token]);

  const handleSaveProxyProfile = useCallback(async () => {
    if (!token) {
      setError('Set API token in Settings before saving proxy profiles.');
      return;
    }
    if (!proxyProfileForm.label.trim() || !proxyProfileForm.server.trim()) {
      setError('Proxy profiles need a label and proxy server.');
      return;
    }
    setVaultBusy('proxy-profile');
    setError(null);
    setNotice(null);
    try {
      const nextVault = await upsertBrowserProxyProfile(token, {
        label: proxyProfileForm.label.trim(),
        domains: parseLineList(proxyProfileForm.domains),
        proxy: {
          server: proxyProfileForm.server.trim(),
          username: proxyProfileForm.username.trim() || null,
          password: proxyProfileForm.password.trim() || null
        },
        notes: proxyProfileForm.notes.trim() || null
      });
      setVault(nextVault);
      const latestProfileId = nextVault.proxyProfiles[0]?.id ?? '';
      if (latestProfileId) {
        setSessionProfileForm((current) => ({
          ...current,
          proxyProfileId: current.proxyProfileId || latestProfileId
        }));
      }
      setNotice(`Saved proxy profile ${proxyProfileForm.label.trim()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save proxy profile.');
    } finally {
      setVaultBusy(null);
    }
  }, [proxyProfileForm, token]);

  const handleSaveStorageState = useCallback(async () => {
    if (!token) {
      setError('Set API token in Settings before saving storage state.');
      return;
    }
    if (!storageStateForm.label.trim()) {
      setError('Storage state label is required.');
      return;
    }
    let parsedStorageState: Record<string, unknown>;
    try {
      const parsed = JSON.parse(storageStateForm.storageState) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('storageState must be a JSON object');
      }
      parsedStorageState = parsed as Record<string, unknown>;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Storage state must be valid JSON.');
      return;
    }
    setVaultBusy('storage-state');
    setError(null);
    setNotice(null);
    try {
      const nextVault = await upsertBrowserStorageState(token, {
        label: storageStateForm.label.trim(),
        domains: parseLineList(storageStateForm.domains),
        storageState: parsedStorageState,
        notes: storageStateForm.notes.trim() || null
      });
      setVault(nextVault);
      const latestStorageStateId = nextVault.storageStates[0]?.id ?? '';
      if (latestStorageStateId) {
        setSessionProfileForm((current) => ({
          ...current,
          storageStateId: current.storageStateId || latestStorageStateId
        }));
      }
      setNotice(`Saved storage state ${storageStateForm.label.trim()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save storage state.');
    } finally {
      setVaultBusy(null);
    }
  }, [storageStateForm, token]);

  const handleSaveSessionProfile = useCallback(async () => {
    if (!token) {
      setError('Set API token in Settings before saving browser session profiles.');
      return;
    }
    if (!sessionProfileForm.label.trim()) {
      setError('Session profile label is required.');
      return;
    }
    setVaultBusy('session-profile');
    setError(null);
    setNotice(null);
    try {
      const nextVault = await upsertBrowserSessionProfile(token, {
        label: sessionProfileForm.label.trim(),
        domains: parseLineList(sessionProfileForm.domains),
        cookieJarId: sessionProfileForm.cookieJarId || null,
        headersProfileId: sessionProfileForm.headersProfileId || null,
        proxyProfileId: sessionProfileForm.proxyProfileId || null,
        storageStateId: sessionProfileForm.storageStateId || null,
        locale: sessionProfileForm.locale.trim() || null,
        countryCode: sessionProfileForm.countryCode.trim() || null,
        timezoneId: sessionProfileForm.timezoneId.trim() || null,
        notes: sessionProfileForm.notes.trim() || null,
        enabled: true
      });
      setVault(nextVault);
      const latestProfileId = nextVault.sessionProfiles[0]?.id ?? '';
      if (latestProfileId) {
        setForm((current) => ({
          ...current,
          sessionProfileId: current.sessionProfileId || latestProfileId
        }));
      }
      setNotice(`Saved browser session profile ${sessionProfileForm.label.trim()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save browser session profile.');
    } finally {
      setVaultBusy(null);
    }
  }, [sessionProfileForm, token]);

  const handleRevokeCookieJar = useCallback(
    async (cookieJarId: string) => {
      if (!token) {
        setError('Set API token in Settings before revoking cookie jars.');
        return;
      }
      setVaultBusy(`revoke-cookie:${cookieJarId}`);
      setError(null);
      setNotice(null);
      try {
        const nextVault = await revokeBrowserCookieJar(token, cookieJarId);
        setVault(nextVault);
        setNotice('Cookie jar revoked.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to revoke cookie jar.');
      } finally {
        setVaultBusy(null);
      }
    },
    [token]
  );

  const handleRevokeHeaderProfile = useCallback(
    async (profileId: string) => {
      if (!token) {
        setError('Set API token in Settings before revoking header profiles.');
        return;
      }
      setVaultBusy(`revoke-header:${profileId}`);
      setError(null);
      setNotice(null);
      try {
        const nextVault = await revokeBrowserHeaderProfile(token, profileId);
        setVault(nextVault);
        setNotice('Header profile revoked.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to revoke header profile.');
      } finally {
        setVaultBusy(null);
      }
    },
    [token]
  );

  const handleRevokeProxyProfile = useCallback(
    async (profileId: string) => {
      if (!token) {
        setError('Set API token in Settings before revoking proxy profiles.');
        return;
      }
      setVaultBusy(`revoke-proxy:${profileId}`);
      setError(null);
      setNotice(null);
      try {
        const nextVault = await revokeBrowserProxyProfile(token, profileId);
        setVault(nextVault);
        setNotice('Proxy profile revoked.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to revoke proxy profile.');
      } finally {
        setVaultBusy(null);
      }
    },
    [token]
  );

  const handleRevokeStorageState = useCallback(
    async (storageStateId: string) => {
      if (!token) {
        setError('Set API token in Settings before revoking storage state.');
        return;
      }
      setVaultBusy(`revoke-storage:${storageStateId}`);
      setError(null);
      setNotice(null);
      try {
        const nextVault = await revokeBrowserStorageState(token, storageStateId);
        setVault(nextVault);
        setNotice('Storage state revoked.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to revoke storage state.');
      } finally {
        setVaultBusy(null);
      }
    },
    [token]
  );

  const handleToggleCapability = useCallback(
    async (agent: AgentProfileRow) => {
      if (!token) {
        setError('Set API token in Settings before changing browser capability.');
        return;
      }
      const nextEnabled = !agent.tools.includes(BROWSER_TOOL_NAME);
      setAssignmentBusy(agent.id);
      setError(null);
      setNotice(null);
      try {
        const nextTools = nextEnabled
          ? Array.from(new Set([...agent.tools, BROWSER_TOOL_NAME]))
          : agent.tools.filter((tool) => tool !== BROWSER_TOOL_NAME);
        await updateAgentProfile(agent.id, {
          tools: nextTools
        });
        setNotice(`${agent.name} ${nextEnabled ? 'granted' : 'removed from'} the browser tool profile.`);
        await refresh({ preserveSelection: true, silent: true });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to update browser capability.');
      } finally {
        setAssignmentBusy(null);
      }
    },
    [refresh, token, updateAgentProfile]
  );
  const handleResetBaseline = useCallback(
    async (agent: AgentProfileRow) => {
      if (!token) {
        setError('Set API token in Settings before restoring the seeded baseline.');
        return;
      }
      setAssignmentBusy(agent.id);
      setError(null);
      setNotice(null);
      try {
        await resetAgentProfileBaseline(token, agent.id);
        setNotice(`Restored the seeded baseline for ${agent.name}.`);
        await refresh({ preserveSelection: true, silent: true });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to restore the seeded baseline.');
      } finally {
        setAssignmentBusy(null);
      }
    },
    [refresh, token]
  );

  const handleDownloadArtifact = useCallback(async () => {
    if (!token || !selectedArtifactHandle) {
      return;
    }
    setDownloadBusy(selectedArtifactHandle);
    setError(null);
    try {
      const result = await downloadBrowserArtifact(selectedArtifactHandle, token);
      const url = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } catch (cause) {
      const message =
        cause instanceof ApiClientError && cause.status === 404
          ? 'This artifact is no longer available on disk. Refresh Browser Ops and try a newer run.'
          : cause instanceof Error
            ? cause.message
            : 'Failed to download browser artifact.';
      setError(message);
    } finally {
      setDownloadBusy(null);
    }
  }, [selectedArtifactHandle, token]);

  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'sessions' | 'captures'>('overview');

  const isLoading = (browserStatusResult.isPending || browserDoctorResult.isPending || browserVaultResult.isPending || browserHistoryResult.isPending) && !status;

  return {
    resources: {
      enabledAgents
    },
    activeTab,
    opsState: {
      status,
      config,
      configDraft,
      validation,
      contract,
      vault,
      history,
      selectedRun,
      selectedArtifact,
      loading: isLoading,
      refreshing,
      testRunning,
      configSaving,
      assignmentBusy,
      downloadBusy,
      vaultBusy,
      error,
      notice,
      selectedRunId,
      selectedArtifactHandle,
      showAdvanced
    },
    formState: {
      form,
      cookieImportForm,
      connectForm,
      connectBusy,
      loginCaptureBusy,
      profileActionBusy,
      verifyingProfileId,
      lastConnectVerification,
      sessionProfileForm,
      headerProfileForm,
      proxyProfileForm,
      storageStateForm
    },
    derived: {
      activeConnectSite,
      filteredLocalProfiles,
      connectableSessions,
      reconnectProfiles,
      entitledAgents,
      allowedAgentOverride,
      draftAllowedAgentOverride,
      configDirty,
      stealthMode,
      validationIssues,
      effectiveAllowedAgents
    },
    actions: {
      setActiveTab,
      setShowAdvanced,
      updateTestForm,
      applyConnectSite,
      setCookieImportForm,
      setConnectForm,
      setSessionProfileForm,
      setHeaderProfileForm,
      setProxyProfileForm,
      setStorageStateForm,
      setDraftValue,
      setDraftPolicy,
      applyStealthPreset,
      handleConnectAccount,
      handleVerifySessionProfile,
      handleStartLoginCapture,
      handleSessionProfileAction,
      handleAccessModeChange,
      handleToggleAllowlistedAgent,
      handleSaveConfig,
      handleTestRun,
      handleImportCookieJar,
      handleSaveHeaderProfile,
      handleSaveProxyProfile,
      handleSaveStorageState,
      handleSaveSessionProfile,
      handleRevokeCookieJar,
      handleRevokeHeaderProfile,
      handleRevokeProxyProfile,
      handleRevokeStorageState,
      handleResetBaseline,
      handleToggleCapability,
      handleDownloadArtifact,
      refresh,
      setForm,
      setLastConnectVerification,
      loadRun,
      loadArtifact
    }
  };
}

export function BrowserPage() {
  const model = useBrowserPageModel();
  return renderBrowserPageContent(model);
}

function renderBrowserPageContent(model: ReturnType<typeof useBrowserPageModel>) {
  const { resources, opsState, formState, derived, actions, activeTab } = model;
  const { enabledAgents } = resources;
  const {
    status,
    config,
    configDraft,
    contract,
    vault,
    history,
    selectedArtifact,
    loading,
    refreshing,
    testRunning,
    configSaving,
    assignmentBusy,
    error,
    notice,
    selectedRunId
  } = opsState;
  const {
    form,
    connectForm,
    connectBusy
  } = formState;
  const {
    activeConnectSite,
    allowedAgentOverride,
    configDirty,
    stealthMode,
    validationIssues
  } = derived;
  const {
    setActiveTab,
    updateTestForm,
    applyConnectSite,
    setConnectForm,
    setDraftValue,
    applyStealthPreset,
    handleConnectAccount,
    handleVerifySessionProfile,
    handleSessionProfileAction,
    handleSaveConfig,
    handleTestRun,
    handleRevokeCookieJar,
    handleToggleCapability,
    handleDownloadArtifact,
    refresh,
    loadRun
  } = actions;
  const dockerSupportEntries = toKeyedNonEmptyStrings(status?.dockerSupport ?? [], 'docker-support');

  if (loading) {
    return <BrowserPageSkeleton />;
  }

  const TAB_META: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'agents', label: 'Agents' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'captures', label: 'Captures' }
  ];

  return (
    <LazyMotion features={domAnimation}>
      <div className="space-y-6 pb-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-[var(--shell-accent)]">
              <Browsers size={20} weight="bold" />
            </div>
            <div>
              <h1 className="text-xl font-medium tracking-tight text-white">Browser Operations</h1>
              <p className="text-xs text-[var(--shell-muted)]">Provider posture and session management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {status ? <BrowserStatusBadge status={status} /> : null}
            <button
              type="button"
              onClick={() => void refresh({ preserveSelection: true })}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/5 px-3 text-xs font-medium text-white hover:bg-white/10"
            >
              <ArrowsClockwise size={14} className={refreshing ? 'animate-spin' : ''} />
              Sync
            </button>
          </div>
        </header>

        <nav className="flex items-center gap-1 border-b border-white/5 pb-px">
          {TAB_META.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'relative px-4 py-2 text-sm font-medium transition-colors outline-none',
                activeTab === tab.id ? 'text-white' : 'text-[var(--shell-muted)] hover:text-white'
              ].join(' ')}
            >
              {tab.label}
              {activeTab === tab.id ? (
                <m.div
                  layoutId="active-tab"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--shell-accent)]"
                />
              ) : null}
            </button>
          ))}
        </nav>

        {error ? (
          <section className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
            {error}
          </section>
        ) : null}
        {notice ? (
          <section className="rounded-xl border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-4 py-3 text-sm text-white">
            {notice}
          </section>
        ) : null}

        <div className="min-h-[400px]">
          {activeTab === 'overview' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-6">
                {configDraft && (
                  <section className={`${PANEL_CLASS} p-6`}>
                    <div className="flex items-center justify-between gap-4 mb-6">
                      <h2 className="text-lg font-medium text-white">Policy Console</h2>
                      <div className="flex items-center gap-3">
                        <span className={`text-[0.65rem] font-bold uppercase tracking-wider ${configDirty ? 'text-amber-400' : 'text-emerald-400 opacity-60'}`}>
                          {configDirty ? 'Unsaved changes' : 'In sync'}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleSaveConfig()}
                          disabled={!configDirty || configSaving}
                          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-50"
                        >
                          {configSaving ? 'Saving...' : 'Apply policy'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                        <div>
                          <p className="text-sm font-medium text-white">Global Capability</p>
                          <p className="text-xs text-[var(--shell-muted)]">Fail closed if disabled.</p>
                        </div>
                        <CapabilitySwitch
                          enabled={configDraft.enabled}
                          label="Global toggle"
                          onChange={() => setDraftValue('enabled', !configDraft.enabled)}
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        {[
                          { id: 'adaptive', label: 'Adaptive', detail: 'Auto-promote.' },
                          { id: 'approval', label: 'Approval', detail: 'Gate stealth.' },
                          { id: 'off', label: 'Disabled', detail: 'Block stealth.' }
                        ].map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => applyStealthPreset(option.id as 'adaptive' | 'approval' | 'off')}
                            className={[
                              'p-3 text-left rounded-xl border transition-all',
                              stealthMode === option.id
                                ? 'bg-[var(--shell-accent-soft)] border-[color:var(--shell-accent-border)]'
                                : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                            ].join(' ')}
                          >
                            <p className="text-xs font-semibold text-white">{option.label}</p>
                            <p className="mt-1 text-[0.65rem] text-[var(--shell-muted)]">{option.detail}</p>
                          </button>
                        ))}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">Transport</span>
                          <select
                            value={configDraft.transport}
                            onChange={(event) => setDraftValue('transport', event.currentTarget.value as BrowserTransportMode)}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--shell-accent-border)]"
                          >
                            {TRANSPORT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </label>
                        <label className="space-y-1.5">
                          <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">Extraction</span>
                          <select
                            value={configDraft.defaultExtraction}
                            onChange={(event) => setDraftValue('defaultExtraction', event.currentTarget.value as BrowserExtractionMode)}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--shell-accent-border)]"
                          >
                            {EXTRACTION_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                  </section>
                )}

                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-6">Contract & Boundaries</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {contract ? (
                      <>
                        <BoundaryChip label="Schema" value={contract.schema} />
                        <BoundaryChip label="Proxy" value={contract.providerBoundaries.supportsProxy ? 'supported' : 'blocked'} />
                        <BoundaryChip label="Stealth" value={contract.providerBoundaries.supportsStealth ? 'supported' : 'blocked'} />
                        <BoundaryChip label="Visible" value={contract.providerBoundaries.supportsVisualBrowser ? 'supported' : 'blocked'} />
                      </>
                    ) : null}
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-6">Doctor Readiness</h2>
                  <div className="space-y-4">
                    <InfoRow label="Executable" value={config?.executable ?? 'n/a'} />
                    <InfoRow label="HTTP base URL" value={config?.httpBaseUrl ?? 'n/a'} />
                  </div>
                  {validationIssues.length ? (
                    <div className="mt-6 space-y-2">
                      {validationIssues.map((issue) => (
                        <div key={`${issue.code}-${issue.path}`} className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/10 text-xs text-rose-200">
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-xs text-emerald-200">
                      Doctor checks are clear. Ready for governed use.
                    </div>
                  )}
                </section>

                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-4">Postures</h2>
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-muted)] mb-2">Docker Posture</p>
                      <div className="space-y-1 text-xs text-white">
                        {dockerSupportEntries.length > 0 ? (
                          dockerSupportEntries.map((entry) => <div key={entry.key}>{entry.value}</div>)
                        ) : (
                          <div className="text-[var(--shell-muted)]">No Docker posture notes.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <section className={`${PANEL_CLASS} p-6`}>
              <div className="flex items-center justify-between gap-4 mb-8">
                <div>
                  <h2 className="text-lg font-medium text-white">Capability Assignment</h2>
                  <p className="text-xs text-[var(--shell-muted)] mt-1">Control which agents can access browser tools.</p>
                </div>
                {allowedAgentOverride && (
                  <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[0.65rem] font-bold text-amber-200 uppercase tracking-wider">
                    Override Active
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {enabledAgents.map((agent) => {
                  const profileEnabled = agent.tools.includes(BROWSER_TOOL_NAME);
                  const access = effectiveBrowserAccess(agent, status);
                  return (
                    <div key={agent.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="truncate text-sm font-medium text-white">{agent.name}</p>
                          <div className={`h-1.5 w-1.5 rounded-full ${access.effective ? 'bg-emerald-400' : 'bg-white/20'}`} />
                        </div>
                        <p className="truncate text-[0.7rem] text-[var(--shell-muted)]">{agent.title}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5">
                        <span className="text-[0.65rem] font-medium text-[var(--shell-muted)] uppercase tracking-wider">
                          {profileEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <CapabilitySwitch
                          enabled={profileEnabled}
                          disabled={assignmentBusy === agent.id}
                          label={`Toggle ${agent.name}`}
                          onChange={() => void handleToggleCapability(agent)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'sessions' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
              <div className="space-y-6">
                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-6">Connect account</h2>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 mb-8">
                    {CONNECT_SITE_OPTIONS.map((site) => {
                      const Icon = site.icon;
                      const active = connectForm.siteKey === site.siteKey;
                      return (
                        <button
                          key={site.siteKey}
                          onClick={() => applyConnectSite(site.siteKey)}
                          className={[
                            'p-4 rounded-xl border transition-all text-left',
                            active
                              ? 'bg-[var(--shell-accent-soft)] border-[color:var(--shell-accent-border)] text-white shadow-lg'
                              : 'bg-white/[0.02] border-white/5 text-[var(--shell-muted)] hover:border-white/10 hover:text-white'
                          ].join(' ')}
                        >
                          <Icon size={24} weight={active ? 'fill' : 'regular'} />
                          <p className="mt-3 text-xs font-semibold">{site.label}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {CONNECT_METHOD_OPTIONS.map((option) => {
                        const active = connectForm.method === option.id;
                        return (
                          <button
                            key={option.id}
                            onClick={() => setConnectForm((c) => ({ ...c, method: option.id }))}
                            className={[
                              'p-4 rounded-xl border transition-all text-left',
                              active
                                ? 'bg-white/5 border-white/20'
                                : 'bg-transparent border-white/5 hover:border-white/10'
                            ].join(' ')}
                          >
                            <p className="text-sm font-medium text-white">{option.label}</p>
                            <p className="mt-1 text-[0.65rem] text-[var(--shell-muted)] leading-relaxed">{option.detail}</p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">Profile Label</span>
                        <input
                          value={connectForm.label}
                          onChange={(e) => setConnectForm((c) => ({ ...c, label: e.target.value }))}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          placeholder={activeConnectSite.defaultProfileLabel}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">Owner</span>
                        <input
                          value={connectForm.ownerLabel}
                          onChange={(e) => setConnectForm((c) => ({ ...c, ownerLabel: e.target.value }))}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                          placeholder="e.g. personal"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-4 border-t border-white/5">
                      <button
                        onClick={() => void handleConnectAccount()}
                        disabled={connectBusy}
                        className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-50"
                      >
                        {connectBusy ? 'Connecting...' : 'Connect & Verify'}
                      </button>
                    </div>
                  </div>
                </section>

                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-6">Session Profiles</h2>
                  <div className="space-y-3">
                    {(vault?.sessionProfiles ?? []).length > 0 ? (
                      vault?.sessionProfiles.map((p) => (
                        <div key={p.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <p className="text-sm font-medium text-white">{p.label}</p>
                            <span className={`h-2 w-2 rounded-full ${p.lastVerificationStatus === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => void handleVerifySessionProfile(p.id)}
                              className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-accent)] hover:brightness-110"
                            >
                              Verify
                            </button>
                            <span className="text-white/10">|</span>
                            <button
                              onClick={() => void handleSessionProfileAction(p, 'delete')}
                              className="text-[0.65rem] font-bold uppercase tracking-wider text-rose-400 hover:brightness-110"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[var(--shell-muted)]">No profiles saved.</p>
                    )}
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-6">Imported Jars</h2>
                  <div className="space-y-3">
                    {(vault?.cookieJars ?? []).map((jar) => (
                      <div key={jar.id} className="p-3 rounded-lg border border-white/5 bg-white/[0.01] flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-white">{jar.label}</p>
                          <p className="text-[0.65rem] text-[var(--shell-muted)]">{jar.cookieCount} cookies</p>
                        </div>
                        <button
                          onClick={() => void handleRevokeCookieJar(jar.id)}
                          className="text-[0.65rem] font-bold uppercase tracking-wider text-white/40 hover:text-white"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === 'captures' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
              <div className="space-y-6">
                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-6">Governed Capture</h2>
                  <div className="space-y-4">
                    <label className="block space-y-1.5">
                      <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">URL</span>
                      <input
                        value={form.url}
                        onChange={(e) => updateTestForm('url', e.target.value)}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        placeholder="https://..."
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">Agent</span>
                        <select
                          value={form.agentId}
                          onChange={(e) => updateTestForm('agentId', e.target.value)}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                        >
                          {enabledAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">Profile</span>
                        <select
                          value={form.sessionProfileId}
                          onChange={(e) => updateTestForm('sessionProfileId', e.target.value)}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                        >
                          <option value="">None</option>
                          {(vault?.sessionProfiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="pt-4 flex items-center gap-3">
                      <button
                        onClick={() => void handleTestRun()}
                        disabled={testRunning || !form.url.trim()}
                        className="rounded-lg bg-[var(--shell-accent)] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                      >
                        {testRunning ? 'Running...' : 'Start Capture'}
                      </button>
                    </div>
                  </div>
                </section>

                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-6">Trace History</h2>
                  <div className="space-y-2">
                    {history?.rows.map((trace) => (
                      <button
                        key={trace.runId}
                        onClick={() => void loadRun(trace.runId)}
                        className={[
                          'w-full p-4 rounded-xl border transition-all text-left',
                          selectedRunId === trace.runId
                            ? 'bg-white/5 border-white/20'
                            : 'bg-white/[0.01] border-white/5 hover:border-white/10'
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <p className="text-sm font-medium text-white">{trace.selectedTool ?? 'unknown'}</p>
                          <p className="text-[0.65rem] text-[var(--shell-muted)]">{formatRelativeTime(trace.createdAt)}</p>
                        </div>
                        <p className="truncate text-xs text-[var(--shell-muted)]">{trace.route?.urls[0] ?? 'No URL'}</p>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className={`${PANEL_CLASS} p-6`}>
                  <h2 className="text-lg font-medium text-white mb-6">Artifact Detail</h2>
                  {selectedArtifact ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">Size</p>
                          <p className="text-xs text-white mt-1">{selectedArtifact.sizeBytes} bytes</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[var(--shell-muted)]">Type</p>
                          <p className="text-xs text-white mt-1">{selectedArtifact.mimeType}</p>
                        </div>
                      </div>
                      <pre className="p-4 rounded-xl bg-black/40 border border-white/10 text-[0.7rem] text-white overflow-auto max-h-[400px]">
                        {selectedArtifact.contentPreview}
                      </pre>
                      <button
                        onClick={() => void handleDownloadArtifact()}
                        className="text-xs font-semibold text-[var(--shell-accent)] hover:underline"
                      >
                        Download full artifact
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--shell-muted)]">Select a trace to view artifacts.</p>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </LazyMotion>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${PANEL_SOFT_CLASS} p-4`}>
      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">{label}</p>
      <p className="mt-2 break-words text-sm leading-relaxed text-[var(--shell-text)]">{value}</p>
    </div>
  );
}

function BoundaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${PANEL_SOFT_CLASS} p-4`}>
      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--shell-text)]">{value}</p>
    </div>
  );
}
