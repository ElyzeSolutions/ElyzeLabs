import type {
  BrowserCookieJarRecord,
  BrowserHeaderProfileRecord,
  BrowserProxyProfileRecord,
  BrowserSessionProfileRecord,
  BrowserStorageStateRecord
} from '@ops/shared';
import { parseJsonSafe } from '@ops/shared';

import type { ControlPlaneDatabase } from '@ops/db';

export interface BrowserCookieEntry {
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

export interface ResolvedBrowserSessionState {
  sessionProfile: BrowserSessionProfileRecord | null;
  cookieJar: BrowserCookieJarRecord | null;
  headerProfile: BrowserHeaderProfileRecord | null;
  proxyProfile: BrowserProxyProfileRecord | null;
  storageState: BrowserStorageStateRecord | null;
  cookies: BrowserCookieEntry[];
  headers: Record<string, string>;
  proxyUrl: string | null;
  useRealChrome: boolean;
  locale: string | null;
  countryCode: string | null;
  timezoneId: string | null;
}

export class BrowserSessionVault {
  constructor(private readonly database: ControlPlaneDatabase) {}

  importCookieJar(input: {
    id: string;
    label: string;
    domains?: string[];
    sourceKind: BrowserCookieJarRecord['sourceKind'];
    raw: string;
    notes?: string | null;
  }): BrowserCookieJarRecord {
    let parsedCookies: BrowserCookieEntry[];
    if (input.sourceKind === 'netscape_cookies_txt') {
      parsedCookies = parseNetscapeCookies(input.raw);
    } else if (input.sourceKind === 'json_cookie_export') {
      parsedCookies = parseCookieJson(input.raw, input.domains?.[0] ?? null);
    } else {
      parsedCookies = parseCookieHeader(input.raw, input.domains?.[0] ?? null);
    }
    const inferredDomains = input.domains && input.domains.length > 0 ? input.domains : inferDomainsFromCookies(parsedCookies);
    return this.database.upsertBrowserCookieJar({
      id: input.id,
      label: input.label,
      domains: inferredDomains,
      sourceKind: input.sourceKind,
      cookies: parsedCookies,
      notes: input.notes ?? null
    });
  }

  saveCookieJar(input: {
    id: string;
    label: string;
    domains?: string[];
    sourceKind: BrowserCookieJarRecord['sourceKind'];
    cookies: BrowserCookieEntry[];
    notes?: string | null;
  }): BrowserCookieJarRecord {
    const inferredDomains = input.domains && input.domains.length > 0 ? input.domains : inferDomainsFromCookies(input.cookies);
    return this.database.upsertBrowserCookieJar({
      id: input.id,
      label: input.label,
      domains: inferredDomains,
      sourceKind: input.sourceKind,
      cookies: input.cookies,
      notes: input.notes ?? null
    });
  }

  upsertHeaderProfile(input: {
    id: string;
    label: string;
    domains: string[];
    headers: Record<string, string>;
    notes?: string | null;
  }): BrowserHeaderProfileRecord {
    return this.database.upsertBrowserHeaderProfile({
      id: input.id,
      label: input.label,
      domains: input.domains,
      headers: normalizeHeaderMap(input.headers),
      notes: input.notes ?? null
    });
  }

  upsertProxyProfile(input: {
    id: string;
    label: string;
    domains: string[];
    proxy: {
      server: string;
      username?: string | null;
      password?: string | null;
    };
    notes?: string | null;
  }): BrowserProxyProfileRecord {
    return this.database.upsertBrowserProxyProfile({
      id: input.id,
      label: input.label,
      domains: input.domains,
      proxy: {
        server: input.proxy.server,
        username: input.proxy.username ?? null,
        password: input.proxy.password ?? null
      },
      notes: input.notes ?? null
    });
  }

  upsertStorageState(input: {
    id: string;
    label: string;
    domains: string[];
    storageState: Record<string, unknown>;
    notes?: string | null;
  }): BrowserStorageStateRecord {
    return this.database.upsertBrowserStorageState({
      id: input.id,
      label: input.label,
      domains: input.domains,
      storageState: input.storageState,
      notes: input.notes ?? null
    });
  }

  upsertSessionProfile(input: {
    id: string;
    label: string;
    domains: string[];
    cookieJarId?: string | null;
    headersProfileId?: string | null;
    proxyProfileId?: string | null;
    storageStateId?: string | null;
    useRealChrome?: boolean;
    ownerLabel?: string | null;
    visibility?: BrowserSessionProfileRecord['visibility'];
    allowedSessionIds?: string[];
    siteKey?: string | null;
    browserKind?: BrowserSessionProfileRecord['browserKind'];
    browserProfileName?: string | null;
    browserProfilePath?: string | null;
    locale?: string | null;
    countryCode?: string | null;
    timezoneId?: string | null;
    notes?: string | null;
    enabled?: boolean;
    lastVerifiedAt?: string | null;
    lastVerificationStatus?: BrowserSessionProfileRecord['lastVerificationStatus'];
    lastVerificationSummary?: string | null;
  }): BrowserSessionProfileRecord {
    return this.database.upsertBrowserSessionProfile({
      id: input.id,
      label: input.label,
      domains: input.domains,
      cookieJarId: input.cookieJarId ?? null,
      headersProfileId: input.headersProfileId ?? null,
      proxyProfileId: input.proxyProfileId ?? null,
      storageStateId: input.storageStateId ?? null,
      useRealChrome: input.useRealChrome === true,
      ownerLabel: input.ownerLabel ?? null,
      visibility: input.visibility ?? 'shared',
      allowedSessionIds: input.allowedSessionIds ?? [],
      siteKey: input.siteKey ?? null,
      browserKind: input.browserKind ?? null,
      browserProfileName: input.browserProfileName ?? null,
      browserProfilePath: input.browserProfilePath ?? null,
      locale: input.locale ?? null,
      countryCode: input.countryCode ?? null,
      timezoneId: input.timezoneId ?? null,
      notes: input.notes ?? null,
      enabled: input.enabled ?? true,
      lastVerifiedAt: input.lastVerifiedAt ?? null,
      lastVerificationStatus: input.lastVerificationStatus ?? 'unknown',
      lastVerificationSummary: input.lastVerificationSummary ?? null
    });
  }

  resolveForRequest(input: {
    url: string;
    sessionProfileId?: string | null;
    cookieJarId?: string | null;
    headersProfileId?: string | null;
    proxyProfileId?: string | null;
    storageStateId?: string | null;
    extraHeaders?: Record<string, string> | null;
    extraCookies?: Record<string, string> | null;
    locale?: string | null;
    countryCode?: string | null;
    timezoneId?: string | null;
    proxyUrl?: string | null;
    useRealChrome?: boolean | null;
  }): ResolvedBrowserSessionState {
    const urlHost = safeHost(input.url);
    const sessionProfile =
      input.sessionProfileId && input.sessionProfileId.trim().length > 0
        ? this.database.getBrowserSessionProfileById(input.sessionProfileId.trim())
        : null;
    const cookieJar =
      input.cookieJarId && input.cookieJarId.trim().length > 0
        ? this.database.getBrowserCookieJarById(input.cookieJarId.trim())
        : sessionProfile?.cookieJarId
          ? this.database.getBrowserCookieJarById(sessionProfile.cookieJarId)
          : null;
    const headerProfile =
      input.headersProfileId && input.headersProfileId.trim().length > 0
        ? this.database.getBrowserHeaderProfileById(input.headersProfileId.trim())
        : sessionProfile?.headersProfileId
          ? this.database.getBrowserHeaderProfileById(sessionProfile.headersProfileId)
          : null;
    const proxyProfile =
      input.proxyProfileId && input.proxyProfileId.trim().length > 0
        ? this.database.getBrowserProxyProfileById(input.proxyProfileId.trim())
        : sessionProfile?.proxyProfileId
          ? this.database.getBrowserProxyProfileById(sessionProfile.proxyProfileId)
          : null;
    const storageState =
      input.storageStateId && input.storageStateId.trim().length > 0
        ? this.database.getBrowserStorageStateById(input.storageStateId.trim())
        : sessionProfile?.storageStateId
          ? this.database.getBrowserStorageStateById(sessionProfile.storageStateId)
          : null;

    const cookies = [
      ...filterCookieEntriesForHost(readCookieEntries(cookieJar), urlHost),
      ...Object.entries(input.extraCookies ?? {}).map(([name, value]) => ({
        name,
        value
      }))
    ];
    const headers = {
      ...readHeaderEntries(headerProfile),
      ...normalizeHeaderMap(input.extraHeaders ?? {})
    };
    const proxyUrl = input.proxyUrl?.trim() || readProxyUrl(proxyProfile);

    return {
      sessionProfile,
      cookieJar,
      headerProfile,
      proxyProfile,
      storageState,
      cookies,
      headers,
      proxyUrl,
      useRealChrome: input.useRealChrome === true || sessionProfile?.useRealChrome === true,
      locale: input.locale ?? sessionProfile?.locale ?? null,
      countryCode: input.countryCode ?? sessionProfile?.countryCode ?? null,
      timezoneId: input.timezoneId ?? sessionProfile?.timezoneId ?? null
    };
  }
}

export function cookiesToHeaderValue(cookies: BrowserCookieEntry[]): string | null {
  const parts = cookies
    .filter((entry) => entry.name.trim().length > 0)
    .map((entry) => `${entry.name.trim()}=${entry.value}`);
  return parts.length > 0 ? parts.join('; ') : null;
}

export function parseCookieHeader(raw: string, domainHint: string | null): BrowserCookieEntry[] {
  return raw
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.includes('='))
    .map((entry) => {
      const separator = entry.indexOf('=');
      return {
        name: entry.slice(0, separator).trim(),
        value: entry.slice(separator + 1).trim(),
        domain: domainHint,
        path: '/',
        secure: null,
        httpOnly: null,
        sameSite: null,
        expires: null
      } satisfies BrowserCookieEntry;
    })
    .filter((entry) => entry.name.length > 0);
}

export function parseNetscapeCookies(raw: string): BrowserCookieEntry[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split('\t'))
    .filter((columns) => columns.length >= 7)
    .map((columns) => {
      const [domain, , path, secure, expires, name, value] = columns;
      return {
        name: String(name ?? '').trim(),
        value: String(value ?? '').trim(),
        domain: String(domain ?? '').trim() || null,
        path: String(path ?? '/').trim() || '/',
        secure: String(secure ?? '').trim().toUpperCase() === 'TRUE',
        httpOnly: null,
        sameSite: null,
        expires: Number.isFinite(Number(expires)) ? Number(expires) : null
      } satisfies BrowserCookieEntry;
    })
    .filter((entry) => entry.name.length > 0);
}

export function parseCookieJson(raw: string, domainHint: string | null): BrowserCookieEntry[] {
  const parsed = parseJsonSafe<unknown>(raw, null);
  const value =
    isRecord(parsed) && Array.isArray(parsed.cookies)
      ? parsed.cookies
      : parsed;
  if (Array.isArray(value)) {
    const cookies: BrowserCookieEntry[] = [];
    for (const entry of value) {
      const normalized = normalizeCookieEntry(entry, domainHint);
      if (normalized) {
        cookies.push(normalized);
      }
    }
    return cookies;
  }
  if (isRecord(value)) {
    const cookies: BrowserCookieEntry[] = [];
    for (const [name, cookieValue] of Object.entries(value)) {
      if (typeof cookieValue !== 'string' || name.trim().length === 0 || cookieValue.trim().length === 0) {
        continue;
      }
      cookies.push({
        name: name.trim(),
        value: cookieValue.trim(),
        domain: domainHint,
        path: '/',
        secure: null,
        httpOnly: null,
        sameSite: null,
        expires: null
      });
    }
    return cookies;
  }
  return [];
}

export function inferDomainsFromCookies(cookies: BrowserCookieEntry[]): string[] {
  return Array.from(
    new Set(
      cookies
        .map((entry) => normalizeDomain(entry.domain))
        .filter((entry): entry is string => Boolean(entry))
    )
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeDomain(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim().replace(/^\./, '').toLowerCase();
}

function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function filterCookieEntriesForHost(cookies: BrowserCookieEntry[], host: string): BrowserCookieEntry[] {
  if (!host) {
    return cookies;
  }
  return cookies.filter((entry) => {
    const domain = normalizeDomain(entry.domain);
    return !domain || hostMatchesDomain(host, domain);
  });
}

function readCookieEntries(record: BrowserCookieJarRecord | null): BrowserCookieEntry[] {
  return record ? parseJsonSafe<BrowserCookieEntry[]>(record.cookiesJson, []) : [];
}

function readHeaderEntries(record: BrowserHeaderProfileRecord | null): Record<string, string> {
  return record ? normalizeHeaderMap(parseJsonSafe<Record<string, string>>(record.headersJson, {})) : {};
}

function readProxyUrl(record: BrowserProxyProfileRecord | null): string | null {
  if (!record) {
    return null;
  }
  const proxy = parseJsonSafe<Record<string, unknown>>(record.proxyJson, {});
  return typeof proxy.server === 'string' && proxy.server.trim().length > 0 ? proxy.server.trim() : null;
}

function normalizeHeaderMap(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key.trim(), String(value).trim()] as const)
      .filter((entry): entry is readonly [string, string] => entry[0].length > 0 && entry[1].length > 0)
  );
}

function normalizeCookieEntry(value: unknown, domainHint: string | null): BrowserCookieEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const cookieValue = typeof value.value === 'string' ? value.value.trim() : '';
  if (!name || !cookieValue) {
    return null;
  }
  const sameSiteRaw = typeof value.sameSite === 'string' ? value.sameSite.trim().toLowerCase() : '';
  const sameSite =
    sameSiteRaw === 'lax'
      ? 'Lax'
      : sameSiteRaw === 'strict'
        ? 'Strict'
        : sameSiteRaw === 'none'
          ? 'None'
          : null;
  const expires =
    typeof value.expires === 'number' && Number.isFinite(value.expires)
      ? value.expires
      : typeof value.expirationDate === 'number' && Number.isFinite(value.expirationDate)
        ? value.expirationDate
        : null;
  return {
    name,
    value: cookieValue,
    domain: typeof value.domain === 'string' && value.domain.trim().length > 0 ? value.domain.trim() : domainHint,
    path: typeof value.path === 'string' && value.path.trim().length > 0 ? value.path.trim() : '/',
    secure: typeof value.secure === 'boolean' ? value.secure : null,
    httpOnly: typeof value.httpOnly === 'boolean' ? value.httpOnly : null,
    sameSite,
    expires,
    url: typeof value.url === 'string' && value.url.trim().length > 0 ? value.url.trim() : null
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
