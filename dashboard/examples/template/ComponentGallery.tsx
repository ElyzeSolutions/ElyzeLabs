import { useCallback, useEffect, useMemo, useState } from 'react';

import type { EventRow, ModuleAction, ModuleRow, ReadinessCheck } from '../../types/dashboard';
import { ActionButton } from './ActionButton';
import { EmptyState } from './EmptyState';
import { EventFeed } from './EventFeed';
import { ExampleTable } from './ExampleTable';
import { KpiCard } from './KpiCard';
import { ModuleCard } from './ModuleCard';
import { NoticeStrip } from './NoticeStrip';
import { ReadinessChecks } from './ReadinessChecks';
import { SectionCard } from './SectionCard';
import { LegacyShellShowcase } from './legacy/LegacyShellShowcase';
import { LegacyThemeSwatches } from './legacy/LegacyThemeSwatches';
import { VirtualizedEventList } from './data/VirtualizedEventList';
import { AuditTrailList, type AuditTrailEntry } from './patterns/AuditTrailList';
import { ContextLensBar, type LensOption } from './patterns/ContextLensBar';
import { FilterBar, type FilterGroup, type FilterOption, type SavedViewOption } from './patterns/FilterBar';
import { GuardrailMeter } from './patterns/GuardrailMeter';
import { HeadlineStatStrip } from './patterns/HeadlineStatStrip';
import { MetricCardGrid } from './patterns/MetricCardGrid';
import { OnboardingPromptCard } from './patterns/OnboardingPromptCard';
import { SettingsWorkbench, type SettingsWorkbenchTab } from './patterns/SettingsWorkbench';
import { SnapshotComparisonGrid, type SnapshotPanel } from './patterns/SnapshotComparisonGrid';
import { TabbedInspector } from './patterns/TabbedInspector';
import { TemplateDataTable } from './patterns/TemplateDataTable';
import { TimelineInspector, type TimelineStep } from './patterns/TimelineInspector';
import { TrendPanel } from './patterns/TrendPanel';

const ACTIONS: ModuleAction[] = ['start', 'pause', 'stop', 'restart'];

export function ComponentGallery() {
  const [lastAction, setLastAction] = useState<string>('No sample action yet.');
  const [showOnboardingPrompt, setShowOnboardingPrompt] = useState<boolean>(false);
  const [selectedSignalLensIds, setSelectedSignalLensIds] = useState<string[]>(['ops_live', 'sandbox']);
  const [activeLedgerLensId, setActiveLedgerLensId] = useState<string>('all');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [selectedStatusFilterIds, setSelectedStatusFilterIds] = useState<string[]>([
    'running',
    'paused',
    'done',
    'failed',
  ]);
  const [selectedLaneFilterIds, setSelectedLaneFilterIds] = useState<string[]>(['ops', 'batch', 'edge']);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string>('all');
  const [selectedJobId, setSelectedJobId] = useState<string>('q_1042');

  const sampleModules = useMemo<ModuleRow[]>(
    () => [
      {
        id: 'worker_alpha',
        name: 'Worker Alpha',
        owner: 'platform',
        category: 'worker',
        description: 'Handles queue processing with adaptive backpressure.',
        status: 'running',
        health: 'healthy',
        queue_depth: 4,
        cpu_pct: 28.2,
        memory_mb: 348,
        uptime_sec: 4212,
        last_event_at: new Date().toISOString(),
      },
      {
        id: 'worker_beta',
        name: 'Worker Beta',
        owner: 'ops',
        category: 'integration',
        description: 'Dispatches notifications and external status updates.',
        status: 'paused',
        health: 'degraded',
        queue_depth: 0,
        cpu_pct: 3,
        memory_mb: 192,
        uptime_sec: 1870,
        last_event_at: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      },
    ],
    [],
  );

  const sampleEvents = useMemo<EventRow[]>(
    () => [
      {
        id: 'evt_sample_001',
        ts: new Date().toISOString(),
        source: 'worker_alpha',
        type: 'heartbeat',
        level: 'info',
        message: 'Batch flush completed in 122ms.',
        data: { latency_ms: 122 },
      },
      {
        id: 'evt_sample_002',
        ts: new Date(Date.now() - 1000 * 45).toISOString(),
        source: 'worker_beta',
        type: 'queue_paused',
        level: 'warning',
        message: 'Paused due to external dependency backoff window.',
        data: { cooldown_sec: 30 },
      },
      {
        id: 'evt_sample_003',
        ts: new Date(Date.now() - 1000 * 90).toISOString(),
        source: 'orchestrator_core',
        type: 'dispatch_summary',
        level: 'debug',
        message: 'Dispatch checkpoint saved (13 completed / 2 pending).',
        data: { completed: 13, pending: 2 },
      },
    ],
    [],
  );

  const checks = useMemo<ReadinessCheck[]>(
    () => [
      { name: 'core_modules_running', ok: true },
      { name: 'event_flow_active', ok: true },
      { name: 'incident_budget', ok: false },
    ],
    [],
  );

  const tableRows = useMemo(
    () => [
      { id: 'job_001', worker: 'worker_alpha', status: 'running', attempts: '1', queuedAt: '09:12:14' },
      { id: 'job_002', worker: 'worker_beta', status: 'paused', attempts: '2', queuedAt: '09:12:49' },
      { id: 'job_003', worker: 'worker_alpha', status: 'done', attempts: '1', queuedAt: '09:13:04' },
    ],
    [],
  );

  const filterableJobs = useMemo(
    () => [
      {
        id: 'q_1042',
        name: 'Queue Drain',
        owner: 'worker_alpha',
        status: 'running',
        lane: 'ops',
        priority: 'P1',
        startedAt: '23:18:14',
        startedEpoch: 1_762_151_894,
        durationSec: 532,
        attempts: 1,
      },
      {
        id: 'q_1049',
        name: 'Ingest Replay',
        owner: 'worker_beta',
        status: 'paused',
        lane: 'batch',
        priority: 'P2',
        startedAt: '23:08:09',
        startedEpoch: 1_762_151_289,
        durationSec: 172,
        attempts: 2,
      },
      {
        id: 'q_1054',
        name: 'Rebuild Index',
        owner: 'worker_gamma',
        status: 'done',
        lane: 'edge',
        priority: 'P3',
        startedAt: '22:57:20',
        startedEpoch: 1_762_150_640,
        durationSec: 248,
        attempts: 1,
      },
      {
        id: 'q_1055',
        name: 'Dependency Sync',
        owner: 'worker_delta',
        status: 'failed',
        lane: 'ops',
        priority: 'P1',
        startedAt: '22:55:43',
        startedEpoch: 1_762_150_543,
        durationSec: 94,
        attempts: 3,
      },
      {
        id: 'q_1059',
        name: 'Archive Sweep',
        owner: 'worker_alpha',
        status: 'running',
        lane: 'batch',
        priority: 'P2',
        startedAt: '23:22:31',
        startedEpoch: 1_762_152_151,
        durationSec: 210,
        attempts: 1,
      },
      {
        id: 'q_1060',
        name: 'Cache Warmup',
        owner: 'worker_epsilon',
        status: 'paused',
        lane: 'edge',
        priority: 'P3',
        startedAt: '23:03:47',
        startedEpoch: 1_762_151_027,
        durationSec: 301,
        attempts: 2,
      },
    ],
    [],
  );

  const savedViewOptions = useMemo<SavedViewOption[]>(
    () => [
      { id: 'all', label: 'All Jobs' },
      { id: 'watchlist', label: 'Watchlist' },
      { id: 'paused', label: 'Paused Only' },
      { id: 'failures', label: 'Needs Review' },
      { id: 'custom', label: 'Custom View' },
    ],
    [],
  );

  const savedViewPresets = useMemo<Record<string, { status: string[]; lanes: string[]; query: string }>>(
    () => ({
      all: {
        status: ['running', 'paused', 'done', 'failed'],
        lanes: ['ops', 'batch', 'edge'],
        query: '',
      },
      watchlist: {
        status: ['running', 'failed'],
        lanes: ['ops', 'edge'],
        query: '',
      },
      paused: {
        status: ['paused'],
        lanes: ['ops', 'batch', 'edge'],
        query: '',
      },
      failures: {
        status: ['failed'],
        lanes: ['ops', 'batch', 'edge'],
        query: '',
      },
    }),
    [],
  );

  const applySavedView = useCallback((viewId: string) => {
    if (viewId === 'custom') {
      setActiveSavedViewId('custom');
      return;
    }
    const preset = savedViewPresets[viewId] ?? savedViewPresets.all;
    setActiveSavedViewId(viewId in savedViewPresets ? viewId : 'all');
    setSelectedStatusFilterIds([...preset.status]);
    setSelectedLaneFilterIds([...preset.lanes]);
    setFilterQuery(preset.query);
  }, [savedViewPresets]);

  const toggleStatusFilter = useCallback((optionId: string) => {
    setActiveSavedViewId('custom');
    setSelectedStatusFilterIds((previous) =>
      previous.includes(optionId)
        ? previous.filter((entry) => entry !== optionId)
        : [...previous, optionId],
    );
  }, []);

  const toggleLaneFilter = useCallback((optionId: string) => {
    setActiveSavedViewId('custom');
    setSelectedLaneFilterIds((previous) =>
      previous.includes(optionId)
        ? previous.filter((entry) => entry !== optionId)
        : [...previous, optionId],
    );
  }, []);

  const resetFilterBar = useCallback(() => {
    applySavedView('all');
  }, [applySavedView]);

  const statusFilterOptions = useMemo<FilterOption[]>(
    () => {
      const counts = filterableJobs.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      }, {});
      return [
        { id: 'running', label: 'Running', count: counts.running ?? 0, tone: 'emerald' },
        { id: 'paused', label: 'Paused', count: counts.paused ?? 0, tone: 'amber' },
        { id: 'done', label: 'Done', count: counts.done ?? 0, tone: 'cyan' },
        { id: 'failed', label: 'Failed', count: counts.failed ?? 0, tone: 'rose' },
      ];
    },
    [filterableJobs],
  );

  const laneFilterOptions = useMemo<FilterOption[]>(
    () => {
      const counts = filterableJobs.reduce<Record<string, number>>((acc, row) => {
        acc[row.lane] = (acc[row.lane] ?? 0) + 1;
        return acc;
      }, {});
      return [
        { id: 'ops', label: 'Ops', count: counts.ops ?? 0, tone: 'cyan' },
        { id: 'batch', label: 'Batch', count: counts.batch ?? 0, tone: 'emerald' },
        { id: 'edge', label: 'Edge', count: counts.edge ?? 0, tone: 'amber' },
      ];
    },
    [filterableJobs],
  );

  const filterGroups = useMemo<FilterGroup[]>(
    () => [
      {
        id: 'status',
        label: 'Status',
        selectedIds: selectedStatusFilterIds,
        options: statusFilterOptions,
        onToggle: toggleStatusFilter,
      },
      {
        id: 'lane',
        label: 'Lane',
        selectedIds: selectedLaneFilterIds,
        options: laneFilterOptions,
        onToggle: toggleLaneFilter,
      },
    ],
    [
      laneFilterOptions,
      selectedLaneFilterIds,
      selectedStatusFilterIds,
      statusFilterOptions,
      toggleLaneFilter,
      toggleStatusFilter,
    ],
  );

  const filteredJobs = useMemo(() => {
    const normalizedSearch = filterQuery.trim().toLowerCase();
    return filterableJobs.filter((row) => {
      const matchesStatus = selectedStatusFilterIds.includes(row.status);
      const matchesLane = selectedLaneFilterIds.includes(row.lane);
      const matchesSearch = normalizedSearch.length === 0 || (
        `${row.id} ${row.name} ${row.owner} ${row.priority}`.toLowerCase().includes(normalizedSearch)
      );
      return matchesStatus && matchesLane && matchesSearch;
    });
  }, [filterQuery, filterableJobs, selectedLaneFilterIds, selectedStatusFilterIds]);

  useEffect(() => {
    if (!filteredJobs.length) {
      if (selectedJobId !== '') setSelectedJobId('');
      return;
    }
    if (!filteredJobs.some((row) => row.id === selectedJobId)) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  const timelineByJobId = useMemo<Record<string, TimelineStep[]>>(
    () => ({
      q_1042: [
        {
          id: 'q_1042_1',
          label: 'Queued',
          summary: 'Job accepted by runtime coordinator.',
          timestamp: '23:18:14',
          status: 'done',
          detail: 'Assigned to worker_alpha in ops lane.',
        },
        {
          id: 'q_1042_2',
          label: 'Capacity Check',
          summary: 'Capacity guardrails passed.',
          timestamp: '23:18:19',
          status: 'done',
          detail: 'Queue depth and CPU headroom within safe limits.',
        },
        {
          id: 'q_1042_3',
          label: 'Processing',
          summary: 'Step 4/6 currently executing.',
          timestamp: '23:26:01',
          status: 'active',
          detail: 'Waiting on downstream dependency flush response.',
        },
      ],
      q_1049: [
        {
          id: 'q_1049_1',
          label: 'Queued',
          summary: 'Batch replay request accepted.',
          timestamp: '23:08:09',
          status: 'done',
          detail: 'Replay window 7d, incremental mode.',
        },
        {
          id: 'q_1049_2',
          label: 'Dependency Hold',
          summary: 'Job paused by dependency backoff.',
          timestamp: '23:10:12',
          status: 'warning',
          detail: 'Will auto-resume after connector cooldown.',
        },
      ],
      q_1054: [
        {
          id: 'q_1054_1',
          label: 'Queued',
          summary: 'Edge rebuild requested.',
          timestamp: '22:57:20',
          status: 'done',
          detail: 'Request came from scheduled maintenance job.',
        },
        {
          id: 'q_1054_2',
          label: 'Completed',
          summary: 'Index rebuilt and validated.',
          timestamp: '23:01:28',
          status: 'done',
          detail: 'Post-check sample coverage 99.8%.',
        },
      ],
      q_1055: [
        {
          id: 'q_1055_1',
          label: 'Queued',
          summary: 'Dependency synchronization started.',
          timestamp: '22:55:43',
          status: 'done',
          detail: 'Attempt 1 failed due to upstream timeout.',
        },
        {
          id: 'q_1055_2',
          label: 'Retry',
          summary: 'Retries exhausted after 3 attempts.',
          timestamp: '22:57:17',
          status: 'error',
          detail: 'Escalated with status failed and incident tag.',
        },
      ],
      q_1059: [
        {
          id: 'q_1059_1',
          label: 'Queued',
          summary: 'Archive sweep enqueued.',
          timestamp: '23:22:31',
          status: 'done',
          detail: 'Batch lane selected with medium priority.',
        },
        {
          id: 'q_1059_2',
          label: 'Processing',
          summary: 'Sweep in progress.',
          timestamp: '23:24:42',
          status: 'active',
          detail: 'Current pass 2 of 5.',
        },
      ],
      q_1060: [
        {
          id: 'q_1060_1',
          label: 'Queued',
          summary: 'Cache warmup submitted.',
          timestamp: '23:03:47',
          status: 'done',
          detail: 'Warmup set includes 120 key patterns.',
        },
        {
          id: 'q_1060_2',
          label: 'Paused',
          summary: 'Execution paused by operator.',
          timestamp: '23:08:48',
          status: 'pending',
          detail: 'Manual resume required before next stage.',
        },
      ],
    }),
    [],
  );

  const selectedJob = useMemo(
    () => filteredJobs.find((row) => row.id === selectedJobId) ?? null,
    [filteredJobs, selectedJobId],
  );

  const selectedTimelineSteps = useMemo(
    () => (selectedJob ? (timelineByJobId[selectedJob.id] ?? []) : []),
    [selectedJob, timelineByJobId],
  );

  const virtualizedEvents = useMemo<EventRow[]>(
    () =>
      Array.from({ length: 160 }, (_, index) => {
        const seed = sampleEvents[index % sampleEvents.length];
        return {
          ...seed,
          id: `evt_virtual_${index + 1}`,
          ts: new Date(Date.now() - index * 12_000).toISOString(),
          message: `${seed.message} [${index + 1}]`,
        };
      }),
    [sampleEvents],
  );

  const inspectorTabs = useMemo(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        content: (
          <div className="space-y-2">
            <NoticeStrip kind="info" message="Queue pressure reduced by 22% after backoff window." />
            <NoticeStrip kind="warning" message="One worker still running in degraded mode." />
          </div>
        ),
      },
      {
        id: 'incidents',
        label: 'Incidents',
        badge: 2,
        content: (
          <div className="space-y-2 text-xs text-slate-300">
            <p className="rounded border border-rose-400/30 bg-rose-500/10 p-2">worker_beta timeout spike detected.</p>
            <p className="rounded border border-amber-400/30 bg-amber-500/10 p-2">notification_bridge backlog above threshold.</p>
          </div>
        ),
      },
      {
        id: 'actions',
        label: 'Actions',
        content: (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Run Triage" />
            <ActionButton label="Pause Queue" tone="amber" />
            <ActionButton label="Escalate" tone="slate" />
          </div>
        ),
      },
    ],
    [],
  );

  const analyticsMetrics = useMemo(
    () => [
      { id: 'throughput', label: 'Throughput', value: '1.9k/h', detail: 'rolling 1h average' },
      { id: 'latency', label: 'Latency P95', value: '188ms', detail: 'service tier A', accent: 'text-amber-300' },
      { id: 'success', label: 'Success Rate', value: '99.4%', detail: 'last 24h', accent: 'text-emerald-300' },
      { id: 'errors', label: 'Error Budget', value: '0.6%', detail: 'remaining', accent: 'text-rose-300' },
    ],
    [],
  );

  const trendPoints = useMemo(
    () => [
      { label: '00', value: 9 },
      { label: '04', value: 14 },
      { label: '08', value: 21 },
      { label: '12', value: 18 },
      { label: '16', value: 24 },
      { label: '20', value: 16 },
    ],
    [],
  );

  const signalLensOptions = useMemo<LensOption[]>(
    () => [
      { id: 'ops_live', label: 'Ops Live', shortLabel: 'OPS', tone: 'cyan' },
      { id: 'batch_live', label: 'Batch Live', shortLabel: 'BATCH', tone: 'emerald' },
      { id: 'sandbox', label: 'Sandbox', shortLabel: 'TEST', tone: 'amber' },
    ],
    [],
  );

  const ledgerLensOptions = useMemo<LensOption[]>(
    () => [
      { id: 'all', label: 'All Pools', shortLabel: 'ALL', tone: 'amber' },
      { id: 'cluster_a', label: 'Cluster A', shortLabel: 'A', tone: 'cyan' },
      { id: 'cluster_b', label: 'Cluster B', shortLabel: 'B', tone: 'emerald' },
    ],
    [],
  );

  const activeSignalSummary = useMemo(() => {
    if (selectedSignalLensIds.length === signalLensOptions.length) return 'Signals: All lanes';
    if (selectedSignalLensIds.length === 0) return 'Signals: No lane selected';
    const map = new Map(signalLensOptions.map((option) => [option.id, option.label]));
    return `Signals: ${selectedSignalLensIds.map((id) => map.get(id) ?? id).join(' + ')}`;
  }, [selectedSignalLensIds, signalLensOptions]);

  function toggleSignalLens(id: string) {
    setSelectedSignalLensIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
    );
  }

  function selectAllSignalLens() {
    setSelectedSignalLensIds(signalLensOptions.map((option) => option.id));
  }

  const settingsWorkbenchTabs = useMemo<SettingsWorkbenchTab[]>(
    () => [
      {
        id: 'modules',
        label: 'Modules',
        helper: 'Enable module families and runtime fallbacks.',
        content: (
          <div className="space-y-2">
            <NoticeStrip kind="info" message="Core lanes enabled for all environments." />
            <NoticeStrip kind="warning" message="External connector lane requires operator approval." />
            <div className="flex flex-wrap gap-2">
              <ActionButton label="Apply Baseline" />
              <ActionButton label="Pause External" tone="amber" />
            </div>
          </div>
        ),
      },
      {
        id: 'profiles',
        label: 'Profiles',
        helper: 'Profile-scoped limits and execution defaults.',
        badge: 3,
        content: (
          <ExampleTable
            title="Profile Registry"
            rows={[
              { id: 'profile_a', name: 'Primary Live', mode: 'live', status: 'active' },
              { id: 'profile_b', name: 'Batch Runner', mode: 'live', status: 'active' },
              { id: 'profile_c', name: 'Sandbox', mode: 'paper', status: 'paused' },
            ]}
            columns={[
              { key: 'name', header: 'Profile', render: (row) => row.name },
              { key: 'mode', header: 'Mode', render: (row) => row.mode },
              { key: 'status', header: 'Status', render: (row) => row.status },
            ]}
          />
        ),
      },
      {
        id: 'advanced',
        label: 'Advanced',
        helper: 'Operator-level overrides and diagnostics.',
        dirty: true,
        content: (
          <div className="space-y-2">
            <NoticeStrip kind="error" message="Unsaved override: queue retry window changed from 20s to 35s." />
            <ActionButton label="Review Diff" tone="slate" />
          </div>
        ),
      },
    ],
    [],
  );

  const snapshotPanels = useMemo<SnapshotPanel[]>(
    () => [
      {
        id: 'live_scope',
        label: 'Live Scope',
        meta: '2 profiles',
        tone: 'emerald',
        metrics: [
          { id: 'equity', label: 'Equity', value: '$184,200' },
          { id: 'pnl', label: 'P&L', value: '+$12,340', accentClassName: 'text-emerald-300' },
          { id: 'open', label: 'Open Units', value: '18' },
        ],
      },
      {
        id: 'test_scope',
        label: 'Test Scope',
        meta: '1 profile',
        tone: 'amber',
        metrics: [
          { id: 'equity', label: 'Equity', value: '$41,880' },
          { id: 'pnl', label: 'P&L', value: '-$380', accentClassName: 'text-rose-300' },
          { id: 'open', label: 'Open Units', value: '4' },
        ],
      },
    ],
    [],
  );

  const portfolioHeadlineStats = useMemo(
    () => [
      { id: 'open_units', label: 'Open Units', value: '22', detail: 'across 3 clusters', tone: 'neutral' as const },
      { id: 'trading_pnl', label: 'Cycle P&L', value: '+$11,960', detail: 'rolling 24h', tone: 'positive' as const },
      { id: 'unrealized', label: 'Unrealized', value: '-$420', detail: 'active jobs only', tone: 'negative' as const },
      { id: 'exposure', label: 'Total Exposure', value: '$226,080', detail: 'live + sandbox', tone: 'accent' as const },
    ],
    [],
  );

  const auditEntries = useMemo<AuditTrailEntry[]>(
    () => [
      {
        id: 'audit_001',
        status: 'approved',
        source: 'ops_live · queue_pause',
        reason: 'Backoff window approved for dependency throttling.',
        actor: 'ops.lead',
        timestamp: '2m ago',
      },
      {
        id: 'audit_002',
        status: 'blocked',
        source: 'batch_live · release_job',
        reason: 'Blocked by guardrail: retry debt above threshold.',
        actor: 'policy.engine',
        timestamp: '11m ago',
      },
      {
        id: 'audit_003',
        status: 'pending',
        source: 'sandbox · connector_switch',
        reason: 'Waiting for secondary review before routing changes.',
        actor: 'orchestrator',
        timestamp: '19m ago',
      },
    ],
    [],
  );

  return (
    <section className="space-y-4">
      <SectionCard
        title="Component Gallery"
        subtitle="Reusable building blocks for new control-plane projects"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Readiness" value="94.2%" detail="ready tier" accent="text-emerald-300" />
          <KpiCard label="Workers" value="12" detail="9 active / 3 paused" />
          <KpiCard label="Queue Depth" value="37" detail="burst recovered" accent="text-amber-300" />
          <KpiCard label="Incidents" value="1" detail="operator acknowledged" accent="text-rose-300" />
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <SectionCard title="Module Cards" subtitle="Status badge, actions, and compact metrics">
          <div className="space-y-3">
            {sampleModules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                actions={ACTIONS}
                disabled={false}
                busyAction={null}
                onAction={(moduleId, action) => setLastAction(`Sample action: ${action} -> ${moduleId}`)}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="States" subtitle="Ready-to-drop state patterns">
          <div className="space-y-2">
            <NoticeStrip kind="info" message="Informational state: polling healthy and event loop stable." />
            <NoticeStrip kind="warning" message="Warning state: queue depth above soft threshold." />
            <NoticeStrip kind="error" message="Error state: downstream bridge disconnected." />
            <NoticeStrip kind="info" message={lastAction} />
            <div className="pt-1">
              <ReadinessChecks checks={checks} />
            </div>
            <div className="pt-1">
              <EmptyState title="Empty Collection" message="Use this when a dataset has no rows yet." />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <ActionButton label="Primary Action" tone="cyan" />
              <ActionButton label="Secondary Action" tone="amber" />
              <ActionButton label="Disabled Action" tone="slate" disabled />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <SectionCard title="Data Table" subtitle="Simple typed table shell for queue/job lists">
          <ExampleTable
            title="Queue Jobs"
            rows={tableRows}
            columns={[
              { key: 'worker', header: 'Worker', render: (row) => row.worker },
              { key: 'status', header: 'Status', render: (row) => row.status },
              { key: 'attempts', header: 'Attempts', render: (row) => row.attempts },
              { key: 'queued_at', header: 'Queued', render: (row) => row.queuedAt },
            ]}
          />
        </SectionCard>

        <SectionCard title="Event Timeline" subtitle="Streaming/event history panel scaffold">
          <EventFeed events={sampleEvents} loading={false} maxHeightClass="max-h-[280px]" />
        </SectionCard>
      </div>

      <SectionCard
        title="Filter Bar"
        subtitle="Search + chip groups + saved views extracted from /portfolio and /settings"
      >
        <FilterBar
          title="Queue Explorer"
          subtitle="Compose custom views for operators"
          searchValue={filterQuery}
          searchPlaceholder="Search by id, name, owner, or priority"
          onSearchChange={(value) => {
            setFilterQuery(value);
            setActiveSavedViewId('custom');
          }}
          groups={filterGroups}
          savedViews={savedViewOptions}
          activeSavedViewId={activeSavedViewId}
          onSavedViewChange={applySavedView}
          onReset={resetFilterBar}
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <SectionCard
          title="Template Data Table"
          subtitle={`Sticky columns + sorting; showing ${filteredJobs.length} of ${filterableJobs.length} rows`}
        >
          <TemplateDataTable
            title="Queue Matches"
            subtitle="Click a row to inspect lifecycle details"
            rows={filteredJobs}
            selectedRowId={selectedJobId || undefined}
            onRowClick={(row) => setSelectedJobId(row.id)}
            initialSort={{ key: 'started', direction: 'desc' }}
            emptyTitle="No Matching Jobs"
            emptyMessage="Adjust search terms or broaden filters to surface more rows."
            maxHeightClassName="max-h-[360px]"
            columns={[
              {
                key: 'id',
                header: 'Job ID',
                sticky: 'left',
                widthClassName: 'min-w-[120px]',
                sortValue: (row) => row.id,
                render: (row) => <span className="font-mono text-slate-300">{row.id}</span>,
              },
              {
                key: 'name',
                header: 'Job',
                widthClassName: 'min-w-[180px]',
                sortValue: (row) => row.name,
                render: (row) => row.name,
              },
              {
                key: 'owner',
                header: 'Owner',
                sortValue: (row) => row.owner,
                render: (row) => row.owner,
              },
              {
                key: 'status',
                header: 'Status',
                sortValue: (row) => row.status,
                render: (row) => row.status,
              },
              {
                key: 'lane',
                header: 'Lane',
                sortValue: (row) => row.lane,
                render: (row) => row.lane,
              },
              {
                key: 'started',
                header: 'Started',
                sortValue: (row) => row.startedEpoch,
                render: (row) => <span className="font-mono text-slate-300">{row.startedAt}</span>,
              },
              {
                key: 'duration',
                header: 'Duration',
                align: 'right',
                sortValue: (row) => row.durationSec,
                render: (row) => <span className="font-mono">{row.durationSec}s</span>,
              },
              {
                key: 'attempts',
                header: 'Attempts',
                align: 'right',
                sortValue: (row) => row.attempts,
                render: (row) => <span className="font-mono">{row.attempts}</span>,
              },
              {
                key: 'priority',
                header: 'Priority',
                sticky: 'right',
                align: 'right',
                sortValue: (row) => row.priority,
                render: (row) => <span className="font-mono text-cyan-200">{row.priority}</span>,
              },
            ]}
          />
        </SectionCard>

        <SectionCard
          title="Timeline Inspector"
          subtitle={selectedJob ? `${selectedJob.id} · ${selectedJob.name}` : 'Select a row from the table'}
        >
          <TimelineInspector
            title="Lifecycle Steps"
            subtitle="Side-panel drilldown pattern"
            steps={selectedTimelineSteps}
          />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <SectionCard
          title="Virtualized Event List"
          subtitle="High-volume list pattern with windowed rendering"
        >
          <VirtualizedEventList
            rows={virtualizedEvents}
            rowHeight={52}
            height={310}
            getRowKey={(event) => event.id}
            renderRow={(event) => (
              <div className="flex h-[52px] items-center justify-between border-b border-slate-800/80 px-2.5 text-xs">
                <span className="truncate text-slate-300">
                  {new Date(event.ts).toLocaleTimeString()} · {event.source} · {event.type}
                </span>
                <span className="ml-2 text-slate-500">{event.level.toUpperCase()}</span>
              </div>
            )}
          />
        </SectionCard>

        <SectionCard
          title="Tabbed Inspector"
          subtitle="Reusable multi-panel inspector shell"
        >
          <TabbedInspector title="Inspector" subtitle="overview, incidents, and actions" tabs={inspectorTabs} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <SectionCard
          title="Metric Grid"
          subtitle="Reusable KPI strip wrapper"
        >
          <MetricCardGrid metrics={analyticsMetrics} columnsClassName="grid gap-3 sm:grid-cols-2" />
        </SectionCard>

        <SectionCard
          title="Trend Panel"
          subtitle="Simple trend visualization block"
        >
          <TrendPanel title="Queue Throughput" subtitle="work units per hour" points={trendPoints} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <SectionCard
          title="Accounts Patterns"
          subtitle="Lens rail + onboarding prompt extracted from /accounts"
        >
          <div className="space-y-3">
            {showOnboardingPrompt ? (
              <OnboardingPromptCard
                title="No active profiles"
                description="Add credentials first, then create a profile for this workspace."
                primaryAction={{ label: 'Add Credentials', tone: 'slate' }}
                secondaryAction={{ label: 'Create Profile', tone: 'amber' }}
              />
            ) : (
              <ContextLensBar
                signalOptions={signalLensOptions}
                selectedSignalIds={selectedSignalLensIds}
                onToggleSignal={toggleSignalLens}
                onSelectAllSignals={selectAllSignalLens}
                ledgerOptions={ledgerLensOptions}
                activeLedgerId={activeLedgerLensId}
                onSelectLedger={setActiveLedgerLensId}
                contextCount={5}
                contextLabel={`${activeSignalSummary} · Ledger: ${activeLedgerLensId}`}
              />
            )}

            <div className="flex flex-wrap gap-2">
              <ActionButton
                label={showOnboardingPrompt ? 'Show Lens Bar' : 'Show Onboarding State'}
                tone="slate"
                onClick={() => setShowOnboardingPrompt((current) => !current)}
              />
              {!showOnboardingPrompt ? (
                <ActionButton label="Select All Signal Lenses" onClick={selectAllSignalLens} />
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Settings Workbench"
          subtitle="Responsive tabbed settings shell from /settings"
        >
          <SettingsWorkbench
            title="Settings & Diagnostics"
            subtitle="Supports focused modes, badges, and unsaved-state markers"
            modeLabel="full mode"
            tabs={settingsWorkbenchTabs}
          />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <SectionCard
          title="Bankroll Patterns"
          subtitle="Snapshot comparison and risk meter extracted from /bankroll"
        >
          <div className="space-y-3">
            <SnapshotComparisonGrid
              title="Live vs Test Snapshot"
              subtitle="Compare lanes without mixing totals"
              panels={snapshotPanels}
            />
            <GuardrailMeter
              title="Risk Guardrail"
              metricLabel="Drawdown"
              currentValue={0.214}
              limitValue={0.30}
              formatValue={(value) => `${(value * 100).toFixed(1)}%`}
              warningThresholdPct={65}
              criticalThresholdPct={85}
              warningMessage="Drawdown budget above warning range."
              criticalMessage="Drawdown budget at critical range."
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Portfolio Patterns"
          subtitle="Headline strip and policy timeline extracted from /portfolio"
        >
          <div className="space-y-3">
            <HeadlineStatStrip stats={portfolioHeadlineStats} />
            <AuditTrailList title="Policy Audit Trail" entries={auditEntries} />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Legacy Shell Examples"
        subtitle="Polybot-inspired sidebar, topbar, mobile history/nav composition"
      >
        <LegacyShellShowcase />
      </SectionCard>

      <SectionCard
        title="Theme Swatches"
        subtitle="Keep this palette/background direction for recognizable dashboard tone"
      >
        <LegacyThemeSwatches />
      </SectionCard>
    </section>
  );
}
