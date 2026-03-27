import {
  ArrowsClockwise,
  CheckCircle,
  Copy,
  Key,
  Lock,
  LockOpen,
  Sparkle,
  Trash,
  WarningCircle,
  Eye,
  EyeSlash,
  CaretRight
} from '@phosphor-icons/react';
import type { Variants } from 'framer-motion';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { useEffect, useMemo, useReducer } from 'react';

import { useAppStore } from '../app/store';
import { PageIntro } from '../components/ops/PageHeader';

interface SecretTemplate {
  label: string;
  name: string;
  category: string;
  envKey: string;
  description: string;
  requirement: string;
  required: boolean;
}

const SECRET_TEMPLATES: SecretTemplate[] = [
  {
    label: 'Telegram Bot Token',
    name: 'telegram.bot_token',
    category: 'telegram',
    envKey: 'OPS_TELEGRAM_BOT_TOKEN',
    description: 'Used by Telegram ingress and outbound bot delivery.',
    requirement: 'Required when Telegram ingress is enabled.',
    required: true
  },
  {
    label: 'Telegram Default Chat ID',
    name: 'telegram.default_chat_id',
    category: 'telegram',
    envKey: 'OPS_TELEGRAM_CHAT_ID',
    description:
      'Fallback outbound target when the primary session chat is missing/stale or Telegram responds with "chat not found".',
    requirement: 'Optional, but strongly recommended for reliable lifecycle/completion receipts.',
    required: false
  },
  {
    label: 'Telegram Default Topic ID',
    name: 'telegram.default_topic_id',
    category: 'telegram',
    envKey: 'OPS_TELEGRAM_TOPIC_ID',
    description: 'Optional fallback topic/thread id paired with Telegram default chat id.',
    requirement: 'Optional. Use only if you send updates to a Telegram forum topic.',
    required: false
  },
  {
    label: 'Voyage API Key',
    name: 'providers.voyage_api_key',
    category: 'providers',
    envKey: 'OPS_VOYAGE_API_KEY',
    description: 'Enables embedding-backed memory recall.',
    requirement: 'Optional. Recommended if you want embedding-powered memory recall.',
    required: false
  },
  {
    label: 'OpenAI API Key',
    name: 'providers.openai_api_key',
    category: 'providers',
    envKey: 'OPENAI_API_KEY',
    description: 'Optional runtime credential for Codex/OpenAI tooling.',
    requirement: 'Optional runtime setup.',
    required: false
  },
  {
    label: 'Anthropic API Key',
    name: 'providers.anthropic_api_key',
    category: 'providers',
    envKey: 'ANTHROPIC_API_KEY',
    description: 'Optional runtime credential for Claude tooling.',
    requirement: 'Optional runtime setup.',
    required: false
  },
  {
    label: 'Gemini API Key (Google)',
    name: 'providers.google_api_key',
    category: 'providers',
    envKey: 'GOOGLE_API_KEY',
    description: 'Optional runtime credential for Gemini tooling.',
    requirement: 'Optional runtime setup.',
    required: false
  },
  {
    label: 'OpenRouter API Key',
    name: 'providers.openrouter_api_key',
    category: 'providers',
    envKey: 'OPENROUTER_API_KEY',
    description: 'Optional credential for OpenRouter-backed routing.',
    requirement: 'Optional runtime setup.',
    required: false
  },
  {
    label: 'GitHub Personal Access Token',
    name: 'providers.github_pat',
    category: 'providers',
    envKey: 'GITHUB_TOKEN',
    description: 'Used for backlog GitHub sync, commit/push automation, and PR workflows.',
    requirement: 'Required only if you enable GitHub repository integrations.',
    required: false
  }
];

function generateMaterialCandidate(): string {
  const bytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

type VaultPageState = {
  material: string;
  masterRotationMaterial: string;
  secretName: string;
  secretCategory: string;
  secretValue: string;
  rotateByName: Record<string, string>;
  activeTemplateName: string;
  clipboardStatus: string;
  showMaterial: boolean;
  showAdvanced: boolean;
};

type VaultPageAction =
  | { type: 'patch'; patch: Partial<VaultPageState> }
  | { type: 'update_rotate_value'; name: string; value: string };

function vaultPageReducer(state: VaultPageState, action: VaultPageAction): VaultPageState {
  switch (action.type) {
    case 'patch':
      return {
        ...state,
        ...action.patch
      };
    case 'update_rotate_value':
      return {
        ...state,
        rotateByName: {
          ...state.rotateByName,
          [action.name]: action.value
        }
      };
    default:
      return state;
  }
}

// Reusable animated button
function MagneticButton({ children, onClick, disabled, className, variant = 'primary' }: { children: React.ReactNode, onClick: () => void, disabled?: boolean, className?: string, variant?: 'primary' | 'secondary' | 'danger' }) {
  const baseClasses = "relative overflow-hidden inline-flex items-center justify-center gap-2 font-medium transition-all duration-300 outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "shell-button-accent",
    secondary: "shell-button-ghost",
    danger: "border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/16"
  };

  return (
    <m.button
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variants[variant]} ${className} rounded-lg px-4 py-2 text-sm`}
    >
      {children}
    </m.button>
  );
}

export function VaultPage() {
  const token = useAppStore((state) => state.token);
  const vaultStatus = useAppStore((state) => state.vaultStatus);
  const vaultSecrets = useAppStore((state) => state.vaultSecrets);
  const refreshVault = useAppStore((state) => state.refreshVault);
  const bootstrapVault = useAppStore((state) => state.bootstrapVault);
  const unlockVault = useAppStore((state) => state.unlockVault);
  const lockVault = useAppStore((state) => state.lockVault);
  const resetEmptyVault = useAppStore((state) => state.resetEmptyVault);
  const saveVaultSecret = useAppStore((state) => state.saveVaultSecret);
  const revokeVaultSecret = useAppStore((state) => state.revokeVaultSecret);
  const rotateVaultMaster = useAppStore((state) => state.rotateVaultMaster);

  const defaultTemplate = SECRET_TEMPLATES[0];
  const [pageState, dispatchPageState] = useReducer(vaultPageReducer, {
    material: '',
    masterRotationMaterial: '',
    secretName: defaultTemplate.name,
    secretCategory: defaultTemplate.category,
    secretValue: '',
    rotateByName: {},
    activeTemplateName: defaultTemplate.name,
    clipboardStatus: '',
    showMaterial: false,
    showAdvanced: false
  });
  const {
    material,
    masterRotationMaterial,
    secretName,
    secretCategory,
    secretValue,
    rotateByName,
    activeTemplateName,
    clipboardStatus,
    showMaterial,
    showAdvanced
  } = pageState;

  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  const activeSecrets = useMemo(() => vaultSecrets.filter((secret) => secret.revokedAt === null), [vaultSecrets]);
  const revokedSecrets = useMemo(() => vaultSecrets.filter((secret) => secret.revokedAt !== null), [vaultSecrets]);
  const activeSecretNames = useMemo(() => new Set(activeSecrets.map((secret) => secret.name)), [activeSecrets]);
  const activeTemplate = useMemo(
    () => SECRET_TEMPLATES.find((template) => template.name === activeTemplateName) ?? defaultTemplate,
    [activeTemplateName, defaultTemplate]
  );

  const patchPageState = (patch: Partial<VaultPageState>): void => {
    dispatchPageState({ type: 'patch', patch });
  };

  const updateRotateValue = (name: string, value: string): void => {
    dispatchPageState({ type: 'update_rotate_value', name, value });
  };

  const notifyClipboard = (message: string): void => {
    patchPageState({ clipboardStatus: message });
    window.setTimeout(() => patchPageState({ clipboardStatus: '' }), 2500);
  };

  const copyWithFeedback = (value: string, successMessage: string): void => {
    void copyText(value).then((ok) => {
      notifyClipboard(ok ? successMessage : 'Clipboard unavailable.');
    });
  };

  const selectTemplate = (template: SecretTemplate): void => {
    patchPageState({
      activeTemplateName: template.name,
      secretName: template.name,
      secretCategory: template.category,
      secretValue: ''
    });
  };

  const handleSaveSecret = (): void => {
    const normalizedName = secretName.trim();
    const normalizedCategory = secretCategory.trim() || 'general';
    if (!normalizedName || !secretValue.trim()) {
      return;
    }

    void saveVaultSecret(normalizedName, {
      value: secretValue,
      category: normalizedCategory,
      approved: true
    }).then(() => {
      patchPageState({
        secretValue: '',
        clipboardStatus: `Stored ${normalizedName} in vault.`
      });
      window.setTimeout(() => patchPageState({ clipboardStatus: '' }), 2500);
    });
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 20 } }
  };

  const isUnlocked = Boolean(vaultStatus && !vaultStatus.locked);
  const isInitialized = Boolean(vaultStatus?.initialized);
  const canResetEmptyVault = Boolean(
    vaultStatus?.initialized &&
      vaultStatus.locked &&
      vaultStatus.secretCount === 0 &&
      vaultStatus.revokedSecretCount === 0
  );
  const secretCommitDisabledReason = !token
    ? 'Set the API token in Settings first.'
    : !isUnlocked
      ? 'Unlock the vault to write or rotate secrets.'
      : !secretValue.trim()
        ? 'Enter a secret value to enable commit.'
        : '';

  return renderVaultPage({
    activeSecretNames,
    activeSecrets,
    activeTemplate,
    bootstrapVault,
    canResetEmptyVault,
    clipboardStatus,
    containerVariants,
    copyWithFeedback,
    handleSaveSecret,
    isInitialized,
    isUnlocked,
    itemVariants,
    lockVault,
    masterRotationMaterial,
    material,
    patchPageState,
    refreshVault,
    resetEmptyVault,
    revokedSecrets,
    revokeVaultSecret,
    rotateByName,
    rotateVaultMaster,
    saveVaultSecret,
    secretCommitDisabledReason,
    secretValue,
    selectTemplate,
    showAdvanced,
    showMaterial,
    token,
    unlockVault,
    updateRotateValue,
    vaultStatus
  });
}

function renderVaultPage(input: {
  activeSecretNames: Set<string>;
  activeSecrets: ReturnType<typeof useAppStore.getState>['vaultSecrets'];
  activeTemplate: SecretTemplate;
  bootstrapVault: ReturnType<typeof useAppStore.getState>['bootstrapVault'];
  canResetEmptyVault: boolean;
  clipboardStatus: string;
  containerVariants: Variants;
  copyWithFeedback: (value: string, successMessage: string) => void;
  handleSaveSecret: () => void;
  isInitialized: boolean;
  isUnlocked: boolean;
  itemVariants: Variants;
  lockVault: ReturnType<typeof useAppStore.getState>['lockVault'];
  masterRotationMaterial: string;
  material: string;
  patchPageState: (patch: Partial<VaultPageState>) => void;
  refreshVault: ReturnType<typeof useAppStore.getState>['refreshVault'];
  resetEmptyVault: ReturnType<typeof useAppStore.getState>['resetEmptyVault'];
  revokedSecrets: ReturnType<typeof useAppStore.getState>['vaultSecrets'];
  revokeVaultSecret: ReturnType<typeof useAppStore.getState>['revokeVaultSecret'];
  rotateByName: Record<string, string>;
  rotateVaultMaster: ReturnType<typeof useAppStore.getState>['rotateVaultMaster'];
  saveVaultSecret: ReturnType<typeof useAppStore.getState>['saveVaultSecret'];
  secretCommitDisabledReason: string;
  secretValue: string;
  selectTemplate: (template: SecretTemplate) => void;
  showAdvanced: boolean;
  showMaterial: boolean;
  token: string | null;
  unlockVault: ReturnType<typeof useAppStore.getState>['unlockVault'];
  updateRotateValue: (name: string, value: string) => void;
  vaultStatus: ReturnType<typeof useAppStore.getState>['vaultStatus'];
}) {
  const {
    activeSecretNames,
    activeSecrets,
    activeTemplate,
    bootstrapVault,
    canResetEmptyVault,
    clipboardStatus,
    containerVariants,
    copyWithFeedback,
    handleSaveSecret,
    isInitialized,
    isUnlocked,
    itemVariants,
    lockVault,
    masterRotationMaterial,
    material,
    patchPageState,
    refreshVault,
    resetEmptyVault,
    revokedSecrets,
    revokeVaultSecret,
    rotateByName,
    rotateVaultMaster,
    saveVaultSecret,
    secretCommitDisabledReason,
    secretValue,
    selectTemplate,
    showAdvanced,
    showMaterial,
    token,
    unlockVault,
    updateRotateValue,
    vaultStatus
  } = input;

  return (
    <LazyMotion features={domAnimation}>
      <div className="shell-page shell-page-wide space-y-6 pb-10">
        <m.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          className="shrink-0"
        >
          <PageIntro
            eyebrow="Infrastructure"
            title="Vault"
            description="Keep the active secret registry visible first. Unlock, rotate, or recover only when you need to touch credentials."
            actions={
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void refreshVault()}
                  className="shell-button-ghost group flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-white"
                  title="Refresh Vault Status"
                >
                  <ArrowsClockwise size={18} className="transition-transform duration-700 group-hover:rotate-180" />
                </button>
                {isUnlocked ? (
                  <MagneticButton variant="danger" onClick={() => void lockVault()}>
                    <Lock size={16} weight="duotone" /> Lock Vault
                  </MagneticButton>
                ) : null}
              </div>
            }
            stats={[
              {
                label: 'Vault',
                value: isInitialized ? (isUnlocked ? 'Unlocked' : 'Locked') : 'Uninitialized',
                tone: isUnlocked ? 'positive' : isInitialized ? 'warn' : 'neutral'
              },
              {
                label: 'Active secrets',
                value: activeSecrets.length,
                tone: activeSecrets.length > 0 ? 'positive' : 'neutral'
              },
              {
                label: 'Revoked',
                value: revokedSecrets.length,
                tone: revokedSecrets.length > 0 ? 'warn' : 'neutral'
              },
              {
                label: 'Key versions',
                value: vaultStatus?.keyVersions.length ?? 0,
                tone: (vaultStatus?.keyVersions.length ?? 0) > 0 ? 'neutral' : 'warn'
              }
            ]}
          />
        </m.div>

        <m.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="space-y-8 lg:col-span-5 lg:self-start">
            <m.section variants={itemVariants} className="shell-panel p-6 shrink-0">
              <header className="mb-6">
                <h2 className="text-lg font-medium text-white">Master Access</h2>
              </header>

              <div className="relative z-10 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-400">Master Material / Passphrase</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => patchPageState({ showMaterial: !showMaterial })}
                        className="p-1 text-slate-500 transition-colors hover:text-slate-300"
                      >
                        {showMaterial ? <EyeSlash size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextMaterial = generateMaterialCandidate();
                          patchPageState({
                            material: nextMaterial,
                            masterRotationMaterial: nextMaterial
                          });
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--shell-accent)] transition-colors hover:brightness-110"
                      >
                        <Sparkle size={12} weight="fill" />
                        Generate Strong
                      </button>
                    </div>
                  </div>
                  <input
                    type={showMaterial ? 'text' : 'password'}
                    value={material}
                    onChange={(event) => patchPageState({ material: event.target.value })}
                    className="shell-field w-full rounded-xl px-4 py-3 font-mono text-sm"
                    placeholder="Enter passphrase to unlock..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {!isInitialized ? (
                    <MagneticButton
                      variant="primary"
                      disabled={!token || material.trim().length === 0}
                      onClick={() => void bootstrapVault(material.trim())}
                      className="col-span-2 py-3"
                    >
                      <LockOpen size={18} weight="duotone" />
                      Bootstrap Vault
                    </MagneticButton>
                  ) : (
                    <MagneticButton
                      variant="primary"
                      disabled={!token || material.trim().length === 0 || isUnlocked}
                      onClick={() => void unlockVault(material.trim())}
                      className="col-span-2 py-3"
                    >
                      <LockOpen size={18} weight="duotone" />
                      {isUnlocked ? 'Vault Unlocked' : 'Unlock Vault'}
                    </MagneticButton>
                  )}

                  <MagneticButton
                    variant="secondary"
                    disabled={!material.trim()}
                    onClick={() => copyWithFeedback(material.trim(), 'Master material copied to clipboard.')}
                    className="col-span-2"
                  >
                    <Copy size={16} weight="duotone" />
                    Copy Material to Clipboard
                  </MagneticButton>
                </div>

                {canResetEmptyVault ? (
                  <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
                    <p className="text-xs text-amber-200">
                      Vault is initialized but empty. If you lost the original material, reset empty vault keys and bootstrap again.
                    </p>
                    <div className="mt-2">
                      <MagneticButton
                        variant="danger"
                        disabled={!token}
                        onClick={() => void resetEmptyVault()}
                        className="w-full"
                      >
                        <WarningCircle size={16} weight="duotone" />
                        Reset Empty Vault Keys
                      </MagneticButton>
                    </div>
                  </div>
                ) : null}
              </div>
            </m.section>

            <m.div variants={itemVariants} className="shrink-0">
              <div className="shell-panel overflow-hidden">
                <button
                  onClick={() => patchPageState({ showAdvanced: !showAdvanced })}
                  className="flex w-full items-center justify-between p-6 transition-colors hover:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-300">Advanced Operations</span>
                  </div>
                  <m.div animate={{ rotate: showAdvanced ? 90 : 0 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
                    <CaretRight size={16} className="text-slate-500" />
                  </m.div>
                </button>

                <AnimatePresence>
                  {showAdvanced ? (
                    <m.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="shell-panel-muted border-t border-white/10"
                    >
                      <div className="p-6">
                        <div className="space-y-8">
                          <div className="space-y-4">
                            <h4 className="border-b border-slate-800 pb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Master Key Rotation</h4>
                            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                              <div className="mb-4 flex items-start gap-3">
                                <WarningCircle size={20} className="mt-0.5 shrink-0 text-rose-400" />
                                <p className="text-xs leading-relaxed text-rose-300/80">
                                  Rotating the master key will re-encrypt all active secrets. Ensure you securely store the new master material immediately.
                                </p>
                              </div>
                              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
                                <input
                                  value={masterRotationMaterial}
                                  onChange={(event) => patchPageState({ masterRotationMaterial: event.target.value })}
                                  className="shell-field min-w-0 flex-1 rounded-lg border-rose-500/30 px-3 py-2 font-mono text-xs text-rose-200 placeholder:text-rose-300/35 focus:border-rose-500/60 sm:min-w-[14rem]"
                                  placeholder="New master material..."
                                />
                                <button
                                  disabled={!token || masterRotationMaterial.trim().length === 0}
                                  onClick={() => void rotateVaultMaster(masterRotationMaterial.trim())}
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/30 disabled:opacity-50 sm:w-auto"
                                >
                                  <Key size={14} weight="duotone" />
                                  Execute Rotation
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="border-b border-slate-800 pb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                              Tombstone Log ({revokedSecrets.length})
                            </h4>
                            {revokedSecrets.length === 0 ? (
                              <p className="text-sm italic text-slate-600">No revoked secrets.</p>
                            ) : (
                              <div className="max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                                <div className="flex flex-wrap gap-2">
                                  {revokedSecrets.map((secret) => (
                                    <div key={secret.id} className="shell-panel-soft inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px]">
                                      <span className="select-text font-mono text-slate-400 line-through opacity-70">{secret.name}</span>
                                      <span className="text-slate-600">|</span>
                                      <span className="text-slate-500 uppercase tracking-wider">
                                        {secret.revokedAt ? new Date(secret.revokedAt).toLocaleDateString() : 'unknown'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </m.div>
          </div>

          <div className="space-y-8 pb-12 lg:col-span-7">
            <m.section variants={itemVariants} className="space-y-6">
              <header className="shell-panel-soft sticky top-0 z-10 flex items-end justify-between rounded-2xl border-b border-white/10 px-6 py-4">
                <div>
                  <h2 className="text-lg font-medium text-white">Configure Secrets</h2>
                </div>
                {clipboardStatus ? (
                  <m.span
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 rounded-full border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--shell-accent)]"
                  >
                    <CheckCircle size={14} weight="fill" />
                    {clipboardStatus}
                  </m.span>
                ) : null}
              </header>

              <div className="grid grid-cols-1 gap-3 shrink-0 sm:grid-cols-2">
                {SECRET_TEMPLATES.map((template) => {
                  const selected = template.name === activeTemplate.name;
                  const configured = activeSecretNames.has(template.name);

                  return (
                    <m.button
                      layout
                      key={template.name}
                      onClick={() => selectTemplate(template)}
                      className={`relative flex flex-col items-start overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
                        selected
                          ? 'border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)]'
                          : 'shell-panel-soft hover:border-white/16'
                      }`}
                    >
                      {selected ? (
                        <m.div
                          layoutId="active-integration-glow"
                          className="pointer-events-none absolute inset-0 bg-[color:var(--shell-accent-soft)] opacity-70"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                        />
                      ) : null}
                      <div className="relative z-10 mb-2 flex w-full items-center justify-between">
                        <span className="text-sm font-medium text-slate-200">{template.label}</span>
                        {configured ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]">
                            <CheckCircle size={12} weight="bold" />
                          </span>
                        ) : null}
                      </div>
                      <p className="relative z-10 line-clamp-2 text-[11px] text-slate-500">{template.description}</p>
                      <div className="relative z-10 mt-auto flex w-full items-center justify-between pt-3">
                        <span className="max-w-[140px] truncate select-text font-mono text-[10px] text-slate-600">{template.envKey}</span>
                        <span className={`text-[9px] font-semibold uppercase tracking-wider ${template.required ? 'text-amber-500/80' : 'text-slate-600'}`}>
                          {template.required ? 'Core' : 'Optional'}
                        </span>
                      </div>
                    </m.button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <m.div
                  key={activeTemplate.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="shell-panel p-6 shrink-0"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-medium text-white">{activeTemplate.label}</h3>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 block text-xs font-medium text-slate-400">Secret Payload (Write-Only)</p>
                      <textarea
                        value={secretValue}
                        onChange={(event) => patchPageState({ secretValue: event.target.value })}
                        className="shell-field h-28 w-full resize-none rounded-xl p-4 font-mono text-sm"
                        placeholder={`Paste secret material for ${activeTemplate.label}...`}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4 border-b border-slate-800/50 pb-5 sm:flex-row">
                      <p className="text-xs text-slate-500">Sensitive categories are auto-approved in this guided flow.</p>
                      <MagneticButton
                        variant="primary"
                        disabled={secretCommitDisabledReason.length > 0}
                        onClick={handleSaveSecret}
                        className="w-full sm:w-auto"
                      >
                        <LockOpen size={16} weight="duotone" />
                        Commit Secret to Vault
                      </MagneticButton>
                    </div>
                    {secretCommitDisabledReason ? (
                      <p className="text-[11px] text-amber-300">{secretCommitDisabledReason}</p>
                    ) : (
                      <p className="text-[11px] text-slate-500">Tip: selecting a configured card lets you rotate it by committing a new value.</p>
                    )}

                    <div className="shell-panel-soft rounded-xl p-3">
                      <p className="text-xs text-[var(--shell-text)]">Vault-first mode is active.</p>
                      <p className="mt-1 text-[11px] text-[var(--shell-muted)]">
                        Default secret names are auto-wired at runtime. You do not need to edit <code>.env</code> to use stored secrets.
                      </p>
                      <p className="mt-2 text-[11px] text-[var(--shell-muted)]">
                        If you want explicit/custom references, set <code>vault://secret_name</code> directly in Config.
                      </p>
                    </div>
                  </div>
                </m.div>
              </AnimatePresence>

              <m.div variants={itemVariants} className="shell-panel p-6 shrink-0">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-white">Manage Secrets</h3>
                  </div>
                </div>

                {activeSecrets.length === 0 ? (
                  <p className="shell-panel-soft rounded-xl border-dashed px-4 py-6 text-center text-sm text-slate-500">No secrets stored yet.</p>
                ) : (
                  <div className="max-h-[min(28rem,calc(100dvh-24rem))] space-y-3 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                    {activeSecrets.map((secret) => (
                      <div key={secret.id} className="shell-panel-soft rounded-xl p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="select-text font-mono text-xs text-slate-300">{secret.name}</p>
                          <p className="select-text text-[10px] text-slate-600">v{secret.keyVersion}</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            value={rotateByName[secret.name] ?? ''}
                            onChange={(event) => updateRotateValue(secret.name, event.target.value)}
                            className="shell-field flex-1 rounded-lg px-3 py-2 text-xs"
                            placeholder="New secret value..."
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={!token || !(rotateByName[secret.name] ?? '').trim()}
                              onClick={() =>
                                void saveVaultSecret(secret.name, {
                                  value: (rotateByName[secret.name] ?? '').trim(),
                                  category: secret.category,
                                  approved: true
                                }).then(() => {
                                  updateRotateValue(secret.name, '');
                                })
                              }
                              className="shell-button-accent rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
                            >
                              Replace Value
                            </button>
                            <button
                              type="button"
                              disabled={!token}
                              onClick={() => void revokeVaultSecret(secret.name, 'delete')}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                            >
                              <Trash size={13} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </m.div>
            </m.section>
          </div>
        </m.div>
      </div>
    </LazyMotion>
  );
}
