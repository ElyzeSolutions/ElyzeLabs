import type { OnboardingStateRow } from '../app/types';

export interface OnboardingIdentityDraft {
  companyName: string;
  ceoName: string;
  ceoTitle: string;
  ceoSystemPrompt: string;
}

export function defaultCeoSystemPrompt(companyNameRaw: string): string {
  const companyName = companyNameRaw.trim().length > 0 ? companyNameRaw.trim() : 'Company';
  return [
    `You are the CEO agent for ${companyName}.`,
    'Coordinate teams, unblock people quickly, and delegate implementation to the right specialists when execution is requested.',
    'For direct factual questions, answer the user directly in sentence 1.',
    'If asked model identity, disclose the actual runtime and model selected for the current run.',
    'Do not simulate internal company theater unless explicitly asked to roleplay.',
    'If unknown, say exactly what is unknown and avoid invented process language.'
  ].join('\n');
}

export function buildOnboardingIdentityDraft(onboarding: OnboardingStateRow): OnboardingIdentityDraft {
  const companyName = onboarding.companyName?.trim().length ? onboarding.companyName : 'Company';
  return {
    companyName,
    ceoName: onboarding.ceoName?.trim().length ? onboarding.ceoName : `${companyName} CEO`,
    ceoTitle: onboarding.ceoTitle?.trim().length ? onboarding.ceoTitle : 'Chief Executive Agent',
    ceoSystemPrompt: onboarding.ceoSystemPrompt?.trim().length
      ? onboarding.ceoSystemPrompt
      : defaultCeoSystemPrompt(companyName)
  };
}

export function onboardingIdentityDraftsEqual(
  left: OnboardingIdentityDraft | null,
  right: OnboardingIdentityDraft | null
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.companyName === right.companyName &&
    left.ceoName === right.ceoName &&
    left.ceoTitle === right.ceoTitle &&
    left.ceoSystemPrompt === right.ceoSystemPrompt
  );
}

export function shouldHydrateOnboardingIdentityDraft(
  currentDraft: OnboardingIdentityDraft,
  lastHydratedDraft: OnboardingIdentityDraft | null
): boolean {
  return lastHydratedDraft === null || onboardingIdentityDraftsEqual(currentDraft, lastHydratedDraft);
}
