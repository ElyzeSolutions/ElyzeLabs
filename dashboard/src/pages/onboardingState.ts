import type {
  OnboardingProviderLiveDiagnosticsRow,
  VendorBootstrapDiagnosticsRow,
  VendorBootstrapResultRow
} from '../app/types';

export type AuthDraftState = {
  tokenDraft: {
    value: string;
    dirty: boolean;
  };
  generatedApiToken: string | null;
  awaitingGatewayRestart: boolean;
};

export type VaultDraftState = {
  material: string;
  generatedMaterial: string | null;
  generatedMaterialSaved: boolean;
};

export type ProviderDraftState = {
  openrouterKey: string;
  googleKey: string;
  telegramToken: string;
  voyageKey: string;
};

export type UiState = {
  loading: boolean;
  busyAction: string | null;
  error: string | null;
  notice: string | null;
};

type OnboardingPageDraftState = {
  providerLiveDiagnostics: OnboardingProviderLiveDiagnosticsRow | null;
  vendorBootstrap: VendorBootstrapDiagnosticsRow | null;
  bootstrapResult: VendorBootstrapResultRow | null;
  vaultDraft: VaultDraftState;
  providerDraft: ProviderDraftState;
  authDraftState: AuthDraftState;
  uiState: UiState;
};

type OnboardingPageDraftPatch =
  | Partial<OnboardingPageDraftState>
  | ((current: OnboardingPageDraftState) => Partial<OnboardingPageDraftState>);

export function onboardingPageDraftReducer(
  current: OnboardingPageDraftState,
  patch: OnboardingPageDraftPatch
): OnboardingPageDraftState {
  const nextPatch = typeof patch === 'function' ? patch(current) : patch;
  return {
    ...current,
    ...nextPatch
  };
}

export function generateLocalHexToken(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function generateLocalVaultMaterial(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
