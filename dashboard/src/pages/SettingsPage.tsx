import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { requestElevatedCheck } from '../app/api';
import { tokenStatusQueryOptions } from '../app/queryOptions';
import { useAppStore } from '../app/store';
import { PageIntro } from '../components/ops/PageHeader';

export function SettingsPage() {
  const token = useAppStore((state) => state.token);
  const setToken = useAppStore((state) => state.setToken);
  const refreshAll = useAppStore((state) => state.refreshAll);
  const connection = useAppStore((state) => state.connection);
  const triggerReconnect = useAppStore((state) => state.triggerReconnect);
  const metrics = useAppStore((state) => state.metrics);
  const queryClient = useQueryClient();

  const [candidateToken, setCandidateToken] = useState(token);
  const [elevatedResult, setElevatedResult] = useState<string>('');
  const [tokenStatusResult, setTokenStatusResult] = useState<string>('');
  
  const validateTokenMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error('Save API token first.');
      }
      return queryClient.fetchQuery(tokenStatusQueryOptions(token));
    },
    onSuccess: (status) => {
      setTokenStatusResult(
        status.configured
          ? `Gateway token configured (length ${status.length}, fingerprint ${status.fingerprint}).`
          : 'Gateway token is not configured.'
      );
    },
    onError: (error) => {
      setTokenStatusResult(error instanceof Error ? error.message : 'Token status check failed');
    }
  });

  const approvalProbeMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error('Save API token first.');
      }
      return requestElevatedCheck(token, 'dashboard.sanity-check', false);
    },
    onSuccess: () => {
      setElevatedResult('Unexpectedly allowed without approval.');
    },
    onError: (error) => {
      setElevatedResult(error instanceof Error ? error.message : 'Policy check failed');
    }
  });

  return (
    <section className="shell-page max-w-4xl">
      <PageIntro
        eyebrow="Preferences"
        title="Operator access"
        description="Save the dashboard token, validate the gateway connection, and run quick local checks. Runtime configuration lives in Control plane."
        stats={[
          {
            label: 'Connection',
            value: connection
          },
          {
            label: 'Active sessions',
            value: metrics?.find((metric) => metric.id === 'active_sessions')?.displayValue ?? '0'
          }
        ]}
      />

      <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
        <label htmlFor="settings-token-input" className="text-lg font-medium text-white block">
          API Token
        </label>
        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-start">
          <input
            id="settings-token-input"
            type="password"
            value={candidateToken}
            onChange={(event) => setCandidateToken(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-white/20 focus:outline-none"
            placeholder="Bearer token from config"
          />
          <button
            id="settings-token-save"
            type="button"
            onClick={() => setToken(candidateToken.trim())}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-slate-200 md:min-w-24 md:shrink-0 md:self-start whitespace-nowrap"
          >
            Save
          </button>
        </div>
        <p className="mt-4 text-sm text-slate-400">Connection state: {connection}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            id="settings-token-validate"
            type="button"
            onClick={() => {
              setTokenStatusResult('');
              validateTokenMutation.mutate();
            }}
            disabled={validateTokenMutation.isPending}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            {validateTokenMutation.isPending ? 'Validating...' : 'Validate against gateway'}
          </button>
          <button
            type="button"
            onClick={() => triggerReconnect()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Manual reconnect
          </button>
        </div>
        {tokenStatusResult ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">{tokenStatusResult}</p>
        ) : null}
      </article>

      <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
        <h3 className="text-lg font-medium text-white block">Approval gate</h3>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setElevatedResult('');
              approvalProbeMutation.mutate();
            }}
            disabled={approvalProbeMutation.isPending}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            {approvalProbeMutation.isPending ? 'Checking gate...' : 'Check approval gate'}
          </button>

          <button
            type="button"
            onClick={() => {
              void refreshAll();
            }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Full refresh
          </button>
        </div>

        {elevatedResult ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">{elevatedResult}</p>
        ) : null}
      </article>

      <article className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]">
        <h3 className="text-lg font-medium text-white block">Keyboard shortcuts</h3>
        <ul className="mt-4 space-y-2 text-sm text-slate-400">
          <li><kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded font-mono text-xs">Shift + S</kbd> Stop the most recent running task</li>
          <li><kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded font-mono text-xs">Shift + R</kbd> Refresh board and chats</li>
          <li><kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded font-mono text-xs">Shift + O</kbd> Jump to Office mode</li>
        </ul>
      </article>
    </section>
  );
}
