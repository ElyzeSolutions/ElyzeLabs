import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { ArrowRight, ArrowsClockwise, Key, Copy } from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
  applyOnboardingCeoBaseline,
  bootstrapVendorAssets,
  bootstrapOnboardingVault,
  checkOnboardingProviderKeys,
  lockVault,
  resetEmptyVault,
  runOnboardingSmoke,
  testOnboardingProviderConnections,
  unlockOnboardingVault,
  upsertVaultSecret
} from '../app/api';
import {
  invalidateOnboardingReadQueries,
  onboardingStatusQueryOptions,
  toolsDiagnosticsQueryOptions,
  vaultStatusQueryOptions
} from '../app/queryOptions';
import { useAppStore } from '../app/store';
import type {
  OnboardingProviderLiveDiagnosticsRow,
  OnboardingStateRow,
  OnboardingStepRow,
  VaultStatusRow,
  VendorBootstrapDiagnosticsRow,
  VendorBootstrapResultRow
} from '../app/types';
import {
  buildOnboardingIdentityDraft,
  defaultCeoSystemPrompt,
  onboardingIdentityDraftsEqual,
  shouldHydrateOnboardingIdentityDraft,
  type OnboardingIdentityDraft
} from './onboardingIdentity';
import {
  generateLocalHexToken,
  generateLocalVaultMaterial,
  onboardingPageDraftReducer,
  type AuthDraftState,
  type ProviderDraftState,
  type UiState,
  type VaultDraftState
} from './onboardingState';
import {
  BentoStepCard,
  INPUT_CLASS,
  INPUT_WITH_ICON_CLASS,
  ONBOARDING_STEP_ORDER,
  OnboardingAuthPanel,
  OnboardingBootstrapPanel,
  OnboardingHeaderPanel,
  OnboardingMetadataPanel,
  OnboardingProviderKeysStep,
  OnboardingStatusMessages,
  STEP_METADATA,
  TEXTAREA_CLASS,
  containerVariants,
  describeBootstrapRun,
  itemVariants,
  type UiStep
} from './onboardingUi';
interface OnboardingPageProps {
  focused?: boolean;
  onboarding?: OnboardingStateRow | null;
  onboardingLoading?: boolean;
  onboardingError?: string | null;
  onRefresh?: () => Promise<void>;
  onStatusChange?: (state: OnboardingStateRow | null) => void;
}
function useOnboardingPageContent({
  focused = false,
  onboarding: onboardingOverride,
  onboardingLoading,
  onboardingError,
  onRefresh,
  onStatusChange
}: OnboardingPageProps = {}) {
  const token = useAppStore((state) => state.token);
  const setToken = useAppStore((state) => state.setToken);
  const refreshTools = useAppStore((state) => state.refreshTools);
  const refreshSkills = useAppStore((state) => state.refreshSkills);
  const queryClient = useQueryClient();
  const onboardingStatusResult = useQuery({
    ...onboardingStatusQueryOptions(token),
    enabled: Boolean(token && onboardingOverride === undefined)
  });
  const vaultStatusResult = useQuery(vaultStatusQueryOptions(token));
  const toolsDiagnosticsResult = useQuery(toolsDiagnosticsQueryOptions(token));
  const [onboarding, setOnboarding] = useState<OnboardingStateRow | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatusRow | null>(null);
  const [identityDraft, setIdentityDraft] = useState<OnboardingIdentityDraft>(() => ({
    companyName: 'Company',
    ceoName: 'Company CEO',
    ceoTitle: 'Chief Executive Agent',
    ceoSystemPrompt: defaultCeoSystemPrompt('Company')
  }));
  const [draftState, setDraftState] = useReducer(onboardingPageDraftReducer, {
    providerLiveDiagnostics: null,
    vendorBootstrap: null,
    bootstrapResult: null,
    vaultDraft: {
      material: '',
      generatedMaterial: null,
      generatedMaterialSaved: false
    },
    providerDraft: {
      openrouterKey: '',
      googleKey: '',
      telegramToken: '',
      voyageKey: ''
    },
    authDraftState: {
      tokenDraft: {
        value: token,
        dirty: false
      },
      generatedApiToken: null,
      awaitingGatewayRestart: false
    },
    uiState: {
      loading: true,
      busyAction: null,
      error: null,
      notice: null
    }
  });
  const lastHydratedIdentityDraftRef = useRef<OnboardingIdentityDraft | null>(null);
  const candidateToken = draftState.authDraftState.tokenDraft.dirty ? draftState.authDraftState.tokenDraft.value : token;
  const vaultMaterial = draftState.vaultDraft.material;
  const generatedVaultMaterial = draftState.vaultDraft.generatedMaterial;
  const generatedVaultMaterialSaved = draftState.vaultDraft.generatedMaterialSaved;
  const providerOpenrouterKey = draftState.providerDraft.openrouterKey;
  const providerGoogleKey = draftState.providerDraft.googleKey;
  const providerTelegramToken = draftState.providerDraft.telegramToken;
  const providerVoyageKey = draftState.providerDraft.voyageKey;
  const awaitingGatewayRestart = draftState.authDraftState.awaitingGatewayRestart;
  const generatedApiToken = draftState.authDraftState.generatedApiToken;
  const loading = draftState.uiState.loading;
  const busyAction = draftState.uiState.busyAction;
  const error = draftState.uiState.error;
  const notice = draftState.uiState.notice;
  const providerLiveDiagnostics = draftState.providerLiveDiagnostics;
  const vendorBootstrap = draftState.vendorBootstrap;
  const bootstrapResult = draftState.bootstrapResult;
  const patchUiState = useCallback((patch: Partial<UiState>) => {
    setDraftState((current) => ({
      uiState: {
        ...current.uiState,
        ...patch
      }
    }));
  }, []);
  const patchAuthDraftState = useCallback((patch: Partial<AuthDraftState>) => {
    setDraftState((current) => ({
      authDraftState: {
        ...current.authDraftState,
        ...patch
      }
    }));
  }, []);
  const patchVaultDraft = useCallback((patch: Partial<VaultDraftState>) => {
    setDraftState((current) => ({
      vaultDraft: {
        ...current.vaultDraft,
        ...patch
      }
    }));
  }, []);
  const patchProviderDraft = useCallback((patch: Partial<ProviderDraftState>) => {
    setDraftState((current) => ({
      providerDraft: {
        ...current.providerDraft,
        ...patch
      }
    }));
  }, []);

  const setProviderLiveDiagnostics = useCallback((nextProviderLiveDiagnostics: OnboardingProviderLiveDiagnosticsRow | null) => {
    setDraftState({ providerLiveDiagnostics: nextProviderLiveDiagnostics });
  }, []);

  const setVendorBootstrap = useCallback((nextVendorBootstrap: VendorBootstrapDiagnosticsRow | null) => {
    setDraftState({ vendorBootstrap: nextVendorBootstrap });
  }, []);

  const setBootstrapResult = useCallback((nextBootstrapResult: VendorBootstrapResultRow | null) => {
    setDraftState({ bootstrapResult: nextBootstrapResult });
  }, []);

  const setLoading = useCallback((nextLoading: boolean) => {
    patchUiState({ loading: nextLoading });
  }, [patchUiState]);

  const setBusyAction = useCallback((nextBusyAction: string | null) => {
    patchUiState({ busyAction: nextBusyAction });
  }, [patchUiState]);

  const setError = useCallback((nextError: string | null) => {
    patchUiState({ error: nextError });
  }, [patchUiState]);

  const setNotice = useCallback((nextNotice: string | null) => {
    patchUiState({ notice: nextNotice });
  }, [patchUiState]);

  const setGeneratedApiToken = useCallback((nextGeneratedApiToken: string | null) => {
    patchAuthDraftState({ generatedApiToken: nextGeneratedApiToken });
  }, [patchAuthDraftState]);

  const setAwaitingGatewayRestart = useCallback((nextAwaitingGatewayRestart: boolean) => {
    patchAuthDraftState({ awaitingGatewayRestart: nextAwaitingGatewayRestart });
  }, [patchAuthDraftState]);

  const setVaultMaterial = useCallback((nextMaterial: string) => {
    patchVaultDraft({ material: nextMaterial });
  }, [patchVaultDraft]);

  const setGeneratedVaultMaterial = useCallback((nextGeneratedMaterial: string | null) => {
    patchVaultDraft({ generatedMaterial: nextGeneratedMaterial });
  }, [patchVaultDraft]);

  const setGeneratedVaultMaterialSaved = useCallback((nextGeneratedMaterialSaved: boolean) => {
    patchVaultDraft({ generatedMaterialSaved: nextGeneratedMaterialSaved });
  }, [patchVaultDraft]);

  const setProviderOpenrouterKey = useCallback((nextOpenrouterKey: string) => {
    patchProviderDraft({ openrouterKey: nextOpenrouterKey });
  }, [patchProviderDraft]);

  const setProviderGoogleKey = useCallback((nextGoogleKey: string) => {
    patchProviderDraft({ googleKey: nextGoogleKey });
  }, [patchProviderDraft]);

  const setProviderTelegramToken = useCallback((nextTelegramToken: string) => {
    patchProviderDraft({ telegramToken: nextTelegramToken });
  }, [patchProviderDraft]);

  const setProviderVoyageKey = useCallback((nextVoyageKey: string) => {
    patchProviderDraft({ voyageKey: nextVoyageKey });
  }, [patchProviderDraft]);

  const updateIdentityDraft = useCallback(
    <K extends keyof OnboardingIdentityDraft>(key: K, value: OnboardingIdentityDraft[K]) => {
      setIdentityDraft((current) => ({
        ...current,
        [key]: value
      }));
    },
    []
  );

  const updateCandidateToken = useCallback((value: string, dirty = true) => {
    patchAuthDraftState({
      tokenDraft: {
        value,
        dirty
      }
    });
  }, [patchAuthDraftState]);

  useEffect(() => {
    if (onboardingOverride !== undefined) {
      setOnboarding(onboardingOverride ?? null);
      return;
    }
    setOnboarding(onboardingStatusResult.data ?? null);
  }, [onboardingOverride, onboardingStatusResult.data]);

  useEffect(() => {
    setVaultStatus(vaultStatusResult.data ?? null);
    setVendorBootstrap(toolsDiagnosticsResult.data?.vendorBootstrap ?? null);
  }, [setVendorBootstrap, toolsDiagnosticsResult.data, vaultStatusResult.data]);

  useEffect(() => {
    if (!onboarding) {
      lastHydratedIdentityDraftRef.current = null;
      return;
    }
    const nextDraft = buildOnboardingIdentityDraft(onboarding);
    if (onboardingIdentityDraftsEqual(identityDraft, nextDraft)) {
      lastHydratedIdentityDraftRef.current = nextDraft;
      return;
    }
    if (!shouldHydrateOnboardingIdentityDraft(identityDraft, lastHydratedIdentityDraftRef.current)) {
      return;
    }
    lastHydratedIdentityDraftRef.current = nextDraft;
    setIdentityDraft(nextDraft);
  }, [identityDraft, onboarding]);

  useEffect(() => {
    if (onboardingLoading !== undefined) {
      setLoading(onboardingLoading);
      return;
    }
    setLoading(onboardingStatusResult.isLoading || vaultStatusResult.isLoading || toolsDiagnosticsResult.isLoading);
  }, [onboardingLoading, onboardingStatusResult.isLoading, toolsDiagnosticsResult.isLoading, vaultStatusResult.isLoading]);

  useEffect(() => {
    if (onboardingError !== undefined) {
      setError(onboardingError);
      return;
    }
    const nextError = onboardingStatusResult.error ?? vaultStatusResult.error ?? toolsDiagnosticsResult.error;
    if (!nextError) {
      return;
    }
    setError(nextError instanceof Error ? nextError.message : 'Failed to load onboarding status.');
  }, [onboardingError, onboardingStatusResult.error, toolsDiagnosticsResult.error, vaultStatusResult.error]);

  const refresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
      if (token) {
        try {
          const [currentVault, toolsDiagnostics] = await Promise.all([
            queryClient.fetchQuery(vaultStatusQueryOptions(token)),
            queryClient.fetchQuery(toolsDiagnosticsQueryOptions(token)).catch(() => null)
          ]);
          setVaultStatus(currentVault);
          setVendorBootstrap(toolsDiagnostics?.vendorBootstrap ?? null);
        } catch {
          setVaultStatus(null);
          setVendorBootstrap(null);
        }
      } else {
        setVaultStatus(null);
        setVendorBootstrap(null);
      }
      return;
    }
    if (!token) {
      setLoading(false);
      setOnboarding(null);
      setVaultStatus(null);
      setVendorBootstrap(null);
      onStatusChange?.(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [state, currentVault, toolsDiagnostics] = await Promise.all([
        queryClient.fetchQuery(onboardingStatusQueryOptions(token)),
        queryClient.fetchQuery(vaultStatusQueryOptions(token)),
        queryClient.fetchQuery(toolsDiagnosticsQueryOptions(token)).catch(() => null)
      ]);
      setOnboarding(state);
      setVaultStatus(currentVault);
      setVendorBootstrap(toolsDiagnostics?.vendorBootstrap ?? null);
      onStatusChange?.(state);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load onboarding status.');
    } finally {
      setLoading(false);
    }
  }, [onRefresh, onStatusChange, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (
      actionId: string,
      operation: () => Promise<OnboardingStateRow>,
      successMessage: string,
      options?: { loadingMessage?: string; errorMessage?: string }
    ) => {
      setBusyAction(actionId);
      setError(null);
      setNotice(null);
      const toastId = options?.loadingMessage ? toast.loading(options.loadingMessage) : undefined;
      try {
        const next = await operation();
        setOnboarding(next);
        onStatusChange?.(next);
        if (token) {
          queryClient.setQueryData(onboardingStatusQueryOptions(token).queryKey, next);
          await invalidateOnboardingReadQueries(queryClient, token);
        }
        setNotice(successMessage);
        toast.success(successMessage, toastId ? { id: toastId } : undefined);
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : options?.errorMessage ?? `Failed to run ${actionId}.`;
        setError(message);
        toast.error(message, toastId ? { id: toastId } : undefined);
      } finally {
        setBusyAction(null);
      }
    },
    [onStatusChange, queryClient, token]
  );

  const handleVendorBootstrap = useCallback(
    async (target: 'skills' | 'tools' | 'all' | 'baseline-skills') => {
      if (!token) {
        const message = 'Initialize API token first.';
        setError(message);
        toast.error(message);
        return;
      }

      const actionId = `vendor-bootstrap:${target}`;
      setBusyAction(actionId);
      setError(null);
      setNotice(null);
      const runDescriptor = describeBootstrapRun(target);
      const toastId = toast.loading(runDescriptor.loading);
      try {
        const result = await bootstrapVendorAssets(token, { target });
        setBootstrapResult(result);
        await Promise.all([refresh(), refreshTools(), refreshSkills()]);
        if (result.status === 'ok') {
          const message = runDescriptor.success;
          setNotice(message);
          toast.success(message, { id: toastId });
        } else {
          const message =
            target === 'baseline-skills'
              ? 'Baseline skills repair finished with errors. Review the transcript below.'
              : 'Vendor bootstrap finished with errors. Review the transcript below.';
          setError(message);
          toast.error(message, { id: toastId });
        }
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : 'Vendor bootstrap failed.';
        setError(message);
        toast.error(message, { id: toastId });
      } finally {
        setBusyAction(null);
      }
    },
    [refresh, refreshSkills, refreshTools, token]
  );

  const copyText = useCallback(async (value: string, successLabel: string): Promise<void> => {
    await navigator.clipboard.writeText(value);
    toast.success(successLabel);
  }, []);

  const vaultEnvSnippet = useMemo(() => {
    const chosenMaterial = vaultMaterial.trim() || generatedVaultMaterial || '<paste-vault-material>';
    return [
      'OPS_VAULT_ENABLED=true',
      'OPS_VAULT_REQUIRE_UNLOCK_ON_STARTUP=true',
      'OPS_VAULT_AUTO_UNLOCK_FROM_ENV=true',
      `OPS_VAULT_ENV_KEY=${chosenMaterial}`
    ].join('\n');
  }, [generatedVaultMaterial, vaultMaterial]);

  const vendorSkillsBootstrapEnabled = vendorBootstrap?.skillsEnabled ?? false;
  const recommendedBootstrapTarget = vendorBootstrap?.recommendedTarget ?? 'tools';

  const stepsById = useMemo(() => {
    const byId = new Map<OnboardingStepRow['id'], OnboardingStepRow>();
    if (onboarding?.steps) {
      for (const step of onboarding.steps) {
        byId.set(step.id, step);
      }
    }
    return byId;
  }, [onboarding]);

  const effectiveSteps = useMemo<UiStep[]>(() => {
    const authStep: UiStep = !token
      ? {
          id: 'auth',
          title: STEP_METADATA.auth.title,
          status: 'pending',
          detail: 'Provide and save an API token to begin onboarding.',
          updatedAt: null
        }
      : onboarding
        ? {
            id: 'auth',
            title: STEP_METADATA.auth.title,
            status: 'complete',
            detail: 'API token validated against gateway.',
            updatedAt: new Date().toISOString()
          }
        : error
          ? {
              id: 'auth',
              title: STEP_METADATA.auth.title,
              status: 'blocked',
              detail: error,
              updatedAt: null
            }
          : {
              id: 'auth',
              title: STEP_METADATA.auth.title,
              status: 'pending',
              detail: 'Validating API token with gateway...',
              updatedAt: null
            };

    const onboardingSteps = ONBOARDING_STEP_ORDER.map((id): UiStep => {
      if (!onboarding) {
        return {
          id,
          title: STEP_METADATA[id].title,
          status: 'pending',
          detail: STEP_METADATA[id].detail,
          updatedAt: null
        };
      }

      const explicit = stepsById.get(id);
      if (explicit) {
        return explicit;
      }
      if (id === 'ceo_baseline') {
        const companyIdentityConfigured = onboarding.companyName.trim().toLowerCase() !== 'company';
        return {
          id,
          title: STEP_METADATA[id].title,
          status: companyIdentityConfigured ? 'complete' : 'pending',
          detail: companyIdentityConfigured
            ? 'Protected CEO baseline is active. Update company identity here anytime.'
            : 'Set a custom company name to finish identity setup.',
          updatedAt: onboarding.evidence.ceoBaselineConfiguredAt
        };
      }
      return {
        id,
        title: STEP_METADATA[id].title,
        status: 'pending',
        detail: STEP_METADATA[id].detail,
        updatedAt: null
      };
    });

    return [authStep, ...onboardingSteps];
  }, [onboarding, stepsById, token, error]);

  const completedCount = effectiveSteps.filter((step) => step.status === 'complete').length;

  const progressPercent = effectiveSteps.length > 0 ? (completedCount / effectiveSteps.length) * 100 : 0;
  const vaultStep = effectiveSteps.find((step) => step.id === 'vault');
  const providerConfigured = onboarding?.providerKeys ?? {
    openrouter: false,
    google: false,
    telegram: false,
    voyage: false,
    github: false,
    hasAtLeastOneKey: false,
    hasRequiredSet: false
  };
  const vaultFlowStage = useMemo<'bootstrap' | 'unlock' | 'unlocked' | 'disabled'>(() => {
    if (vaultStatus) {
      if (!vaultStatus.enabled) {
        return 'disabled';
      }
      if (!vaultStatus.initialized) {
        return 'bootstrap';
      }
      return vaultStatus.locked ? 'unlock' : 'unlocked';
    }
    if (vaultStep?.status === 'complete') {
      return 'unlocked';
    }
    if (vaultStep?.detail.toLowerCase().includes('disabled')) {
      return 'disabled';
    }
    if (vaultStep?.detail.toLowerCase().includes('not initialized')) {
      return 'bootstrap';
    }
    return 'unlock';
  }, [vaultStatus, vaultStep]);
  const providerPrereqReady = vaultFlowStage === 'unlocked' || vaultFlowStage === 'disabled';
  const canRunSmoke = effectiveSteps.filter((step) => step.id !== 'smoke_run').every((step) => step.status === 'complete');
  const hasProviderModelInput = providerOpenrouterKey.trim().length > 0 || providerGoogleKey.trim().length > 0;
  const hasProviderRecommendedInput = providerVoyageKey.trim().length > 0;
  const hasAnyProviderInput = providerTelegramToken.trim().length > 0 || hasProviderModelInput || hasProviderRecommendedInput;
  
  const usingGeneratedVaultMaterial =
    generatedVaultMaterial !== null && vaultMaterial.trim().length > 0 && vaultMaterial.trim() === generatedVaultMaterial;
  const vaultActionNeedsMaterial = vaultFlowStage === 'bootstrap' || vaultFlowStage === 'unlock';
  const vaultActionBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!token) {
      blockers.push('Initialize API token first.');
    }
    if (busyAction !== null) {
      blockers.push('Wait for the current action to finish.');
    }
    if (vaultActionNeedsMaterial && vaultMaterial.trim().length === 0) {
      blockers.push('Provide vault material.');
    }
    if (vaultFlowStage === 'bootstrap' && usingGeneratedVaultMaterial && !generatedVaultMaterialSaved) {
      blockers.push('Confirm you saved the generated material.');
    }
    return blockers;
  }, [busyAction, generatedVaultMaterialSaved, token, usingGeneratedVaultMaterial, vaultActionNeedsMaterial, vaultFlowStage, vaultMaterial]);
  const canSubmitVaultMaterial = vaultActionBlockers.length === 0;
  const canResetEmptyVault = vaultFlowStage === 'unlock' && (vaultStatus?.secretCount ?? 0) === 0;
  const providerSaveBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!providerPrereqReady) {
      blockers.push('Unlock vault first.');
    }
    if (!token) {
      blockers.push('Initialize API token first.');
    }
    if (busyAction !== null) {
      blockers.push('Wait for the current action to finish.');
    }
    if (!providerConfigured.telegram && providerTelegramToken.trim().length === 0) {
      blockers.push('Enter Telegram bot token.');
    }
    if (!providerConfigured.hasAtLeastOneKey && !hasProviderModelInput) {
      blockers.push('Enter OpenRouter or Google key.');
    }
    if (providerConfigured.hasRequiredSet && !hasAnyProviderInput) {
      blockers.push('All required secrets are already configured. Enter a field only to rotate/update.');
    }
    return blockers;
  }, [busyAction, hasAnyProviderInput, hasProviderModelInput, providerConfigured.hasAtLeastOneKey, providerConfigured.hasRequiredSet, providerConfigured.telegram, providerPrereqReady, providerTelegramToken, token]);
  const canSaveProviderSecrets = providerSaveBlockers.length === 0;
  const providerReplaceTargets = useMemo(() => {
    const targets: string[] = [];
    if (providerConfigured.telegram && providerTelegramToken.trim().length > 0) {
      targets.push('Telegram');
    }
    if (providerConfigured.openrouter && providerOpenrouterKey.trim().length > 0) {
      targets.push('OpenRouter');
    }
    if (providerConfigured.google && providerGoogleKey.trim().length > 0) {
      targets.push('Google');
    }
    if (providerConfigured.voyage && providerVoyageKey.trim().length > 0) {
      targets.push('Voyage');
    }
    return targets;
  }, [
    providerConfigured.google,
    providerConfigured.openrouter,
    providerConfigured.telegram,
    providerConfigured.voyage,
    providerGoogleKey,
    providerOpenrouterKey,
    providerTelegramToken,
    providerVoyageKey
  ]);
  const providerCheckBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!providerPrereqReady) {
      blockers.push('Unlock vault first.');
    }
    if (!token) {
      blockers.push('Initialize API token first.');
    }
    if (busyAction !== null) {
      blockers.push('Wait for the current action to finish.');
    }
    return blockers;
  }, [busyAction, providerPrereqReady, token]);
  const canRunProviderDiagnostics = providerCheckBlockers.length === 0;
  const bootstrapBusyTarget = useMemo<'skills' | 'tools' | 'all' | 'baseline-skills' | null>(() => {
    if (!busyAction || !busyAction.startsWith('vendor-bootstrap:')) {
      return null;
    }
    const target = busyAction.slice('vendor-bootstrap:'.length);
    return target === 'skills' || target === 'tools' || target === 'all' || target === 'baseline-skills' ? target : null;
  }, [busyAction]);
  const bootstrapLog = useMemo(() => {
    if (!bootstrapResult) {
      return '';
    }
    return bootstrapResult.steps
      .map((step) =>
        [
          `# ${step.title} [${step.status}]`,
          step.command ? `$ ${step.command}` : '',
          step.summary,
          step.stdout,
          step.stderr ? `stderr:\n${step.stderr}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      )
      .join('\n\n');
  }, [bootstrapResult]);

  const onboardingComplete = onboarding?.status === 'ready';
  const frameClass = focused ? 'mx-auto w-full max-w-6xl space-y-6 px-4 pb-4 sm:px-6 lg:px-8' : 'space-y-6';

  return (
    <LazyMotion features={domAnimation}>
      <m.section variants={containerVariants} initial="hidden" animate="show" className={frameClass}>
      <OnboardingHeaderPanel
        onboardingComplete={onboardingComplete}
        progressPercent={progressPercent}
        loading={loading}
        onRefresh={() => void refresh()}
      />

      <AnimatePresence>
        {!token ? (
          <OnboardingAuthPanel
            candidateToken={candidateToken}
            awaitingGatewayRestart={awaitingGatewayRestart}
            generatedApiToken={generatedApiToken}
            onTokenChange={(value) => updateCandidateToken(value)}
            onInitialize={() => setToken(candidateToken.trim())}
            onGenerate={() => {
              try {
                const tokenValue = generateLocalHexToken();
                updateCandidateToken(tokenValue);
                setGeneratedApiToken(tokenValue);
                setAwaitingGatewayRestart(true);
                setNotice(
                  'Local API token generated. Save it as OPS_API_TOKEN in Dokploy Environment or .env, restart ElyzeLabs, then initialize connection.'
                );
                setError(null);
                toast.success('API token generated locally.');
              } catch (nextError) {
                const message = nextError instanceof Error ? nextError.message : 'Failed to generate local API token.';
                setError(message);
                toast.error(message);
              }
            }}
            onRegenerate={() => {
              if (!window.confirm('Generate a new API token? This replaces the current generated value.')) {
                return;
              }
              try {
                const tokenValue = generateLocalHexToken();
                updateCandidateToken(tokenValue);
                setGeneratedApiToken(tokenValue);
                setAwaitingGatewayRestart(true);
                setNotice(
                  'New API token generated. Update OPS_API_TOKEN in Dokploy Environment or .env, restart ElyzeLabs, then initialize connection.'
                );
                setError(null);
                toast.success('API token regenerated.');
              } catch (nextError) {
                const message = nextError instanceof Error ? nextError.message : 'Failed to regenerate API token.';
                setError(message);
                toast.error(message);
              }
            }}
            onCopy={() => {
              void (async () => {
                try {
                  if (!generatedApiToken) {
                    return;
                  }
                  await copyText(generatedApiToken, 'Generated API token copied.');
                  setNotice('Generated API token copied.');
                  setError(null);
                } catch (nextError) {
                  const message = nextError instanceof Error ? nextError.message : 'Failed to copy generated API token.';
                  setError(message);
                  toast.error(message);
                }
              })();
            }}
            onCancel={() => {
              setGeneratedApiToken(null);
              updateCandidateToken('', false);
              setAwaitingGatewayRestart(false);
              setNotice('Token generation flow cleared. You can paste an existing token.');
              setError(null);
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <OnboardingStatusMessages error={error} notice={notice} />
      </AnimatePresence>

      {token ? (
        <OnboardingBootstrapPanel
          vendorSkillsBootstrapEnabled={vendorSkillsBootstrapEnabled}
          vendorBootstrapReason={vendorBootstrap?.skillsReason ?? null}
          recommendedBootstrapTarget={recommendedBootstrapTarget}
          busyAction={busyAction}
          bootstrapBusyTarget={bootstrapBusyTarget}
          bootstrapResult={bootstrapResult}
          bootstrapLog={bootstrapLog}
          onRunBootstrap={(target) => void handleVendorBootstrap(target)}
        />
      ) : null}

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {effectiveSteps.map((step) => (
          <BentoStepCard
            key={step.id}
            id={step.id}
            step={step}
            loading={loading}
            variants={itemVariants}
            className={step.id === 'smoke_run' ? 'md:col-span-2' : ''}
            isLocked={
              (step.id === 'provider_keys' && !providerPrereqReady) ||
              (step.id === 'smoke_run' && !canRunSmoke)
            }
          >
            {step.id === 'ceo_baseline' && (
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={identityDraft.companyName}
                  onChange={(event) => updateIdentityDraft('companyName', event.target.value)}
                  placeholder="Organization name..."
                  className={INPUT_CLASS}
                />
                <input
                  type="text"
                  value={identityDraft.ceoName}
                  onChange={(event) => updateIdentityDraft('ceoName', event.target.value)}
                  placeholder="CEO name..."
                  className={INPUT_CLASS}
                />
                <input
                  type="text"
                  value={identityDraft.ceoTitle}
                  onChange={(event) => updateIdentityDraft('ceoTitle', event.target.value)}
                  placeholder="CEO title..."
                  className={INPUT_CLASS}
                />
                <textarea
                  value={identityDraft.ceoSystemPrompt}
                  onChange={(event) => updateIdentityDraft('ceoSystemPrompt', event.target.value)}
                  rows={7}
                  placeholder="CEO system prompt..."
                  className={TEXTAREA_CLASS}
                />
                <button
                  type="button"
                  disabled={
                    !token ||
                    busyAction !== null ||
                    identityDraft.companyName.trim().length === 0 ||
                    identityDraft.ceoName.trim().length === 0 ||
                    identityDraft.ceoTitle.trim().length === 0 ||
                    identityDraft.ceoSystemPrompt.trim().length === 0
                  }
                  onClick={() =>
                    runAction(
                      'ceo-baseline',
                      async () => {
                        const response = await applyOnboardingCeoBaseline(token, {
                          companyName: identityDraft.companyName.trim(),
                          ceoName: identityDraft.ceoName.trim(),
                          ceoTitle: identityDraft.ceoTitle.trim(),
                          ceoSystemPrompt: identityDraft.ceoSystemPrompt.trim()
                        });
                        const nextDraft = buildOnboardingIdentityDraft(response.onboarding);
                        lastHydratedIdentityDraftRef.current = nextDraft;
                        setIdentityDraft(nextDraft);
                        return response.onboarding;
                      },
                      'Identity synced.',
                      { loadingMessage: 'Syncing organization identity...', errorMessage: 'Identity sync failed.' }
                    )
                  }
                  className="shell-button-accent w-full h-11 rounded-xl text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                >
                  {busyAction === 'ceo-baseline' ? 'Syncing...' : 'Sync Identity'}
                </button>
              </div>
            )}

            {step.id === 'vault' && (
              <div className="mt-4 space-y-3">
                {vaultFlowStage === 'unlocked' ? (
                  <>
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-emerald-100/90">
                      <p className="font-semibold uppercase tracking-wide text-emerald-300">Vault Ready</p>
                      <p className="mt-1">
                        Vault is already unlocked in this gateway session. You can proceed directly to required secrets.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={!token || busyAction !== null}
                        onClick={() =>
                          runAction(
                            'vault-lock',
                            async () => {
                              const currentVault = await lockVault(token);
                              setVaultStatus(currentVault);
                              setVaultMaterial('');
                              setGeneratedVaultMaterial(null);
                              setGeneratedVaultMaterialSaved(false);
                              return queryClient.fetchQuery(onboardingStatusQueryOptions(token));
                            },
                            'Vault locked. Use your original material to unlock.',
                            { loadingMessage: 'Locking vault...', errorMessage: 'Vault lock failed.' }
                          )
                        }
                        className="h-10 rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-bold text-[var(--shell-text)] disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                      >
                        {busyAction === 'vault-lock' ? 'Locking Vault...' : 'Lock Vault'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await copyText(vaultEnvSnippet, 'Vault startup snippet copied.');
                            setNotice(
                              'Vault startup snippet copied. Paste it into Dokploy Environment or .env manually, then restart or redeploy ElyzeLabs.'
                            );
                            setError(null);
                          } catch (nextError) {
                            const message = nextError instanceof Error ? nextError.message : 'Failed to copy vault startup snippet.';
                            setError(message);
                            toast.error(message);
                          }
                        }}
                        className="flex items-center justify-center gap-2 h-10 rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-bold text-[var(--shell-text)]"
                      >
                        <Copy size={14} />
                        Copy Env Template
                      </button>
                    </div>
                    <p className="text-[10px] text-[var(--shell-muted)]">
                      Clipboard only. It does not edit files automatically. Current default in this template is auto-unlock OFF until you set these vars.
                    </p>
                  </>
                ) : (
                  <>
                    {vaultFlowStage === 'bootstrap' && (
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <button
                          type="button"
                          disabled={busyAction !== null || Boolean(generatedVaultMaterial)}
                          onClick={() => {
                            try {
                              const generated = generateLocalVaultMaterial();
                              setVaultMaterial(generated);
                              setGeneratedVaultMaterial(generated);
                              setGeneratedVaultMaterialSaved(false);
                              setNotice('Vault material generated.');
                              setError(null);
                              toast.success('Vault material generated locally.');
                            } catch (nextError) {
                              const message = nextError instanceof Error ? nextError.message : 'Failed to generate vault material.';
                              setError(message);
                              toast.error(message);
                            }
                          }}
                          className="h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                        >
                          Generate
                        </button>
                        <button
                          type="button"
                          disabled={!generatedVaultMaterial}
                          onClick={() => {
                            if (!window.confirm('Generate new vault material? This replaces the current generated value.')) {
                              return;
                            }
                            try {
                              const generated = generateLocalVaultMaterial();
                              setVaultMaterial(generated);
                              setGeneratedVaultMaterial(generated);
                              setGeneratedVaultMaterialSaved(false);
                              setNotice('Vault material regenerated.');
                              setError(null);
                              toast.success('Vault material regenerated.');
                            } catch (nextError) {
                              const message = nextError instanceof Error ? nextError.message : 'Failed to regenerate vault material.';
                              setError(message);
                              toast.error(message);
                            }
                          }}
                          className="h-9 rounded-lg bg-emerald-500/5 border border-emerald-500/15 text-[10px] font-bold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                        >
                          Regenerate
                        </button>
                        <button
                          type="button"
                          disabled={!generatedVaultMaterial}
                          onClick={async () => {
                            try {
                              if (!generatedVaultMaterial) {
                                return;
                              }
                              await copyText(generatedVaultMaterial, 'Vault material copied.');
                              setGeneratedVaultMaterialSaved(true);
                              setNotice('Vault material copied and marked as saved.');
                              setError(null);
                            } catch (nextError) {
                              const message = nextError instanceof Error ? nextError.message : 'Failed to copy vault material.';
                              setError(message);
                              toast.error(message);
                            }
                          }}
                          className="h-9 rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-bold text-[var(--shell-text)] disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          disabled={!generatedVaultMaterial}
                          onClick={() => {
                            try {
                              if (!generatedVaultMaterial) {
                                return;
                              }
                              const blob = new Blob([generatedVaultMaterial], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'vault-material.txt';
                              a.click();
                              URL.revokeObjectURL(url);
                              setGeneratedVaultMaterialSaved(true);
                              setNotice('Vault material downloaded and marked as saved.');
                              setError(null);
                              toast.success('Vault material downloaded.');
                            } catch (nextError) {
                              const message = nextError instanceof Error ? nextError.message : 'Failed to download vault material.';
                              setError(message);
                              toast.error(message);
                            }
                          }}
                          className="h-9 rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-bold text-[var(--shell-text)] disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                        >
                          Download
                        </button>
                      </div>
                    )}

                    {vaultFlowStage === 'unlock' && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-100/90">
                        <p className="font-semibold uppercase tracking-wide text-amber-300">Vault Already Initialized</p>
                        <p className="mt-1">
                          Enter the original vault material to unlock. Generating a new one will not unlock this existing vault.
                        </p>
                      </div>
                    )}

                    <div className="relative">
                      <Key size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--shell-muted)]" />
                      <input
                        type="password"
                        value={vaultMaterial}
                        onChange={(event) => setVaultMaterial(event.target.value)}
                        placeholder={vaultFlowStage === 'bootstrap' ? 'Set vault material...' : 'Enter existing vault material...'}
                        className={`${INPUT_WITH_ICON_CLASS} pr-4`}
                      />
                    </div>

                    {vaultFlowStage === 'bootstrap' && usingGeneratedVaultMaterial && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Backup Confirmation</p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                              generatedVaultMaterialSaved
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                            }`}
                          >
                            {generatedVaultMaterialSaved ? 'Saved' : 'Required'}
                          </span>
                        </div>
                        <label className="mt-2 flex items-start gap-2 text-[11px] text-amber-100/90">
                          <input
                            type="checkbox"
                            checked={generatedVaultMaterialSaved}
                            onChange={(event) => setGeneratedVaultMaterialSaved(event.target.checked)}
                            className="mt-0.5"
                          />
                          <span>I stored this generated material in my password manager or offline backup.</span>
                        </label>
                        {!generatedVaultMaterialSaved && (
                          <p className="mt-2 text-[10px] text-amber-300">Initialize stays disabled until this is confirmed.</p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                      {vaultFlowStage === 'bootstrap' ? (
                        <button
                          disabled={!canSubmitVaultMaterial}
                          onClick={() =>
                            runAction(
                              'vault-bootstrap',
                              async () => {
                                const response = await bootstrapOnboardingVault(token, vaultMaterial.trim());
                                setVaultStatus(response.vault);
                                return response.onboarding;
                              },
                              'Vault initialized and unlocked.',
                              { loadingMessage: 'Initializing vault...', errorMessage: 'Vault initialization failed.' }
                            )
                          }
                          className="h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400 disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                        >
                          {busyAction === 'vault-bootstrap' ? 'Initializing...' : 'Initialize Vault'}
                        </button>
                      ) : (
                        <button
                          disabled={!canSubmitVaultMaterial}
                          onClick={() =>
                            runAction(
                              'vault-unlock',
                              async () => {
                                const response = await unlockOnboardingVault(token, vaultMaterial.trim());
                                setVaultStatus(response.vault);
                                return response.onboarding;
                              },
                              'Vault unlocked.',
                              { loadingMessage: 'Unlocking vault...', errorMessage: 'Vault unlock failed.' }
                            )
                          }
                          className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-bold text-[var(--shell-text)] disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                        >
                          {busyAction === 'vault-unlock' ? 'Unlocking...' : 'Unlock Vault'}
                        </button>
                      )}
                    </div>

                    {!canSubmitVaultMaterial && (
                      <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Why action is disabled</p>
                        <p className="mt-1 text-[11px] text-[var(--shell-text)]">{vaultActionBlockers[0]}</p>
                      </div>
                    )}

                    {vaultFlowStage === 'unlock' && (
                      <>
                        <button
                          type="button"
                          disabled={!token || busyAction !== null || !canResetEmptyVault}
                          onClick={() =>
                            runAction(
                              'vault-reset-empty',
                              async () => {
                                const resetStatus = await resetEmptyVault(token);
                                setVaultStatus(resetStatus);
                                setVaultMaterial('');
                                setGeneratedVaultMaterial(null);
                                setGeneratedVaultMaterialSaved(false);
                                return queryClient.fetchQuery(onboardingStatusQueryOptions(token));
                              },
                              'Vault reset complete (empty vault). You can initialize with new material now.',
                              {
                                loadingMessage: 'Resetting empty vault...',
                                errorMessage: 'Vault reset failed. Unlock with original material or remove existing secrets first.'
                              }
                            )
                          }
                          className="h-9 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-300 disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                        >
                          {busyAction === 'vault-reset-empty' ? 'Resetting Vault...' : 'Reset Empty Vault'}
                        </button>
                        {!canResetEmptyVault && (
                          <p className="text-[10px] text-white/55">
                            Reset is disabled because vault contains secrets. Unlock with the original material instead.
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
                {(busyAction === 'vault-bootstrap' || busyAction === 'vault-unlock') && (
                  <p className="text-[11px] text-[var(--shell-muted)]">
                    {busyAction === 'vault-bootstrap' ? 'Initializing secure vault in gateway...' : 'Verifying vault key material...'}
                  </p>
                )}
              </div>
            )}

            {step.id === 'provider_keys' && (
              <OnboardingProviderKeysStep
                providerConfigured={providerConfigured}
                providerCheckedAt={onboarding?.evidence.providerKeysCheckedAt}
                busyAction={busyAction}
                providerLiveDiagnostics={providerLiveDiagnostics}
                providerTelegramToken={providerTelegramToken}
                providerOpenrouterKey={providerOpenrouterKey}
                providerGoogleKey={providerGoogleKey}
                providerVoyageKey={providerVoyageKey}
                canSaveProviderSecrets={canSaveProviderSecrets}
                providerReplaceTargets={providerReplaceTargets}
                providerSaveBlockers={providerSaveBlockers}
                canRunProviderDiagnostics={canRunProviderDiagnostics}
                providerCheckBlockers={providerCheckBlockers}
                onProviderTelegramTokenChange={setProviderTelegramToken}
                onProviderOpenrouterKeyChange={setProviderOpenrouterKey}
                onProviderGoogleKeyChange={setProviderGoogleKey}
                onProviderVoyageKeyChange={setProviderVoyageKey}
                onSave={() => {
                  void runAction(
                    'provider-save',
                    async () => {
                      const updates: Promise<unknown>[] = [];
                      const openrouterValue = providerOpenrouterKey.trim();
                      const googleValue = providerGoogleKey.trim();
                      const telegramValue = providerTelegramToken.trim();
                      const voyageValue = providerVoyageKey.trim();
                      if (openrouterValue) {
                        updates.push(
                          upsertVaultSecret(token, 'providers.openrouter_api_key', {
                            value: openrouterValue,
                            category: 'providers',
                            approved: true
                          })
                        );
                      }
                      if (googleValue) {
                        updates.push(
                          upsertVaultSecret(token, 'providers.google_api_key', {
                            value: googleValue,
                            category: 'providers',
                            approved: true
                          })
                        );
                      }
                      if (telegramValue) {
                        updates.push(
                          upsertVaultSecret(token, 'telegram.bot_token', {
                            value: telegramValue,
                            category: 'telegram',
                            approved: true
                          })
                        );
                      }
                      if (voyageValue) {
                        updates.push(
                          upsertVaultSecret(token, 'providers.voyage_api_key', {
                            value: voyageValue,
                            category: 'providers',
                            approved: true
                          })
                        );
                      }
                      await Promise.all(updates);
                      setProviderOpenrouterKey('');
                      setProviderGoogleKey('');
                      setProviderTelegramToken('');
                      setProviderVoyageKey('');
                      setProviderLiveDiagnostics(null);
                      return (await checkOnboardingProviderKeys(token)).onboarding;
                    },
                    'Secrets saved to vault. Status refreshed.',
                    { loadingMessage: 'Saving secrets to vault...', errorMessage: 'Saving secrets failed.' }
                  );
                }}
                onVerifySetup={() => {
                  void runAction(
                    'key-check',
                    async () => (await checkOnboardingProviderKeys(token)).onboarding,
                    'Secret setup check complete.',
                    { loadingMessage: 'Checking secret setup...', errorMessage: 'Secret setup check failed.' }
                  );
                }}
                onTestLiveApis={() => {
                  void runAction(
                    'key-live-check',
                    async () => {
                      const response = await testOnboardingProviderConnections(token);
                      setProviderLiveDiagnostics(response.live);
                      return response.onboarding;
                    },
                    'Live provider test complete.',
                    { loadingMessage: 'Testing live provider connections...', errorMessage: 'Live provider connectivity test failed.' }
                  );
                }}
              />
            )}

            {step.id === 'smoke_run' && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-[11px] text-fuchsia-100/90">
                  <p className="font-semibold uppercase tracking-wide text-fuchsia-300">What This Runs</p>
                  <p className="mt-1">
                    Executes one real CEO run using current runtime/model in a scratch workspace and records pass/fail.
                  </p>
                </div>
                <button
                  disabled={!token || busyAction !== null || !canRunSmoke}
                  onClick={() => runAction('smoke-run', async () => (await runOnboardingSmoke(token)).onboarding, 'Smoke run OK.')}
                  className="group flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-fuchsia-600 text-sm font-bold text-white shadow-[0_0_20px_rgba(192,38,211,0.2)] disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
                >
                  {busyAction === 'smoke-run' ? <ArrowsClockwise size={18} className="animate-spin" /> : <>Launch Verification <ArrowRight size={18} /></>}
                </button>
              </div>
            )}
          </BentoStepCard>
        ))}
      </div>

      {onboarding ? <OnboardingMetadataPanel onboarding={onboarding} /> : null}
      </m.section>
    </LazyMotion>
  );
}

export function OnboardingPage(props: OnboardingPageProps = {}) {
  return useOnboardingPageContent(props);
}
