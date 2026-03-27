import { describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { WebFetchService, buildStructuredBrowserSummary } from '../../src/web-fetch-service.js';

describe('web fetch service', () => {
  it('derives stable cache keys and intent-aware cache TTLs', () => {
    const db = new ControlPlaneDatabase(':memory:');
    db.migrate();

    const service = new WebFetchService(db, {
      executable: 'scrapling'
    });

    expect(
      service.resolveCacheTtlMs({
        url: 'https://carvalh0.xyz/',
        intent: 'article_read'
      })
    ).toBe(600_000);
    expect(
      service.resolveCacheTtlMs({
        url: 'https://x.com/openai',
        intent: 'monitor'
      })
    ).toBe(60_000);
    expect(
      service.resolveMainContentOnly({
        url: 'https://docs.example.com',
        intent: 'document_lookup'
      })
    ).toBe(true);

    const cacheKey = service.cacheKey({
      tool: 'fetch',
      url: 'https://www.tiktok.com/@minilanoy',
      request: {
        url: 'https://www.tiktok.com/@minilanoy',
        intent: 'structured_extract',
        extractorId: 'tiktok_profile'
      },
      session: {
        sessionProfile: null,
        cookieJar: null,
        headerProfile: null,
        proxyProfile: null,
        storageState: null,
        cookies: [],
        headers: {},
        proxyUrl: null,
        useRealChrome: false,
        locale: 'en-US',
        countryCode: 'CH',
        timezoneId: 'Europe/Zurich'
      }
    });

    expect(cacheKey).toHaveLength(64);
    db.close();
  });

  it('builds structured summaries for both social metrics and generic content', () => {
    expect(
      buildStructuredBrowserSummary('minilanoy\n514\nFollowing\n3699\nFollowers\n114.8K\nLikes', {
        url: 'https://www.tiktok.com/@minilanoy',
        extractorId: 'tiktok_profile'
      })
    ).toMatchObject({
      extractorId: 'tiktok_profile',
      confidence: 'high',
      fields: [
        { key: 'following', label: 'Following', value: '514' },
        { key: 'followers', label: 'Followers', value: '3699' },
        { key: 'likes', label: 'Likes', value: '114.8K' }
      ]
    });

    expect(
      buildStructuredBrowserSummary('dcarvalho.\nHomelab and VPS Hybrid Infrastructure Overview', {
        url: 'https://carvalh0.xyz/'
      })
    ).toMatchObject({
      extractorId: 'blog'
    });
  });
});
