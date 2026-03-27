import { describe, expect, it } from 'vitest';

import {
  buildOnboardingIdentityDraft,
  defaultCeoSystemPrompt,
  shouldHydrateOnboardingIdentityDraft,
  type OnboardingIdentityDraft
} from './onboardingIdentity';
import type { OnboardingStateRow } from '../app/types';

function createOnboardingState(overrides: Partial<OnboardingStateRow> = {}): OnboardingStateRow {
  return {
    status: 'in_progress',
    steps: [],
    blockers: [],
    evidence: {
      version: 1,
      ceoBaselineConfiguredAt: null,
      vaultLastValidatedAt: null,
      providerKeysCheckedAt: null,
      smokeRun: null
    },
    companyName: 'Acme Labs',
    ceoAgentId: 'ceo-acme-labs',
    ceoName: 'Acme Labs Command',
    ceoTitle: 'Chief Orchestrator',
    ceoSystemPrompt: 'Lead Acme Labs with precision.',
    providerKeys: {
      openrouter: false,
      google: false,
      telegram: false,
      voyage: false,
      github: false,
      hasAtLeastOneKey: false,
      hasRequiredSet: false
    },
    ...overrides
  };
}

describe('onboarding identity hydration', () => {
  it('hydrates custom identity fields from onboarding state', () => {
    const draft = buildOnboardingIdentityDraft(createOnboardingState());

    expect(draft).toEqual({
      companyName: 'Acme Labs',
      ceoName: 'Acme Labs Command',
      ceoTitle: 'Chief Orchestrator',
      ceoSystemPrompt: 'Lead Acme Labs with precision.'
    });
  });

  it('falls back to defaults when onboarding identity fields are missing', () => {
    const draft = buildOnboardingIdentityDraft(
      createOnboardingState({
        companyName: 'Northwind',
        ceoName: null,
        ceoTitle: null,
        ceoSystemPrompt: null
      })
    );

    expect(draft).toEqual({
      companyName: 'Northwind',
      ceoName: 'Northwind CEO',
      ceoTitle: 'Chief Executive Agent',
      ceoSystemPrompt: defaultCeoSystemPrompt('Northwind')
    });
  });

  it('keeps dirty local drafts when a fresh onboarding snapshot arrives', () => {
    const lastHydratedDraft = buildOnboardingIdentityDraft(createOnboardingState());
    const currentDraft: OnboardingIdentityDraft = {
      ...lastHydratedDraft,
      companyName: 'Acme Labs Draft'
    };

    expect(shouldHydrateOnboardingIdentityDraft(currentDraft, lastHydratedDraft)).toBe(false);
  });

  it('allows refresh hydration when local drafts still match the last synced snapshot', () => {
    const lastHydratedDraft = buildOnboardingIdentityDraft(createOnboardingState());

    expect(shouldHydrateOnboardingIdentityDraft(lastHydratedDraft, lastHydratedDraft)).toBe(true);
    expect(shouldHydrateOnboardingIdentityDraft(lastHydratedDraft, null)).toBe(true);
  });
});
