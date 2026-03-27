import {
  ArrowsClockwise,
  CheckCircle,
  Lightning,
  ShieldCheck,
  Stack,
  WarningCircle
} from '@phosphor-icons/react';
import { useCallback, useEffect, useReducer } from 'react';
import { toast } from 'sonner';

import { fetchBacklogDeliveryDetail, repairBacklogDelivery } from '../../app/api';
import type {
  BacklogDeliveryDetailRow,
  BacklogItemRow,
  GithubDeliveryJournalEntryRow,
  GithubDeliveryRepairAction,
  GithubDeliveryRepairPreviewRow
} from '../../app/types';

type GithubDeliveryCockpitProps = {
  task: BacklogItemRow;
  token: string;
  onRefresh: () => Promise<void>;
};

type GithubDeliveryCockpitState = {
  detail: BacklogDeliveryDetailRow | null;
  loading: boolean;
  error: string | null;
  actionBusy: GithubDeliveryRepairAction | null;
  preview: GithubDeliveryRepairPreviewRow | null;
  repairReceipt: Record<string, unknown> | null;
};

type GithubDeliveryCockpitAction =
  | { type: 'reset_unlinked' }
  | { type: 'load_start' }
  | { type: 'load_success'; detail: BacklogDeliveryDetailRow }
  | { type: 'load_error'; error: string }
  | { type: 'set_action_busy'; actionBusy: GithubDeliveryRepairAction | null }
  | { type: 'set_preview'; preview: GithubDeliveryRepairPreviewRow | null }
  | { type: 'set_repair_receipt'; repairReceipt: Record<string, unknown> | null };

const INITIAL_GITHUB_DELIVERY_COCKPIT_STATE: GithubDeliveryCockpitState = {
  detail: null,
  loading: true,
  error: null,
  actionBusy: null,
  preview: null,
  repairReceipt: null
};

function githubDeliveryCockpitReducer(
  state: GithubDeliveryCockpitState,
  action: GithubDeliveryCockpitAction
): GithubDeliveryCockpitState {
  switch (action.type) {
    case 'reset_unlinked':
      return {
        ...INITIAL_GITHUB_DELIVERY_COCKPIT_STATE,
        loading: false
      };
    case 'load_start':
      return {
        ...state,
        loading: true,
        error: null
      };
    case 'load_success':
      return {
        ...state,
        detail: action.detail,
        loading: false,
        error: null
      };
    case 'load_error':
      return {
        ...state,
        loading: false,
        error: action.error
      };
    case 'set_action_busy':
      return {
        ...state,
        actionBusy: action.actionBusy
      };
    case 'set_preview':
      return {
        ...state,
        preview: action.preview
      };
    case 'set_repair_receipt':
      return {
        ...state,
        repairReceipt: action.repairReceipt
      };
    default:
      return state;
  }
}

const REPAIR_ACTIONS: Array<{
  action: GithubDeliveryRepairAction;
  label: string;
  detail: string;
}> = [
  {
    action: 'refresh',
    label: 'Reconcile now',
    detail: 'Fetch canonical GitHub truth and recalculate delivery state.'
  },
  {
    action: 'verified_webhook_redrive',
    label: 'Replay verified webhook',
    detail: 'Redrive the most recent verified webhook tied to this delivery.'
  },
  {
    action: 'stale_lease_clear',
    label: 'Clear stale lease',
    detail: 'Release stale repo, delivery, and branch ownership leases.'
  },
  {
    action: 'branch_orphan_mark',
    label: 'Mark branch orphaned',
    detail: 'Record orphaned branch status and flag worktree cleanup.'
  }
];

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry ?? '').trim()).filter((entry) => entry.length > 0);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not recorded';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatLabel(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown';
  }
  return value.replace(/_/g, ' ');
}

function trustTone(entry: GithubDeliveryJournalEntryRow): string {
  if (entry.trust.verified) {
    return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100';
  }
  if (entry.kind === 'operator_repair') {
    return 'border-amber-500/25 bg-amber-500/10 text-amber-100';
  }
  return 'border-slate-700 bg-slate-900/70 text-slate-300';
}

function JournalEntryCard({ entry }: { entry: GithubDeliveryJournalEntryRow }) {
  const evidence = readRecord(entry.evidence);
  const evidencePairs = evidence ? Object.entries(evidence).slice(0, 4) : [];

  return (
    <article className="shell-panel-muted rounded-2xl p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-400">
              {formatLabel(entry.kind)}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${trustTone(entry)}`}>
              {entry.trust.verified ? 'verified' : 'local'}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-100">{entry.summary}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatTimestamp(entry.createdAt)} · {formatLabel(entry.phase)} · {formatLabel(entry.source)}
          </p>
        </div>
        {entry.status && (
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
            {formatLabel(entry.status)}
          </span>
        )}
      </div>

      {entry.reference && (
        <a
          href={entry.reference}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-xs text-[var(--shell-accent)] underline-offset-4 hover:underline"
        >
          Open reference
        </a>
      )}

      {evidencePairs.length > 0 && (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {evidencePairs.map(([key, value]) => (
            <div key={key} className="rounded-xl border border-white/6 bg-slate-950/40 px-3 py-2">
              <dt className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{formatLabel(key)}</dt>
              <dd className="mt-1 text-xs text-slate-300 break-all">{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

export function GithubDeliveryCockpit({ task, token, onRefresh }: GithubDeliveryCockpitProps) {
  const [state, dispatch] = useReducer(
    githubDeliveryCockpitReducer,
    INITIAL_GITHUB_DELIVERY_COCKPIT_STATE
  );
  const { detail, loading, error, actionBusy, preview, repairReceipt } = state;

  const loadDetail = useCallback(async (): Promise<void> => {
    if (!task.delivery?.repoConnectionId) {
      dispatch({ type: 'reset_unlinked' });
      return;
    }

    dispatch({ type: 'load_start' });
    try {
      const next = await fetchBacklogDeliveryDetail(token, task.id);
      dispatch({ type: 'load_success', detail: next });
    } catch (nextError) {
      dispatch({
        type: 'load_error',
        error: nextError instanceof Error ? nextError.message : 'Failed to load GitHub delivery detail.'
      });
    }
  }, [task.delivery?.repoConnectionId, task.id, token]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (!task.delivery?.repoConnectionId) {
    return null;
  }

  const hydratedDelivery = detail?.delivery ?? task.delivery;
  const metadata = readRecord(hydratedDelivery?.metadata) ?? {};
  const policy = readRecord(metadata.githubPolicy);
  const artifacts = readRecord(metadata.artifacts);
  const reconcile = readRecord(hydratedDelivery?.githubReconcile);
  const lastReconciledAt = typeof reconcile?.lastReconciledAt === 'string' ? reconcile.lastReconciledAt : null;
  const blockedTaxonomy = readRecord(detail?.contracts.githubDelivery?.blockedReasonTaxonomy);
  const blockedReason = hydratedDelivery?.githubStateReason ?? null;
  const blocker = blockedReason && blockedTaxonomy ? readRecord(blockedTaxonomy[blockedReason]) : null;
  const blockerSeverity = blocker && typeof blocker.severity === 'string' ? blocker.severity : null;
  const dimensionMap = readRecord(detail?.evidenceBundle?.dimensions);
  const journalEntries = detail?.journal.entries ?? [];

  const staleWarning =
    lastReconciledAt && Date.now() - new Date(lastReconciledAt).getTime() > 15 * 60 * 1000
      ? 'Reconcile evidence is older than 15 minutes. Run a refresh before acting on stale truth.'
      : null;

  const handleRepair = async (action: GithubDeliveryRepairAction) => {
    dispatch({ type: 'set_action_busy', actionBusy: action });
    dispatch({ type: 'set_preview', preview: null });
    dispatch({ type: 'set_repair_receipt', repairReceipt: null });
    try {
      const dryRun = await repairBacklogDelivery(token, task.id, {
        action,
        dryRun: true
      });
      if (dryRun.preview) {
        dispatch({ type: 'set_preview', preview: dryRun.preview });
      }
      if (!dryRun.preview?.allowed) {
        toast.error(`Repair preview blocked for ${formatLabel(action)}.`);
        return;
      }
      const confirmed = window.confirm(
        `${dryRun.preview.expectedEffects.join('\n')}\n\nProceed with ${formatLabel(action)}?`
      );
      if (!confirmed) {
        return;
      }
      const result = await repairBacklogDelivery(token, task.id, {
        action,
        idempotencyKey: dryRun.preview.idempotencyKey
      });
      dispatch({ type: 'set_repair_receipt', repairReceipt: readRecord(result.repair) });
      const next = await fetchBacklogDeliveryDetail(token, task.id);
      dispatch({ type: 'load_success', detail: next });
      await onRefresh();
      toast.success(`${formatLabel(action)} completed.`);
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Repair failed.');
    } finally {
      dispatch({ type: 'set_action_busy', actionBusy: null });
    }
  };

  return (
    <section className="space-y-4">
      <div className="shell-panel-soft rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <ShieldCheck size={14} />
              GitHub delivery cockpit
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--shell-accent)]">
                {formatLabel(hydratedDelivery?.githubState)}
              </span>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300">
                delivery {formatLabel(hydratedDelivery?.status)}
              </span>
              {policy && (
                <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-300">
                  policy {String(policy.version ?? 'unknown')} · {formatLabel(String(policy.source ?? 'unknown'))}
                </span>
              )}
            </div>
            <p className="max-w-[65ch] text-sm text-slate-400">
              Unified delivery truth combines publish state, verified webhook observations, reconcile snapshots, and repair receipts in one operator surface.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadDetail();
            }}
            className="shell-button-ghost rounded-2xl px-3 py-2 text-xs text-slate-200 hover:border-[color:var(--shell-accent-border)]"
          >
            <span className="inline-flex items-center gap-2">
              <ArrowsClockwise size={14} className={loading ? 'animate-spin' : ''} />
              Refresh detail
            </span>
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <MetricCard label="Branch" value={hydratedDelivery?.branchName ?? 'Not linked'} />
          <MetricCard label="Pull request" value={hydratedDelivery?.prUrl ?? hydratedDelivery?.prNumber?.toString() ?? 'Not open'} />
          <MetricCard label="Commit" value={hydratedDelivery?.commitSha ?? 'Missing'} />
          <MetricCard label="Last reconcile" value={formatTimestamp(lastReconciledAt)} />
        </div>
      </div>

      {(blockedReason || staleWarning || error) && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-50">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-amber-200">
            <WarningCircle size={14} />
            Delivery diagnostics
          </div>
          {blockedReason && (
            <div className="mt-2">
              <p className="font-medium">{blocker?.title ? String(blocker.title) : formatLabel(blockedReason)}</p>
              {blockerSeverity && <p className="mt-1 text-xs text-amber-100/80">Severity: {blockerSeverity}</p>}
              {readStringArray(blocker?.remediation).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {readStringArray(blocker?.remediation).map((entry) => (
                    <span key={entry} className="rounded-full border border-amber-500/25 px-2.5 py-1 text-[11px] text-amber-50">
                      {entry}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {staleWarning && <p className="mt-3 text-xs text-amber-100/90">{staleWarning}</p>}
          {error && <p className="mt-3 text-xs text-rose-200">{error}</p>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="shell-panel-soft rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <Stack size={14} />
            Unified journal
          </div>
          <div className="mt-3 space-y-3">
            {journalEntries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
                No journal entries yet. Publish, webhook, reconcile, or repair activity will appear here.
              </div>
            ) : (
              journalEntries.map((entry) => <JournalEntryCard key={entry.id} entry={entry} />)
            )}
          </div>
        </section>

        <div className="space-y-4">
          <section className="shell-panel-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <Lightning size={14} />
              Guarded repair controls
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Every action previews effects first, then records an audited receipt after confirmation.
            </p>
            <div className="mt-4 grid gap-2">
              {REPAIR_ACTIONS.map((entry) => (
                <button
                  key={entry.action}
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={() => {
                    void handleRepair(entry.action);
                  }}
                  className="shell-panel-muted flex items-start justify-between gap-3 rounded-2xl p-3 text-left transition hover:border-[color:var(--shell-accent-border)] disabled:opacity-60"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-100">{entry.label}</div>
                    <div className="mt-1 text-xs text-slate-400">{entry.detail}</div>
                  </div>
                  {actionBusy === entry.action ? (
                    <ArrowsClockwise size={14} className="mt-1 animate-spin text-[var(--shell-accent)]" />
                  ) : (
                    <CheckCircle size={14} className="mt-1 text-slate-500" />
                  )}
                </button>
              ))}
            </div>

            {preview && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Latest preview</div>
                <div className="mt-2 text-sm text-slate-100">{formatLabel(preview.action)}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {preview.expectedEffects.map((entry) => (
                    <span key={entry} className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300">
                      {formatLabel(entry)}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Idempotency key: {preview.idempotencyKey}</p>
              </div>
            )}

            {repairReceipt && (
              <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-200">Last repair receipt</div>
                <pre className="mt-2 overflow-x-auto text-xs text-emerald-50">{JSON.stringify(repairReceipt, null, 2)}</pre>
              </div>
            )}
          </section>

          <section className="shell-panel-soft rounded-2xl p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <ShieldCheck size={14} />
              Evidence parity
            </div>
            <div className="mt-4 grid gap-2">
              {Object.entries(dimensionMap ?? {}).map(([key, value]) => {
                const dimension = readRecord(value);
                const evidenceEntryIds = readStringArray(dimension?.evidenceEntryIds);
                return (
                  <div key={key} className="shell-panel-muted rounded-2xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-100">{formatLabel(key)}</span>
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                        {formatLabel(String(dimension?.status ?? 'pending'))}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{evidenceEntryIds.length} journal references</p>
                  </div>
                );
              })}
              {(!dimensionMap || Object.keys(dimensionMap).length === 0) && (
                <p className="text-sm text-slate-500">Comparative evidence bundle has not been populated yet.</p>
              )}
            </div>

            {artifacts && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Evidence label alignment</div>
                <p className="mt-2 text-sm text-slate-100">{formatLabel(String(artifacts.evidenceType ?? 'unknown'))}</p>
                <p className="mt-1 text-xs text-slate-500">Truth label: {String(artifacts.truthLabel ?? 'unknown')}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="shell-panel-muted rounded-2xl p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-medium text-slate-100 break-all">{value}</div>
    </div>
  );
}
