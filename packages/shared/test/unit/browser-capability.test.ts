import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BROWSER_CAPABILITY_POLICY,
  SCRAPLING_BROWSER_CAPABILITY_CONTRACT,
  assessBrowserPolicy,
  planBrowserRoute
} from '../../src/index.ts';

describe('browser capability contract', () => {
  it('routes a simple article read through lightweight get with markdown extraction', () => {
    const decision = planBrowserRoute({
      url: 'https://example.com/blog/post',
      intent: 'article_read'
    });

    expect(decision.provider).toBe('scrapling');
    expect(decision.transport).toBe('stdio');
    expect(decision.primaryTool).toBe('get');
    expect(decision.fallbackTools).toEqual([]);
    expect(decision.extractionMode).toBe('markdown');
    expect(decision.selectorStrategy).toBe('document');
    expect(decision.riskClass).toBe('low');
    expect(decision.blockedReason).toBeNull();
  });

  it('starts dynamic retrieval with get and escalates to fetch then stealth when policy allows it', () => {
    const decision = planBrowserRoute(
      {
        url: 'https://app.example.com/dashboard',
        intent: 'dynamic_app',
        dynamicLikely: true,
        requiresStealth: true,
        selector: '[data-test=\"report\"]'
      },
      {
        policy: {
          ...DEFAULT_BROWSER_CAPABILITY_POLICY,
          allowStealth: true
        }
      }
    );

    expect(decision.primaryTool).toBe('get');
    expect(decision.fallbackTools).toEqual(['fetch', 'stealthy_fetch']);
    expect(decision.selectorStrategy).toBe('selector_first');
    expect(decision.riskClass).toBe('medium');
    expect(decision.requiresApproval).toBe(true);
    expect(decision.fallbackReason).toBe('lightweight_get_first_then_dynamic_fetch');
  });

  it('blocks denied domains and escalates prompt injection when configured', () => {
    const blocked = assessBrowserPolicy(
      {
        url: 'https://blocked.example.com/report',
        intent: 'document_lookup'
      },
      {
        ...DEFAULT_BROWSER_CAPABILITY_POLICY,
        deniedDomains: ['blocked.example.com']
      }
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockedReason).toBe('domain_denied');

    const injection = assessBrowserPolicy(
      {
        url: 'https://example.com/report',
        intent: 'document_lookup',
        suspiciousPromptInjection: true
      },
      {
        ...DEFAULT_BROWSER_CAPABILITY_POLICY,
        promptInjectionEscalation: 'block'
      }
    );
    expect(injection.allowed).toBe(false);
    expect(injection.blockedReason).toBe('prompt_injection_detected');
  });

  it('keeps risky proxy and stealth requests behind approval when policy allows them', () => {
    const decision = planBrowserRoute(
      {
        url: 'https://example.com/research',
        intent: 'dynamic_app',
        dynamicLikely: true,
        requiresProxy: true,
        requiresStealth: true
      },
      {
        policy: {
          ...DEFAULT_BROWSER_CAPABILITY_POLICY,
          allowProxy: true,
          allowStealth: true,
          requireApprovalForProxy: true,
          requireApprovalForStealth: true
        }
      }
    );

    expect(decision.blockedReason).toBeNull();
    expect(decision.requiresApproval).toBe(true);
    expect(decision.fallbackTools).toContain('stealthy_fetch');
  });

  it('documents provider boundaries so future browser backends can reuse the same operator contract', () => {
    expect(SCRAPLING_BROWSER_CAPABILITY_CONTRACT.schema).toBe('ops.browser-capability.v1');
    expect(SCRAPLING_BROWSER_CAPABILITY_CONTRACT.providerBoundaries.reusableOperatorContract).toBe(true);
    expect(SCRAPLING_BROWSER_CAPABILITY_CONTRACT.providerBoundaries.futureProviders).toContain('playwright');
    expect(SCRAPLING_BROWSER_CAPABILITY_CONTRACT.toolIntents.get.extractionModes).toContain('markdown');
  });
});
