export const SCRAPLING_BROWSER_TOOLS = [
  'get',
  'bulk_get',
  'fetch',
  'bulk_fetch',
  'stealthy_fetch',
  'bulk_stealthy_fetch'
] as const;

export type BrowserProviderId = 'scrapling';
export type BrowserTransportMode = 'stdio' | 'http';
export type BrowserHealthState = 'disabled' | 'ready' | 'degraded' | 'missing_dependency' | 'misconfigured';
export type BrowserExtractionMode = 'markdown' | 'html' | 'text';
export type BrowserToolName = (typeof SCRAPLING_BROWSER_TOOLS)[number];
export type BrowserExtractorId =
  | 'generic'
  | 'article'
  | 'blog'
  | 'reddit_listing'
  | 'tiktok_profile'
  | 'tiktok_video'
  | 'x_profile'
  | 'pinterest_pin';
export type BrowserIntent =
  | 'article_read'
  | 'document_lookup'
  | 'structured_extract'
  | 'dynamic_app'
  | 'monitor'
  | 'download_probe';
export type BrowserPromptInjectionEscalation = 'annotate' | 'require_confirmation' | 'block';
export type BrowserSelectorStrategy = 'document' | 'selector_first';
export type BrowserRiskClass = 'low' | 'medium' | 'high';

export interface BrowserCapabilityPolicy {
  allowedDomains: string[];
  deniedDomains: string[];
  allowProxy: boolean;
  allowStealth: boolean;
  allowVisibleBrowser: boolean;
  allowFileDownloads: boolean;
  distrustThirdPartyContent: boolean;
  promptInjectionEscalation: BrowserPromptInjectionEscalation;
  requireApprovalForStealth: boolean;
  requireApprovalForDownloads: boolean;
  requireApprovalForVisibleBrowser: boolean;
  requireApprovalForProxy: boolean;
}

export interface BrowserProviderCapabilityContract {
  schema: 'ops.browser-capability.v1';
  version: 1;
  provider: BrowserProviderId;
  operatorFacingName: string;
  supportedTransports: BrowserTransportMode[];
  defaultTransport: BrowserTransportMode;
  artifactSchema: {
    handleKind: 'browser_artifact';
    previewFields: Array<'url' | 'tool' | 'selector' | 'extractionMode' | 'fallbackReason' | 'previewText'>;
    durableFields: Array<'provider' | 'transport' | 'artifactPath' | 'capturedAt'>;
  };
  providerBoundaries: {
    supportsVisualBrowser: boolean;
    supportsProxy: boolean;
    supportsStealth: boolean;
    supportsFileDownloads: boolean;
    reusableOperatorContract: boolean;
    futureProviders: string[];
  };
  installDoctor: {
    installCommands: string[];
    dockerSupport: string[];
    requiredBinaries: string[];
    optionalBinaries: string[];
  };
  toolIntents: Record<
    BrowserToolName,
    {
      batch: boolean;
      extractionModes: BrowserExtractionMode[];
      useCase: string;
    }
  >;
}

export interface BrowserPolicyAssessment {
  allowed: boolean;
  requiresApproval: boolean;
  reasons: string[];
  blockedReason: string | null;
}

export interface BrowserRoutingInput {
  url: string;
  intent: BrowserIntent;
  extractionMode?: BrowserExtractionMode | null;
  batch?: boolean;
  mainContentOnly?: boolean;
  cacheTtlMs?: number | null;
  extractorId?: BrowserExtractorId | null;
  dynamicLikely?: boolean;
  requiresStealth?: boolean;
  requiresProxy?: boolean;
  requiresVisibleBrowser?: boolean;
  requiresDownload?: boolean;
  selector?: string | null;
  waitSelector?: string | null;
  locale?: string | null;
  timezoneId?: string | null;
  countryCode?: string | null;
  verifyTls?: boolean | null;
  extraHeaders?: Record<string, string> | null;
  extraCookies?: Record<string, string> | null;
  proxyUrl?: string | null;
  useRealChrome?: boolean;
  sessionProfileId?: string | null;
  cookieJarId?: string | null;
  headersProfileId?: string | null;
  proxyProfileId?: string | null;
  storageStateId?: string | null;
  suspiciousPromptInjection?: boolean;
}

export interface BrowserRoutingDecision {
  provider: BrowserProviderId;
  transport: BrowserTransportMode;
  primaryTool: BrowserToolName;
  fallbackTools: BrowserToolName[];
  extractionMode: BrowserExtractionMode;
  selectorStrategy: BrowserSelectorStrategy;
  riskClass: BrowserRiskClass;
  requiresApproval: boolean;
  distrustPageInstructions: boolean;
  fallbackReason: string | null;
  blockedReason: string | null;
  policyReasons: string[];
}

export const DEFAULT_BROWSER_CAPABILITY_POLICY: BrowserCapabilityPolicy = {
  allowedDomains: [],
  deniedDomains: [],
  allowProxy: false,
  allowStealth: true,
  allowVisibleBrowser: false,
  allowFileDownloads: false,
  distrustThirdPartyContent: true,
  promptInjectionEscalation: 'annotate',
  requireApprovalForStealth: false,
  requireApprovalForDownloads: true,
  requireApprovalForVisibleBrowser: true,
  requireApprovalForProxy: true
};

export const SCRAPLING_BROWSER_CAPABILITY_CONTRACT: BrowserProviderCapabilityContract = {
  schema: 'ops.browser-capability.v1',
  version: 1,
  provider: 'scrapling',
  operatorFacingName: 'Scrapling Browser Capability',
  supportedTransports: ['stdio', 'http'],
  defaultTransport: 'stdio',
  artifactSchema: {
    handleKind: 'browser_artifact',
    previewFields: ['url', 'tool', 'selector', 'extractionMode', 'fallbackReason', 'previewText'],
    durableFields: ['provider', 'transport', 'artifactPath', 'capturedAt']
  },
  providerBoundaries: {
    supportsVisualBrowser: true,
    supportsProxy: true,
    supportsStealth: true,
    supportsFileDownloads: false,
    reusableOperatorContract: true,
    futureProviders: ['playwright', 'openai-computer-use', 'vm-browser']
  },
  installDoctor: {
    installCommands: ['pip install "scrapling[ai]"', 'scrapling install'],
    dockerSupport: [
      'Bake Scrapling plus browser dependencies into the image when browser capability is required.',
      'Keep browser capability optional so gateway startup can degrade cleanly when Scrapling is absent.'
    ],
    requiredBinaries: ['scrapling'],
    optionalBinaries: ['python3', 'uv']
  },
  toolIntents: {
    get: {
      batch: false,
      extractionModes: ['markdown', 'html', 'text'],
      useCase: 'Static or mostly static single-page retrieval.'
    },
    bulk_get: {
      batch: true,
      extractionModes: ['markdown', 'html', 'text'],
      useCase: 'Static multi-URL retrieval with one lightweight pass.'
    },
    fetch: {
      batch: false,
      extractionModes: ['markdown', 'html', 'text'],
      useCase: 'Dynamic single-page retrieval when lightweight fetch is insufficient.'
    },
    bulk_fetch: {
      batch: true,
      extractionModes: ['markdown', 'html', 'text'],
      useCase: 'Dynamic multi-URL retrieval for batched monitoring or enrichment.'
    },
    stealthy_fetch: {
      batch: false,
      extractionModes: ['markdown', 'html', 'text'],
      useCase: 'Higher-friction dynamic retrieval when anti-bot behavior requires stealth.'
    },
    bulk_stealthy_fetch: {
      batch: true,
      extractionModes: ['markdown', 'html', 'text'],
      useCase: 'Stealth-enabled multi-URL retrieval under explicit policy.'
    }
  }
};

export function assessBrowserPolicy(
  input: BrowserRoutingInput,
  policy: BrowserCapabilityPolicy = DEFAULT_BROWSER_CAPABILITY_POLICY
): BrowserPolicyAssessment {
  const reasons: string[] = [];
  const host = normalizeUrlHost(input.url);
  const allowedRules = normalizeDomainRules(policy.allowedDomains);
  const deniedRules = normalizeDomainRules(policy.deniedDomains);

  if (matchesDomainRule(host, deniedRules)) {
    return {
      allowed: false,
      requiresApproval: false,
      reasons: [`domain ${host} denied by policy`],
      blockedReason: 'domain_denied'
    };
  }

  if (allowedRules.length > 0 && !matchesDomainRule(host, allowedRules)) {
    return {
      allowed: false,
      requiresApproval: false,
      reasons: [`domain ${host} is outside the browser allowlist`],
      blockedReason: 'domain_not_allowed'
    };
  }

  if (input.requiresProxy && !policy.allowProxy) {
    return {
      allowed: false,
      requiresApproval: false,
      reasons: ['proxy use is disabled by policy'],
      blockedReason: 'proxy_blocked'
    };
  }

  if (input.requiresStealth && !policy.allowStealth) {
    return {
      allowed: false,
      requiresApproval: false,
      reasons: ['stealth mode is disabled by policy'],
      blockedReason: 'stealth_blocked'
    };
  }

  if (input.requiresVisibleBrowser && !policy.allowVisibleBrowser) {
    return {
      allowed: false,
      requiresApproval: false,
      reasons: ['visible-browser mode is disabled by policy'],
      blockedReason: 'visible_browser_blocked'
    };
  }

  if (input.requiresDownload && !policy.allowFileDownloads) {
    return {
      allowed: false,
      requiresApproval: false,
      reasons: ['file downloads are disabled by policy'],
      blockedReason: 'downloads_blocked'
    };
  }

  let requiresApproval = false;
  if (input.requiresProxy && policy.requireApprovalForProxy) {
    reasons.push('proxy path requires approval');
    requiresApproval = true;
  }
  if (input.requiresStealth && policy.requireApprovalForStealth) {
    reasons.push('stealth path requires approval');
    requiresApproval = true;
  } else if (input.requiresStealth) {
    reasons.push('explicit stealth request requires approval');
    requiresApproval = true;
  }
  if (input.requiresVisibleBrowser && policy.requireApprovalForVisibleBrowser) {
    reasons.push('visible-browser path requires approval');
    requiresApproval = true;
  }
  if (input.requiresDownload && policy.requireApprovalForDownloads) {
    reasons.push('download path requires approval');
    requiresApproval = true;
  }

  if (input.suspiciousPromptInjection && policy.distrustThirdPartyContent) {
    if (policy.promptInjectionEscalation === 'block') {
      return {
        allowed: false,
        requiresApproval: false,
        reasons: ['third-party page instructions flagged as prompt injection'],
        blockedReason: 'prompt_injection_detected'
      };
    }
    reasons.push('treat third-party page instructions as untrusted');
    if (policy.promptInjectionEscalation === 'require_confirmation') {
      reasons.push('prompt injection escalation requires confirmation');
      requiresApproval = true;
    }
  }

  return {
    allowed: true,
    requiresApproval,
    reasons,
    blockedReason: null
  };
}

export function planBrowserRoute(
  input: BrowserRoutingInput,
  options?: {
    policy?: BrowserCapabilityPolicy;
    transport?: BrowserTransportMode;
  }
): BrowserRoutingDecision {
  const policy = options?.policy ?? DEFAULT_BROWSER_CAPABILITY_POLICY;
  const assessment = assessBrowserPolicy(input, policy);
  const selectorStrategy: BrowserSelectorStrategy = input.selector && input.selector.trim() ? 'selector_first' : 'document';
  const batch = input.batch === true;
  const extractionMode = input.extractionMode ?? 'markdown';
  const fallbackTools: BrowserToolName[] = [];
  let fallbackReason: string | null = null;
  let blockedReason = assessment.blockedReason;
  const hasSessionState =
    input.sessionProfileId != null ||
    input.cookieJarId != null ||
    input.headersProfileId != null ||
    input.proxyProfileId != null ||
    input.storageStateId != null ||
    (input.extraCookies !== null && input.extraCookies !== undefined && Object.keys(input.extraCookies).length > 0) ||
    (input.extraHeaders !== null && input.extraHeaders !== undefined && Object.keys(input.extraHeaders).length > 0);
  const prefersBrowserRuntime = input.useRealChrome === true || hasSessionState;

  if (input.dynamicLikely || input.intent === 'dynamic_app' || input.intent === 'monitor' || prefersBrowserRuntime) {
    fallbackTools.push(batch ? 'bulk_fetch' : 'fetch');
    fallbackReason = prefersBrowserRuntime
      ? input.useRealChrome === true
        ? 'installed_browser_session_requires_dynamic_fetch'
        : 'authenticated_session_requires_dynamic_fetch'
      : 'lightweight_get_first_then_dynamic_fetch';
  }

  const adaptiveStealthAllowed =
    (input.dynamicLikely || input.intent === 'dynamic_app' || input.intent === 'monitor') &&
    policy.allowStealth &&
    !policy.requireApprovalForStealth;
  if (input.requiresStealth || adaptiveStealthAllowed) {
    fallbackTools.push(batch ? 'bulk_stealthy_fetch' : 'stealthy_fetch');
    fallbackReason =
      fallbackReason ??
      (input.requiresStealth ? 'stealth_required_by_target' : 'adaptive_stealth_escalation_enabled');
  }

  if (input.requiresVisibleBrowser && !SCRAPLING_BROWSER_CAPABILITY_CONTRACT.providerBoundaries.supportsVisualBrowser) {
    blockedReason = blockedReason ?? 'visible_browser_not_supported_by_provider';
  }

  return {
    provider: 'scrapling',
    transport: options?.transport ?? 'stdio',
    primaryTool: prefersBrowserRuntime ? (batch ? 'bulk_fetch' : 'fetch') : batch ? 'bulk_get' : 'get',
    fallbackTools: dedupeTools(fallbackTools, prefersBrowserRuntime ? (batch ? 'bulk_fetch' : 'fetch') : batch ? 'bulk_get' : 'get'),
    extractionMode,
    selectorStrategy,
    riskClass: deriveBrowserRiskClass(input),
    requiresApproval: assessment.requiresApproval || blockedReason === 'visible_browser_not_supported_by_provider',
    distrustPageInstructions: policy.distrustThirdPartyContent,
    fallbackReason,
    blockedReason,
    policyReasons: assessment.reasons
  };
}

function deriveBrowserRiskClass(input: BrowserRoutingInput): BrowserRiskClass {
  if (input.requiresVisibleBrowser || input.requiresDownload || input.requiresProxy) {
    return 'high';
  }
  if (
    input.requiresStealth ||
    input.dynamicLikely ||
    input.useRealChrome ||
    input.sessionProfileId ||
    input.cookieJarId ||
    input.headersProfileId ||
    input.storageStateId ||
    (input.extraCookies && Object.keys(input.extraCookies).length > 0) ||
    (input.extraHeaders && Object.keys(input.extraHeaders).length > 0)
  ) {
    return 'medium';
  }
  return 'low';
}

function dedupeTools(tools: BrowserToolName[], primaryTool: BrowserToolName): BrowserToolName[] {
  return Array.from(new Set(tools)).filter((tool) => tool !== primaryTool);
}

function normalizeUrlHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeDomainRules(rules: string[]): string[] {
  return Array.from(
    new Set(
      rules
        .map((rule) => String(rule).trim().toLowerCase())
        .filter((rule) => rule.length > 0)
        .map((rule) => rule.replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '.'))
    )
  );
}

function matchesDomainRule(host: string, rules: string[]): boolean {
  if (!host) {
    return false;
  }
  return rules.some((rule) => host === rule || host.endsWith(rule.startsWith('.') ? rule : `.${rule}`));
}
