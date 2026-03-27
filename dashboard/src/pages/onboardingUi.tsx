import type { ElementType, ReactNode } from 'react';
import {
  CheckCircle,
  Warning,
  Lock,
  ShieldCheck,
  RocketLaunch,
  Building,
  Fingerprint,
  ArrowRight,
  ArrowsClockwise,
  Layout
} from '@phosphor-icons/react';
import { m, type Variants } from 'framer-motion';

import type {
  OnboardingProviderLiveCheckRow,
  OnboardingProviderLiveDiagnosticsRow,
  OnboardingStateRow,
  OnboardingStepRow,
  VendorBootstrapResultRow
} from '../app/types';
import { toKeyedNonEmptyStrings } from '../lib/listKeys';

export type UiStepId = 'auth' | OnboardingStepRow['id'];
export type UiStepStatus = OnboardingStepRow['status'];

export interface UiStep {
  id: UiStepId;
  title: string;
  status: UiStepStatus;
  detail: string;
  updatedAt: string | null;
}

export const ONBOARDING_STEP_ORDER: OnboardingStepRow['id'][] = ['ceo_baseline', 'vault', 'provider_keys', 'smoke_run'];

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 20 } }
};

const PANEL_CLASS =
  'relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] shadow-[0_26px_90px_rgba(0,0,0,0.24)]';
const SUBPANEL_CLASS = 'rounded-[1.35rem] border border-white/10 bg-black/20';
export const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-[var(--shell-text)] placeholder:text-white/35 outline-none transition-colors focus:border-[color:var(--shell-accent-border)] focus:bg-white/[0.05]';
export const INPUT_WITH_ICON_CLASS =
  'h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-[var(--shell-text)] placeholder:text-white/35 outline-none transition-colors focus:border-[color:var(--shell-accent-border)] focus:bg-white/[0.05]';
const COMPACT_INPUT_CLASS =
  'h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-[var(--shell-text)] placeholder:text-white/35 outline-none transition-colors focus:border-[color:var(--shell-accent-border)] focus:bg-white/[0.05]';
export const TEXTAREA_CLASS =
  'w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[var(--shell-text)] placeholder:text-white/35 outline-none transition-colors focus:border-[color:var(--shell-accent-border)] focus:bg-white/[0.05] resize-y';

export const STEP_METADATA: Record<UiStepId, { title: string; detail: string; accent: string; icon: ElementType }> = {
  auth: {
    title: 'Control Plane Auth',
    detail: 'Validate your API token against the gateway before setup can continue.',
    accent: 'amber',
    icon: Fingerprint
  },
  ceo_baseline: {
    title: 'Organization Identity',
    detail: 'Synchronize your company name and initialize the core CEO agent profile.',
    accent: 'accent',
    icon: Building
  },
  vault: {
    title: 'Security Vault',
    detail: 'Initialize encrypted storage for your sensitive API keys and provider credentials.',
    accent: 'emerald',
    icon: ShieldCheck
  },
  provider_keys: {
    title: 'Model Connectivity',
    detail: 'Save Telegram plus OpenRouter/Google here. GitHub is required via env and detected automatically. Voyage remains recommended.',
    accent: 'slate',
    icon: Fingerprint
  },
  smoke_run: {
    title: 'System Ignition',
    detail: 'Run a validation smoke test to confirm the model path and runtime are operational.',
    accent: 'fuchsia',
    icon: RocketLaunch
  }
};

const STEP_PENDING_STYLES: Record<UiStepId, { icon: string; badge: string }> = {
  auth: {
    icon: 'border border-amber-300/18 bg-amber-300/12 text-amber-100',
    badge: 'text-amber-200'
  },
  ceo_baseline: {
    icon: 'border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]',
    badge: 'text-[var(--shell-accent)]'
  },
  vault: {
    icon: 'border border-emerald-400/18 bg-emerald-400/12 text-emerald-100',
    badge: 'text-emerald-200'
  },
  provider_keys: {
    icon: 'border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] text-[var(--shell-accent)]',
    badge: 'text-[var(--shell-accent)]'
  },
  smoke_run: {
    icon: 'border border-fuchsia-400/18 bg-fuchsia-400/12 text-fuchsia-100',
    badge: 'text-fuchsia-200'
  }
};

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 10_000) {
    return `${(durationMs / 1_000).toFixed(1)}s`;
  }
  return `${Math.round(durationMs / 1_000)}s`;
}

function formatBootstrapTarget(target: 'skills' | 'tools' | 'all' | 'baseline-skills'): string {
  switch (target) {
    case 'all':
      return 'ALL';
    case 'baseline-skills':
      return 'BASELINE SKILLS';
    case 'skills':
      return 'SKILLS';
    case 'tools':
      return 'TOOLS';
  }
}

export function describeBootstrapRun(target: 'skills' | 'tools' | 'all' | 'baseline-skills'): {
  loading: string;
  success: string;
} {
  switch (target) {
    case 'all':
      return {
        loading: 'Running full vendor bootstrap...',
        success: 'Vendor bootstrap finished.'
      };
    case 'baseline-skills':
      return {
        loading: 'Repairing baseline skills...',
        success: 'Baseline skills repair finished.'
      };
    case 'skills':
      return {
        loading: 'Running skills bootstrap...',
        success: 'Skills bootstrap finished.'
      };
    case 'tools':
      return {
        loading: 'Running tools bootstrap...',
        success: 'Tools bootstrap finished.'
      };
  }
}

export function BentoStepCard({
  id,
  step,
  loading,
  variants,
  children,
  isLocked,
  className = ''
}: {
  id: UiStepId;
  step?: UiStep;
  loading: boolean;
  variants: Variants;
  children: ReactNode;
  isLocked?: boolean;
  className?: string;
}) {
  const meta = STEP_METADATA[id];
  const Icon = meta.icon;
  const isComplete = step?.status === 'complete';
  const isBlocked = step?.status === 'blocked';
  const pendingStyle = STEP_PENDING_STYLES[id];
  const cardClass = isComplete
    ? 'border-emerald-400/20 bg-emerald-400/8'
    : isBlocked
      ? 'border-rose-400/20 bg-rose-400/8'
      : 'border-white/10 bg-white/[0.03]';
  const iconClass = isComplete
    ? 'border border-emerald-400/18 bg-emerald-400/12 text-emerald-100'
    : isBlocked
      ? 'border border-rose-400/18 bg-rose-400/12 text-rose-100'
      : pendingStyle.icon;
  const statusClass = isComplete
    ? 'text-emerald-200'
    : isBlocked
      ? 'text-rose-200'
      : pendingStyle.badge;
  const detailClass = isComplete
    ? 'text-emerald-100/80'
    : isBlocked
      ? 'text-rose-100/80'
      : 'text-[var(--shell-muted)]';

  return (
    <m.div
      variants={variants}
      initial="hidden"
      animate="show"
      className={`relative overflow-hidden rounded-[2.25rem] border p-6 shadow-[0_18px_60px_rgba(0,0,0,0.18)] transition-all sm:p-8 ${cardClass} ${className}`}
    >
      {isLocked ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[rgba(8,12,18,0.74)] backdrop-blur-sm">
          <Lock size={24} className="mb-2 text-white/50" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">Prerequisites required</p>
        </div>
      ) : null}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>
          {isComplete ? <CheckCircle size={28} weight="duotone" /> : <Icon size={28} weight="duotone" />}
        </div>
        <div className="text-right">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${statusClass}`}>
            {step?.status || (loading ? 'Syncing...' : 'Pending')}
          </span>
          {step?.updatedAt ? (
            <p className="mt-1 text-[10px] font-medium text-[var(--shell-muted)]">Verified {step.updatedAt}</p>
          ) : null}
        </div>
      </div>
      <h3 className="text-xl font-bold tracking-tight text-[var(--shell-text)]">{step?.title || meta.title}</h3>
      <p className={`mt-2 text-sm leading-relaxed ${detailClass}`}>{step?.detail || meta.detail}</p>
      {children}
    </m.div>
  );
}

export function OnboardingHeaderPanel({
  onboardingComplete,
  progressPercent,
  loading,
  onRefresh
}: {
  onboardingComplete: boolean;
  progressPercent: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  const statusLabel = onboardingComplete ? 'System ready' : 'Setup in progress';

  return (
    <m.header variants={itemVariants} className={`${PANEL_CLASS} p-6 sm:p-7`}>
      <div className="absolute -right-12 top-0 h-40 w-40 rounded-full bg-[color:var(--shell-accent-soft)] blur-[72px]" />
      <div className="absolute -left-12 bottom-0 h-36 w-36 rounded-full bg-amber-300/10 blur-[64px]" />
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <span className="inline-flex h-7 items-center rounded-full border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-2.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--shell-accent)]">
            {statusLabel}
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tighter text-[var(--shell-text)] sm:text-4xl">Foundation setup</h1>
          <p className="mt-2 max-w-[40rem] text-sm leading-6 text-[var(--shell-muted)] sm:text-base">
            Finish the core setup sequence and unlock the control plane.
          </p>
        </div>
        <div className="flex w-full items-center justify-between gap-4 rounded-[1.35rem] border border-white/10 bg-black/15 px-4 py-3 text-left sm:w-auto sm:min-w-[18rem]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--shell-muted)]">Overall progress</p>
            <p className="mt-1 text-2xl font-mono font-bold text-[var(--shell-text)]">{Math.round(progressPercent)}%</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14">
              <svg className="h-full w-full" viewBox="0 0 36 36">
                <path
                  className="stroke-white/10"
                  strokeWidth="3"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <m.path
                  className="stroke-[var(--shell-accent)]"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: progressPercent / 100 }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Layout size={18} className="text-[var(--shell-accent)]" weight="duotone" />
              </div>
            </div>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex h-11 min-w-[5.5rem] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--shell-muted)] whitespace-nowrap transition-colors hover:bg-white/[0.06] hover:text-[var(--shell-text)]"
            >
              <ArrowsClockwise size={14} className={loading ? 'animate-spin' : ''} />
              <span className="sm:hidden">Sync</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>
    </m.header>
  );
}

export function OnboardingAuthPanel({
  candidateToken,
  awaitingGatewayRestart,
  generatedApiToken,
  onTokenChange,
  onInitialize,
  onGenerate,
  onRegenerate,
  onCopy,
  onCancel
}: {
  candidateToken: string;
  awaitingGatewayRestart: boolean;
  generatedApiToken: string | null;
  onTokenChange: (value: string) => void;
  onInitialize: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onCancel: () => void;
}) {
  return (
    <m.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-8 overflow-hidden">
      <div className="rounded-[2rem] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.10),rgba(20,18,11,0.24))] p-6 backdrop-blur-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/12 text-amber-100">
            <Fingerprint size={28} weight="duotone" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-amber-50">API Authentication Required</h3>
            <p className="mt-1 text-sm leading-6 text-amber-100/80">
              Connect your dashboard to the control plane using your API token. You can generate one locally in this browser, but ElyzeLabs will only trust it after you save it as `OPS_API_TOKEN` and restart ElyzeLabs.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500/50" />
                <input
                  type="password"
                  value={candidateToken}
                  onChange={(event) => onTokenChange(event.target.value)}
                  placeholder="Paste your API token..."
                  disabled={awaitingGatewayRestart}
                  className={`${INPUT_WITH_ICON_CLASS} h-12 border-amber-300/20 bg-black/25 disabled:opacity-60`}
                />
              </div>
              <button
                onClick={onInitialize}
                disabled={awaitingGatewayRestart || candidateToken.trim().length === 0}
                className="group flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-8 text-sm font-bold text-slate-950 transition-all hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {awaitingGatewayRestart ? 'Restart ElyzeLabs First' : 'Initialize Connection'}
                <ArrowRight size={18} weight="bold" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(generatedApiToken)}
                onClick={onGenerate}
                className="h-9 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 text-[11px] font-bold uppercase tracking-wide text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-40"
              >
                Generate Token
              </button>
              <button
                type="button"
                disabled={!generatedApiToken}
                onClick={onRegenerate}
                className="h-9 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 text-[11px] font-bold uppercase tracking-wide text-amber-200 hover:bg-amber-500/15 transition-colors disabled:opacity-40"
              >
                Regenerate
              </button>
              <button
                type="button"
                disabled={!generatedApiToken}
                onClick={onCopy}
                className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[11px] font-bold uppercase tracking-wide text-[var(--shell-text)] transition-colors hover:bg-white/[0.08] disabled:opacity-40"
              >
                Copy Token
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="h-9 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[11px] font-bold uppercase tracking-wide text-[var(--shell-text)] transition-colors hover:bg-white/[0.08]"
              >
                Cancel Generation
              </button>
            </div>
            {awaitingGatewayRestart ? (
              <p className="mt-2 text-xs text-amber-200">
                Restart or redeploy ElyzeLabs, then paste the same token here and initialize the connection.
              </p>
            ) : null}
            <div className="mt-3 rounded-xl border border-amber-300/20 bg-black/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">First-run steps</p>
              <p className="mt-1 text-xs leading-5 text-amber-100/80">
                1) Save `OPS_API_TOKEN=&lt;your-token&gt;` in Dokploy Environment or `.env` 2) restart or redeploy ElyzeLabs 3) paste the same token here and click Initialize Connection.
              </p>
              <p className="mt-2 text-[11px] text-amber-200/70">
                For internet-exposed deployments, replace any placeholder token before normal use.
              </p>
            </div>
          </div>
        </div>
      </div>
    </m.section>
  );
}

export function OnboardingStatusMessages({
  error,
  notice
}: {
  error: string | null;
  notice: string | null;
}) {
  if (!error && !notice) {
    return null;
  }
  return (
    <AnimatePresenceWrapper>
      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">
          <Warning size={20} weight="fill" className="text-rose-500" />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
          <CheckCircle size={20} weight="fill" className="text-emerald-500" />
          {notice}
        </div>
      ) : null}
    </AnimatePresenceWrapper>
  );
}

function AnimatePresenceWrapper({ children }: { children: ReactNode }) {
  return (
    <m.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-2">
      {children}
    </m.div>
  );
}

export function OnboardingMetadataPanel({ onboarding }: { onboarding: OnboardingStateRow }) {
  const blockers = toKeyedNonEmptyStrings(onboarding.blockers ?? [], 'blocker');

  return (
    <m.div variants={itemVariants} className={`${PANEL_CLASS} p-8`}>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase text-[var(--shell-muted)]">Organization</p>
          <p className="text-sm font-bold text-[var(--shell-text)]">{onboarding.companyName}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase text-[var(--shell-muted)]">CEO Agent</p>
          <p className="text-sm font-mono font-bold text-[var(--shell-accent)]">{onboarding.ceoAgentId}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase text-[var(--shell-muted)]">Status</p>
          <p className="text-sm font-bold capitalize text-[var(--shell-text)]">{onboarding.status}</p>
        </div>
      </div>
      {blockers.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
          <h5 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase text-rose-400">
            <Warning size={16} weight="fill" /> Blockers Detected
          </h5>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {blockers.map((blocker) => (
              <li key={blocker.key} className="flex items-start gap-2 text-sm text-rose-200/70">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-rose-500" />
                {blocker.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </m.div>
  );
}

export function OnboardingBootstrapPanel({
  vendorSkillsBootstrapEnabled,
  vendorBootstrapReason,
  recommendedBootstrapTarget,
  busyAction,
  bootstrapBusyTarget,
  bootstrapResult,
  bootstrapLog,
  onRunBootstrap
}: {
  vendorSkillsBootstrapEnabled: boolean;
  vendorBootstrapReason: string | null;
  recommendedBootstrapTarget: 'skills' | 'tools' | 'all' | 'baseline-skills';
  busyAction: string | null;
  bootstrapBusyTarget: 'skills' | 'tools' | 'all' | 'baseline-skills' | null;
  bootstrapResult: VendorBootstrapResultRow | null;
  bootstrapLog: string;
  onRunBootstrap: (target: 'skills' | 'tools' | 'all' | 'baseline-skills') => void;
}) {
  return (
    <m.section variants={itemVariants} initial="hidden" animate="show" className={`${PANEL_CLASS} p-5 sm:p-6`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--shell-accent)]">
              Post-Deploy
            </span>
          </div>
          <h2 className="mt-3 text-xl font-bold tracking-tight text-[var(--shell-text)]">Bootstrap vendor repos</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
            {vendorSkillsBootstrapEnabled
              ? 'Run the full vendor bootstrap here once the gateway is reachable.'
              : 'Run the tools bootstrap here once the gateway is reachable.'}{' '}
            Use baseline repair only if the registry stayed on fallback skills after redeploy.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--shell-muted)]">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">GitHub token</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">git</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">uv</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">polybot</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">polyx</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
              {vendorSkillsBootstrapEnabled ? 'Vendor skills enabled' : 'Baseline skills baked in'}
            </span>
          </div>
          {vendorBootstrapReason ? (
            <details className={`mt-4 ${SUBPANEL_CLASS} overflow-hidden`}>
              <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--shell-muted)]">
                Why baseline repair may be needed
              </summary>
              <div className="border-t border-white/8 px-4 py-3 text-xs leading-6 text-[var(--shell-muted)]">
                {vendorBootstrapReason}
              </div>
            </details>
          ) : null}
        </div>

        <div className={`grid gap-2 ${vendorSkillsBootstrapEnabled ? 'sm:grid-cols-4 lg:min-w-[30rem]' : 'sm:grid-cols-2 lg:min-w-[28rem]'}`}>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => onRunBootstrap(recommendedBootstrapTarget)}
            className="shell-button-accent h-11 rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
          >
            {bootstrapBusyTarget === recommendedBootstrapTarget
              ? 'Running...'
              : vendorSkillsBootstrapEnabled
                ? 'Bootstrap All'
                : 'Bootstrap Tools'}
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => onRunBootstrap('baseline-skills')}
            className="h-11 rounded-xl border border-amber-600/30 bg-amber-500/10 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-500/18 disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
          >
            {bootstrapBusyTarget === 'baseline-skills' ? 'Repairing...' : 'Repair Baseline Skills'}
          </button>
          {vendorSkillsBootstrapEnabled ? (
            <div className="contents">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => onRunBootstrap('tools')}
                className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-[var(--shell-text)] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
              >
                {bootstrapBusyTarget === 'tools' ? 'Running...' : 'Tools'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => onRunBootstrap('skills')}
                className="h-11 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-[var(--shell-text)] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
              >
                {bootstrapBusyTarget === 'skills' ? 'Running...' : 'Skills'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {bootstrapResult ? (
        <div className="mt-6 space-y-3">
          <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
            <div className={`${SUBPANEL_CLASS} p-4`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--shell-muted)]">Latest run</p>
              <p className="mt-3 text-lg font-bold text-[var(--shell-text)]">{formatBootstrapTarget(bootstrapResult.target)}</p>
              <p className="mt-1 text-sm text-[var(--shell-muted)]">{formatDuration(bootstrapResult.durationMs)}</p>
              <span
                className={`mt-4 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                  bootstrapResult.status === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}
              >
                {bootstrapResult.status}
              </span>
            </div>

            <div className={`${SUBPANEL_CLASS} p-4`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--shell-muted)]">Install paths</p>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--shell-muted)]">
                Tool bin: <span className="font-mono text-slate-300">{bootstrapResult.context.toolBinDir}</span>
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--shell-muted)]">
                Tool env: <span className="font-mono text-slate-300">{bootstrapResult.context.toolEnvDir}</span>
              </p>
              {bootstrapResult.warnings.length > 0 ? (
                <p className="mt-3 text-[11px] leading-relaxed text-amber-200">{bootstrapResult.warnings.join(' ')}</p>
              ) : null}
            </div>
          </div>

          <details className={`${SUBPANEL_CLASS} overflow-hidden`}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--shell-text)]">
              Run details
            </summary>
            <div className="space-y-3 border-t border-white/8 px-4 py-4">
              {bootstrapResult.steps.map((step) => (
                <div key={step.id} className={`${SUBPANEL_CLASS} p-4`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--shell-text)]">{step.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--shell-muted)]">{step.summary}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
                      <span
                        className={`rounded-full border px-2 py-1 ${
                          step.status === 'ok'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : step.status === 'skipped'
                              ? 'border-white/10 bg-white/[0.04] text-[var(--shell-text)]'
                              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        }`}
                      >
                        {step.status}
                      </span>
                      <span className="text-[var(--shell-muted)]">{formatDuration(step.durationMs)}</span>
                    </div>
                  </div>
                  {step.command ? <p className="mt-3 font-mono text-[11px] text-[var(--shell-accent)]/80">{step.command}</p> : null}
                </div>
              ))}

              {bootstrapLog ? (
                <div className={`${SUBPANEL_CLASS} p-4`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--shell-muted)]">Transcript</p>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--shell-text)]">
                    {bootstrapLog}
                  </pre>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}
    </m.section>
  );
}

export function OnboardingProviderKeysStep({
  providerConfigured,
  providerCheckedAt,
  busyAction,
  providerLiveDiagnostics,
  providerTelegramToken,
  providerOpenrouterKey,
  providerGoogleKey,
  providerVoyageKey,
  canSaveProviderSecrets,
  providerReplaceTargets,
  providerSaveBlockers,
  canRunProviderDiagnostics,
  providerCheckBlockers,
  onProviderTelegramTokenChange,
  onProviderOpenrouterKeyChange,
  onProviderGoogleKeyChange,
  onProviderVoyageKeyChange,
  onSave,
  onVerifySetup,
  onTestLiveApis
}: {
  providerConfigured: OnboardingStateRow['providerKeys'];
  providerCheckedAt: string | null | undefined;
  busyAction: string | null;
  providerLiveDiagnostics: OnboardingProviderLiveDiagnosticsRow | null;
  providerTelegramToken: string;
  providerOpenrouterKey: string;
  providerGoogleKey: string;
  providerVoyageKey: string;
  canSaveProviderSecrets: boolean;
  providerReplaceTargets: string[];
  providerSaveBlockers: string[];
  canRunProviderDiagnostics: boolean;
  providerCheckBlockers: string[];
  onProviderTelegramTokenChange: (value: string) => void;
  onProviderOpenrouterKeyChange: (value: string) => void;
  onProviderGoogleKeyChange: (value: string) => void;
  onProviderVoyageKeyChange: (value: string) => void;
  onSave: () => void;
  onVerifySetup: () => void;
  onTestLiveApis: () => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className={`${SUBPANEL_CLASS} p-3`}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Detected Secrets Status</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              providerConfigured.telegram
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            Telegram: {providerConfigured.telegram ? 'Ready' : 'Missing'}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              providerConfigured.openrouter
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.04] text-[var(--shell-text)]'
            }`}
          >
            OpenRouter: {providerConfigured.openrouter ? 'Ready' : 'Missing'}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              providerConfigured.google
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.04] text-[var(--shell-text)]'
            }`}
          >
            Google: {providerConfigured.google ? 'Ready' : 'Missing'}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              providerConfigured.github
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.04] text-[var(--shell-text)]'
            }`}
          >
            GitHub: {providerConfigured.github ? 'Ready' : 'Missing'}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              providerConfigured.voyage
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.04] text-[var(--shell-text)]'
            }`}
          >
            Voyage: {providerConfigured.voyage ? 'Ready' : 'Missing'}
          </span>
        </div>
        <p className="mt-2 text-[10px] text-[var(--shell-muted)]">Inputs are write-only and clear after save for security.</p>
        <p className="mt-2 text-[10px] text-[var(--shell-muted)]">
          GitHub is required, but env-first: set `GITHUB_TOKEN` in Dokploy or `.env`. This badge already turns ready when the shared env token is present.
        </p>
      </div>
      <div className="shell-panel-soft rounded-xl p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--shell-accent)]">Connection Checks</p>
        <p className="mt-1 text-[11px] text-[var(--shell-text)]/90">
          Use `Verify Setup` for fast vault/env preflight. Use `Test Live APIs` for real provider API probes.
        </p>
        <p className="mt-1 text-[10px] text-[var(--shell-muted)]">
          Live API probes cover Telegram, OpenRouter, Google, GitHub, and Voyage.
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--shell-text)]/80">
          <span>Last setup check: {providerCheckedAt ?? 'never'}</span>
          {busyAction === 'key-check' ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--shell-accent)]">
              <ArrowsClockwise size={12} className="animate-spin" />
              Checking...
            </span>
          ) : null}
        </div>
        {providerLiveDiagnostics ? (
          <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-[var(--shell-text)]/80">
            <p>
              Last live test: {providerLiveDiagnostics.checkedAt}
              {' · '}
              Overall: {providerLiveDiagnostics.overall}
            </p>
            <div className="mt-1 grid grid-cols-1 gap-1">
              {(
                [
                  ['telegram', providerLiveDiagnostics.providers.telegram],
                  ['openrouter', providerLiveDiagnostics.providers.openrouter],
                  ['google', providerLiveDiagnostics.providers.google],
                  ['github', providerLiveDiagnostics.providers.github],
                  ['voyage', providerLiveDiagnostics.providers.voyage]
                ] as Array<[string, OnboardingProviderLiveCheckRow]>
              ).map(([name, result]) => (
                <p key={name} className="text-[var(--shell-text)]/75">
                  {name}: {result.status}
                  {result.latencyMs !== null ? ` (${result.latencyMs}ms)` : ''}
                  {result.detail ? ` - ${result.detail}` : ''}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <input
          type="password"
          value={providerTelegramToken}
          onChange={(event) => onProviderTelegramTokenChange(event.target.value)}
          placeholder="Telegram bot token (required)"
          className={COMPACT_INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          type="password"
          value={providerOpenrouterKey}
          onChange={(event) => onProviderOpenrouterKeyChange(event.target.value)}
          placeholder="OpenRouter key (optional if Google provided)"
          className={COMPACT_INPUT_CLASS}
        />
        <input
          type="password"
          value={providerGoogleKey}
          onChange={(event) => onProviderGoogleKeyChange(event.target.value)}
          placeholder="Google key (optional if OpenRouter provided)"
          className={COMPACT_INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-1 gap-2">
        <input
          type="password"
          value={providerVoyageKey}
          onChange={(event) => onProviderVoyageKeyChange(event.target.value)}
          placeholder="Voyage key (recommended for semantic memory)"
          className={COMPACT_INPUT_CLASS}
        />
      </div>
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          disabled={!canSaveProviderSecrets}
          onClick={onSave}
          className="shell-button-accent h-10 rounded-xl text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
        >
          {busyAction === 'provider-save'
            ? 'Saving To Vault...'
            : providerReplaceTargets.length > 0
              ? 'Save / Replace Secrets'
              : 'Save Secrets To Vault'}
        </button>
      </div>
      {providerReplaceTargets.length > 0 ? (
        <p className="text-[11px] text-amber-300">
          This will replace existing secret values for: {providerReplaceTargets.join(', ')}.
        </p>
      ) : null}
      {!canSaveProviderSecrets ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Why save is disabled</p>
          <p className="mt-1 text-[11px] text-[var(--shell-text)]">{providerSaveBlockers[0]}</p>
        </div>
      ) : null}
      <p className="text-[11px] text-[var(--shell-muted)]">
        Required: `telegram.bot_token`, one of `providers.openrouter_api_key` or `providers.google_api_key`, and `GITHUB_TOKEN` / `GH_TOKEN` / `OPS_GITHUB_PAT` in shared runtime env.
      </p>
      <p className="text-[11px] text-white/55">
        Recommended: `providers.voyage_api_key` (higher-quality semantic memory). GitHub vault fallback still works, but shared runtime env is preferred.
      </p>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--shell-accent)]">Telegram Access Policy</p>
        <p className="mt-1 text-[11px] leading-5 text-[var(--shell-text)]/85">
          Telegram provider setup only covers the bot token. Reply gating such as `Require Pairing` and Telegram allowlists is configured later in Runtime Config under `Policy` and `Telegram`. If pairing is enabled, first-time senders must be approved before the bot can answer.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <button
          disabled={!canRunProviderDiagnostics}
          onClick={onVerifySetup}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-bold text-[var(--shell-text)] disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
        >
          <ArrowsClockwise size={18} className={busyAction === 'key-check' ? 'animate-spin' : ''} />
          {busyAction === 'key-check' ? 'Verifying...' : 'Verify Setup'}
        </button>
        <button
          disabled={!canRunProviderDiagnostics}
          onClick={onTestLiveApis}
          className="shell-button-accent flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-0"
        >
          <ArrowsClockwise size={18} className={busyAction === 'key-live-check' ? 'animate-spin' : ''} />
          {busyAction === 'key-live-check' ? 'Testing APIs...' : 'Test Live APIs'}
        </button>
      </div>
      {!canRunProviderDiagnostics ? (
        <p className="text-[11px] text-[var(--shell-muted)]">Cannot run checks yet: {providerCheckBlockers[0]}</p>
      ) : null}
    </div>
  );
}
