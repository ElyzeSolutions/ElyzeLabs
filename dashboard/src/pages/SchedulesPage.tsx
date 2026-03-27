import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';

import {
  createSchedule,
  deleteSchedule,
  pauseSchedule,
  resumeSchedule,
  runScheduleNow,
  updateSchedule
} from '../app/api';
import {
  browserSessionVaultQueryOptions,
  invalidateScheduleReadQueries,
  scheduleAgentProfilesQueryOptions,
  scheduleDetailQueryOptions,
  schedulesQueryOptions,
  sessionsQueryOptions
} from '../app/queryOptions';
import { useAppStore } from '../app/store';
import type {
  AgentProfileRow,
  BrowserExtractorId,
  BrowserExtractionMode,
  BrowserSessionVaultState,
  CardMetric,
  ScheduleConcurrencyPolicy,
  ScheduleDeliveryTarget,
  ScheduleDetailState,
  ScheduleRow,
  ScheduleSessionTarget,
  SessionRow
} from '../app/types';
import { PageDisclosure, PageIntro } from '../components/ops/PageHeader';

type ScheduleJobMode = 'agent_prompt' | 'browser_capture' | 'workflow';
type WorkflowTemplateId = 'news_digest' | 'browser_monitor' | 'social_profile_watch' | 'repo_check' | 'follow_up';
type BrowserScheduleIntent =
  | 'article_read'
  | 'document_lookup'
  | 'structured_extract'
  | 'dynamic_app'
  | 'monitor'
  | 'download_probe';

type BrowserScheduleFormState = {
  url: string;
  intent: BrowserScheduleIntent;
  extractionMode: BrowserExtractionMode;
  extractorId: BrowserExtractorId | '';
  selector: string;
  waitSelector: string;
  dynamicLikely: boolean;
  requiresStealth: boolean;
  requiresProxy: boolean;
  requiresVisibleBrowser: boolean;
  requiresDownload: boolean;
  mainContentOnly: boolean;
  cacheTtlMs: string;
  sessionProfileId: string;
  suspiciousPromptInjection: boolean;
  previewChars: string;
};

type ScheduleFormState = {
  label: string;
  category: string;
  cadence: string;
  targetAgentId: string;
  prompt: string;
  sessionTarget: ScheduleSessionTarget;
  deliveryTarget: ScheduleDeliveryTarget;
  deliveryTargetSessionId: string;
  runtime: '' | 'codex' | 'claude' | 'gemini' | 'process';
  model: string;
  requestedBy: string;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  jobMode: ScheduleJobMode;
  browser: BrowserScheduleFormState;
  workflow: {
    templateId: WorkflowTemplateId;
    focus: string;
  };
  metadata: Record<string, unknown>;
};

const BROWSER_SCHEDULE_DEFAULTS: BrowserScheduleFormState = {
  url: 'https://www.tiktok.com/@tiktok',
  intent: 'monitor',
  extractionMode: 'markdown',
  extractorId: '',
  selector: '',
  waitSelector: '',
  dynamicLikely: true,
  requiresStealth: false,
  requiresProxy: false,
  requiresVisibleBrowser: false,
  requiresDownload: false,
  mainContentOnly: false,
  cacheTtlMs: '',
  sessionProfileId: '',
  suspiciousPromptInjection: false,
  previewChars: '400'
};

const WORKFLOW_TEMPLATE_CONFIG: Record<
  WorkflowTemplateId,
  {
    label: string;
    eyebrow: string;
    description: string;
    category: string;
    cadenceHint: string;
    focusLabel: string;
    usesBrowser: boolean;
  }
> = {
  news_digest: {
    label: 'News digest',
    eyebrow: 'polyx / search',
    description: 'Gather and summarize the latest source-backed developments on a topic or account.',
    category: 'news_digest',
    cadenceHint: 'every weekday at 08:00',
    focusLabel: 'Topic, company, or account',
    usesBrowser: false
  },
  browser_monitor: {
    label: 'Browser monitor',
    eyebrow: 'scrapling',
    description: 'Run governed browser capture directly on cadence with artifacts and deterministic receipts.',
    category: 'browser_monitor',
    cadenceHint: 'every 30m',
    focusLabel: 'What should the operator care about?',
    usesBrowser: true
  },
  social_profile_watch: {
    label: 'Social profile watch',
    eyebrow: 'social metrics',
    description: 'Track profile metrics or visible content changes on TikTok, X, Pinterest, Reddit, and similar targets.',
    category: 'browser_monitor',
    cadenceHint: 'every 1h',
    focusLabel: 'Profile handle or watch goal',
    usesBrowser: true
  },
  repo_check: {
    label: 'Repo check',
    eyebrow: 'delivery',
    description: 'Inspect repository state, delivery drift, or unresolved blockers and return the next action.',
    category: 'repo_check',
    cadenceHint: 'every day at 09:00',
    focusLabel: 'Repo, branch, or delivery target',
    usesBrowser: false
  },
  follow_up: {
    label: 'Follow-up',
    eyebrow: 'operator loop',
    description: 'Ask an agent to re-check a task, reminder, or dependency and report the next step only.',
    category: 'follow_up',
    cadenceHint: 'every 4h',
    focusLabel: 'Task, owner, or blocker',
    usesBrowser: false
  }
};

const BROWSER_EXTRACTOR_OPTIONS: Array<{
  id: BrowserExtractorId | '';
  label: string;
  description: string;
}> = [
  {
    id: '',
    label: 'Auto',
    description: 'Let the governed browser infer the best structured summary.'
  },
  {
    id: 'generic',
    label: 'Generic',
    description: 'General-purpose summary for unfamiliar pages.'
  },
  {
    id: 'article',
    label: 'Article',
    description: 'Main article content and headline.'
  },
  {
    id: 'blog',
    label: 'Blog',
    description: 'Post title, summary, and visible metadata.'
  },
  {
    id: 'reddit_listing',
    label: 'Reddit listing',
    description: 'Visible post titles and listing summary.'
  },
  {
    id: 'tiktok_profile',
    label: 'TikTok profile',
    description: 'Profile-level following, followers, and likes.'
  },
  {
    id: 'tiktok_video',
    label: 'TikTok video',
    description: 'Video-level likes, comments, shares, and saves.'
  },
  {
    id: 'x_profile',
    label: 'X profile',
    description: 'Profile posts, following, and follower metrics.'
  },
  {
    id: 'pinterest_pin',
    label: 'Pinterest pin',
    description: 'Pin title, short description, and visible metadata.'
  }
];

const emptyForm = (): ScheduleFormState => ({
  label: '',
  category: 'follow_up',
  cadence: 'every 10m',
  targetAgentId: '',
  prompt: '',
  sessionTarget: 'dedicated_schedule_session',
  deliveryTarget: 'origin_session',
  deliveryTargetSessionId: '',
  runtime: '',
  model: '',
  requestedBy: 'dashboard',
  concurrencyPolicy: 'skip',
  jobMode: 'agent_prompt',
  browser: {
    ...BROWSER_SCHEDULE_DEFAULTS
  },
  workflow: {
    templateId: 'browser_monitor',
    focus: ''
  },
  metadata: {}
});

type ScheduleBusyState = 'refresh' | 'create' | 'save' | 'pause' | 'resume' | 'run' | 'delete' | null;

function canDeleteSchedule(schedule: ScheduleRow): boolean {
  return schedule.kind !== 'builtin';
}

function scheduleFilterLabel(kind: 'all' | 'builtin' | 'targeted'): string {
  if (kind === 'targeted') {
    return 'Custom';
  }
  if (kind === 'builtin') {
    return 'System';
  }
  return 'All';
}

function scheduleRegistryTitle(kind: 'all' | 'builtin' | 'targeted'): string {
  if (kind === 'targeted') {
    return 'Custom schedules';
  }
  if (kind === 'builtin') {
    return 'System jobs';
  }
  return 'All schedules';
}

function scheduleRegistryDescription(kind: 'all' | 'builtin' | 'targeted'): string {
  if (kind === 'targeted') {
    return 'Operator-owned schedules. These are the entries you can edit, delete, and bulk clear.';
  }
  if (kind === 'builtin') {
    return 'Core automations that keep the control plane healthy. You can pause or reroute them, but not remove them.';
  }
  return 'Combined view of custom schedules and system jobs.';
}

function scheduleOwnershipLabel(kind: ScheduleRow['kind']): string {
  return kind === 'builtin' ? 'system' : 'custom';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getWorkflowTemplateConfig(templateId: WorkflowTemplateId) {
  return WORKFLOW_TEMPLATE_CONFIG[templateId];
}

function scheduleJobModeUsesBrowser(form: ScheduleFormState): boolean {
  return form.jobMode === 'browser_capture' || (form.jobMode === 'workflow' && workflowTemplateUsesBrowser(form.workflow.templateId));
}

function scheduleJobModeLabel(jobMode: string | null): string {
  if (jobMode === 'browser_capture') {
    return 'browser capture';
  }
  if (jobMode === 'workflow') {
    return 'workflow';
  }
  return 'agent prompt';
}

const statusToneBySchedule = (schedule: ScheduleRow): CardMetric['tone'] => {
  if (schedule.lastError) {
    return 'critical';
  }
  if (schedule.paused) {
    return 'warn';
  }
  if (schedule.activeRun) {
    return 'positive';
  }
  if (schedule.isDue) {
    return 'warn';
  }
  return 'neutral';
};

const shortDateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

function formatWhen(value: string | null): string {
  if (!value) {
    return 'n/a';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : shortDateTime.format(parsed);
}

function getErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function buildBrowserSchedulePrompt(form: BrowserScheduleFormState): string {
  return `Capture ${form.url.trim()} with the governed browser capability and return only verifiable findings.`;
}

function workflowTemplateUsesBrowser(templateId: WorkflowTemplateId): boolean {
  return templateId === 'browser_monitor' || templateId === 'social_profile_watch';
}

function buildWorkflowSchedulePrompt(form: ScheduleFormState): string {
  const focus = form.workflow.focus.trim();
  if (workflowTemplateUsesBrowser(form.workflow.templateId)) {
    return buildBrowserSchedulePrompt(form.browser);
  }
  if (form.workflow.templateId === 'news_digest') {
    return focus
      ? `Use PolyX or governed browser evidence to gather the latest trending news about ${focus} and return a concise, source-backed digest.`
      : 'Use PolyX or governed browser evidence to gather the latest trending news and return a concise, source-backed digest.';
  }
  if (form.workflow.templateId === 'repo_check') {
    return focus
      ? `Inspect ${focus} and return actionable repository status, risks, and next steps only.`
      : 'Inspect the target repository and return actionable repository status, risks, and next steps only.';
  }
  return focus
    ? `Follow up on ${focus} and return the next concrete action, blockers, and owner.`
    : 'Follow up on the linked task or requester context and return the next concrete action, blockers, and owner.';
}

function buildBrowserScheduleMetadata(form: ScheduleFormState): Record<string, unknown> {
  const metadata = isRecord(form.metadata) ? { ...form.metadata } : {};
  const browserRequest = {
    url: form.browser.url.trim(),
    intent: form.browser.intent,
    extractionMode: form.browser.extractionMode,
    extractorId: form.browser.extractorId || undefined,
    dynamicLikely: form.browser.dynamicLikely,
    requiresStealth: form.browser.requiresStealth,
    requiresProxy: form.browser.requiresProxy,
    requiresVisibleBrowser: form.browser.requiresVisibleBrowser,
    requiresDownload: form.browser.requiresDownload,
    mainContentOnly: form.browser.mainContentOnly,
    suspiciousPromptInjection: form.browser.suspiciousPromptInjection,
    selector: form.browser.selector.trim() || undefined,
    waitSelector: form.browser.waitSelector.trim() || undefined,
    cacheTtlMs: Number.isFinite(Number(form.browser.cacheTtlMs)) ? Number(form.browser.cacheTtlMs) : undefined,
    sessionProfileId: form.browser.sessionProfileId.trim() || undefined,
    previewChars: Number.isFinite(Number(form.browser.previewChars)) ? Number(form.browser.previewChars) : 400
  };
  if (form.jobMode === 'workflow') {
    delete metadata.browserRequest;
    metadata.workflow = {
      templateId: form.workflow.templateId,
      focus: form.workflow.focus.trim() || undefined,
      ...(workflowTemplateUsesBrowser(form.workflow.templateId)
        ? {
            browserRequest
          }
        : {})
    };
    return metadata;
  }
  if (form.jobMode !== 'browser_capture') {
    delete metadata.browserRequest;
    delete metadata.workflow;
    return metadata;
  }
  metadata.browserRequest = browserRequest;
  delete metadata.workflow;
  return metadata;
}

function buildSchedulePayload(form: ScheduleFormState) {
  const metadata = buildBrowserScheduleMetadata(form);
  const prompt =
    form.jobMode === 'browser_capture'
      ? form.prompt.trim() || buildBrowserSchedulePrompt(form.browser)
      : form.jobMode === 'workflow'
        ? form.prompt.trim() || buildWorkflowSchedulePrompt(form)
      : form.prompt.trim();
  return {
    label: form.label,
    category: form.category,
    cadence: form.cadence,
    targetAgentId: form.targetAgentId,
    prompt,
    sessionTarget: form.sessionTarget,
    deliveryTarget: form.deliveryTarget,
    deliveryTargetSessionId: form.deliveryTargetSessionId || null,
    runtime: scheduleJobModeUsesBrowser(form) ? 'process' : form.runtime || null,
    model: scheduleJobModeUsesBrowser(form) ? null : form.model || null,
    requestedBy: form.requestedBy || 'dashboard',
    concurrencyPolicy: form.concurrencyPolicy,
    jobMode: form.jobMode === 'browser_capture' ? 'browser_capture' : form.jobMode === 'workflow' ? 'workflow' : null,
    metadata
  };
}

function setJobMode(form: ScheduleFormState, jobMode: ScheduleJobMode): ScheduleFormState {
  if (jobMode === 'browser_capture') {
    return {
      ...form,
      jobMode,
      category: form.category === 'follow_up' ? 'browser_monitor' : form.category,
      runtime: 'process',
      model: ''
    };
  }
  if (jobMode === 'workflow') {
    const workflowConfig = getWorkflowTemplateConfig(form.workflow.templateId);
    return {
      ...form,
      jobMode,
      category: workflowConfig.category,
      cadence: form.cadence === 'every 10m' ? workflowConfig.cadenceHint : form.cadence,
      runtime: workflowConfig.usesBrowser ? 'process' : form.runtime,
      model: workflowConfig.usesBrowser ? '' : form.model
    };
  }
  return {
    ...form,
    jobMode,
    category: form.category === 'browser_monitor' ? 'follow_up' : form.category
  };
}

function setWorkflowTemplate(form: ScheduleFormState, templateId: WorkflowTemplateId): ScheduleFormState {
  const workflowConfig = getWorkflowTemplateConfig(templateId);
  return {
    ...form,
    workflow: {
      ...form.workflow,
      templateId
    },
    category: workflowConfig.category,
    cadence:
      form.cadence === getWorkflowTemplateConfig(form.workflow.templateId).cadenceHint || form.cadence === 'every 10m'
        ? workflowConfig.cadenceHint
        : form.cadence,
    runtime: workflowConfig.usesBrowser ? 'process' : form.runtime === 'process' ? '' : form.runtime,
    model: workflowConfig.usesBrowser ? '' : form.model
  };
}

function toFormState(schedule: ScheduleRow): ScheduleFormState {
  const metadata = isRecord(schedule.metadata) ? schedule.metadata : {};
  const browserRequest = isRecord(metadata.browserRequest) ? metadata.browserRequest : {};
  const workflow = isRecord(metadata.workflow) ? metadata.workflow : {};
  const workflowBrowserRequest = isRecord(workflow.browserRequest) ? workflow.browserRequest : {};
  const effectiveBrowserRequest = schedule.jobMode === 'workflow' ? workflowBrowserRequest : browserRequest;
  return {
    label: schedule.label,
    category: schedule.category,
    cadence: schedule.cadence,
    targetAgentId: schedule.targetAgentId ?? '',
    prompt: schedule.prompt ?? '',
    sessionTarget: schedule.sessionTarget,
    deliveryTarget: schedule.deliveryTarget,
    deliveryTargetSessionId: schedule.deliveryTargetSessionId ?? '',
    runtime: schedule.runtime ?? '',
    model: schedule.model ?? '',
    requestedBy: schedule.requestedBy ?? 'dashboard',
    concurrencyPolicy: schedule.concurrencyPolicy,
    jobMode: schedule.jobMode === 'browser_capture' ? 'browser_capture' : schedule.jobMode === 'workflow' ? 'workflow' : 'agent_prompt',
    browser: {
      url: typeof effectiveBrowserRequest.url === 'string' ? effectiveBrowserRequest.url : '',
      intent:
        effectiveBrowserRequest.intent === 'article_read' ||
        effectiveBrowserRequest.intent === 'document_lookup' ||
        effectiveBrowserRequest.intent === 'structured_extract' ||
        effectiveBrowserRequest.intent === 'dynamic_app' ||
        effectiveBrowserRequest.intent === 'download_probe'
          ? effectiveBrowserRequest.intent
          : 'monitor',
      extractionMode:
        effectiveBrowserRequest.extractionMode === 'html' || effectiveBrowserRequest.extractionMode === 'text'
          ? effectiveBrowserRequest.extractionMode
          : 'markdown',
      extractorId:
        effectiveBrowserRequest.extractorId === 'generic' ||
        effectiveBrowserRequest.extractorId === 'article' ||
        effectiveBrowserRequest.extractorId === 'blog' ||
        effectiveBrowserRequest.extractorId === 'reddit_listing' ||
        effectiveBrowserRequest.extractorId === 'tiktok_profile' ||
        effectiveBrowserRequest.extractorId === 'tiktok_video' ||
        effectiveBrowserRequest.extractorId === 'x_profile' ||
        effectiveBrowserRequest.extractorId === 'pinterest_pin'
          ? effectiveBrowserRequest.extractorId
          : '',
      selector: typeof effectiveBrowserRequest.selector === 'string' ? effectiveBrowserRequest.selector : '',
      waitSelector: typeof effectiveBrowserRequest.waitSelector === 'string' ? effectiveBrowserRequest.waitSelector : '',
      dynamicLikely: effectiveBrowserRequest.dynamicLikely === true,
      requiresStealth: effectiveBrowserRequest.requiresStealth === true,
      requiresProxy: effectiveBrowserRequest.requiresProxy === true,
      requiresVisibleBrowser: effectiveBrowserRequest.requiresVisibleBrowser === true,
      requiresDownload: effectiveBrowserRequest.requiresDownload === true,
      mainContentOnly: effectiveBrowserRequest.mainContentOnly === true,
      cacheTtlMs:
        Number.isFinite(Number(effectiveBrowserRequest.cacheTtlMs)) && Number(effectiveBrowserRequest.cacheTtlMs) > 0
          ? String(effectiveBrowserRequest.cacheTtlMs)
          : '',
      sessionProfileId:
        typeof effectiveBrowserRequest.sessionProfileId === 'string' ? effectiveBrowserRequest.sessionProfileId : '',
      suspiciousPromptInjection: effectiveBrowserRequest.suspiciousPromptInjection === true,
      previewChars: String(effectiveBrowserRequest.previewChars ?? 400)
    },
    workflow: {
      templateId:
        workflow.templateId === 'news_digest' ||
        workflow.templateId === 'browser_monitor' ||
        workflow.templateId === 'social_profile_watch' ||
        workflow.templateId === 'repo_check'
          ? workflow.templateId
          : 'follow_up',
      focus: typeof workflow.focus === 'string' ? workflow.focus : ''
    },
    metadata
  };
}

function useSchedulesPageModel() {
  const token = useAppStore((state) => state.token);
  const navigate = useNavigate({ from: '/schedules' });
  const queryClient = useQueryClient();
  const routeSearch = useSearch({ from: '/schedules' });
  const [busy, setBusy] = useState<ScheduleBusyState>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kindFilter = routeSearch.kind ?? 'targeted';
  const query = routeSearch.query ?? '';

  const schedulesQuery = useQuery(
    schedulesQueryOptions(token, {
      kind: kindFilter === 'all' ? undefined : kindFilter
    })
  );
  const schedules = schedulesQuery.data ?? [];
  const agentProfilesQuery = useQuery(scheduleAgentProfilesQueryOptions(token));
  const agentProfiles = agentProfilesQuery.data ?? [];
  const sessionsQuery = useQuery(sessionsQueryOptions(token));
  const sessions = sessionsQuery.data ?? [];
  const vaultQuery = useQuery(browserSessionVaultQueryOptions(token));
  const vault = vaultQuery.data ?? null;

  const selectedScheduleId = useMemo(() => {
    if (!routeSearch.scheduleId) {
      return schedules[0]?.id ?? null;
    }
    return schedules.some((schedule) => schedule.id === routeSearch.scheduleId) ? routeSearch.scheduleId : schedules[0]?.id ?? null;
  }, [routeSearch.scheduleId, schedules]);

  const detailQuery = useQuery(scheduleDetailQueryOptions(token, selectedScheduleId));
  const detail = detailQuery.data ?? null;

  useEffect(() => {
    if (routeSearch.scheduleId === selectedScheduleId) {
      return;
    }
    void navigate({
      to: '/schedules',
      search: (previous) => ({
        ...previous,
        scheduleId: selectedScheduleId ?? undefined
      }),
      replace: true
    });
  }, [navigate, routeSearch.scheduleId, selectedScheduleId]);

  const refreshScheduleReads = useCallback(
    async (scheduleId?: string | null, nextKind: 'all' | 'builtin' | 'targeted' = kindFilter) => {
      if (!token) {
        return;
      }
      await invalidateScheduleReadQueries(queryClient, token);
      await Promise.all([
        queryClient.ensureQueryData(
          schedulesQueryOptions(token, {
            kind: nextKind === 'all' ? undefined : nextKind
          }) as never
        ),
        scheduleId ? queryClient.ensureQueryData(scheduleDetailQueryOptions(token, scheduleId) as never) : Promise.resolve()
      ]);
    },
    [kindFilter, queryClient, token]
  );

  const handleRefresh = useCallback(async () => {
    if (!token) {
      setMessage(null);
      setError(null);
      return;
    }
    setBusy('refresh');
    setMessage(null);
    try {
      await Promise.all([
        schedulesQuery.refetch({ throwOnError: true }),
        agentProfilesQuery.refetch({ throwOnError: true }),
        sessionsQuery.refetch({ throwOnError: true }),
        vaultQuery.refetch({ throwOnError: true }),
        selectedScheduleId ? detailQuery.refetch({ throwOnError: true }) : Promise.resolve()
      ]);
      setError(null);
    } catch (cause) {
      setError(getErrorMessage(cause, 'Failed to load schedules.'));
    } finally {
      setBusy(null);
    }
  }, [agentProfilesQuery, detailQuery, schedulesQuery, selectedScheduleId, sessionsQuery, token, vaultQuery]);

  const visibleSchedules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return schedules.filter((schedule) => {
      if (!normalizedQuery) {
        return true;
      }
      return [schedule.id, schedule.label, schedule.category, schedule.targetAgentId ?? '', schedule.requestedBy ?? ''].some((entry) =>
        entry.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [kindFilter, query, schedules]);

  const sessionProfiles = vault?.sessionProfiles ?? [];

  const queryError = [schedulesQuery.error, agentProfilesQuery.error, sessionsQuery.error, vaultQuery.error, detailQuery.error].find(
    (cause) => cause != null
  );
  const pageError = error ?? (queryError ? getErrorMessage(queryError, 'Failed to load schedules.') : null);

  const handleCreate = useCallback(
    async (form: ScheduleFormState): Promise<ScheduleRow | null> => {
      if (!token) {
        return null;
      }
      if (scheduleJobModeUsesBrowser(form) && !form.browser.url.trim()) {
        setError('Browser capture schedules require a target URL.');
        return null;
      }
      setBusy('create');
      setMessage(null);
      setError(null);
      try {
        const created = await createSchedule(token, buildSchedulePayload(form));
        await refreshScheduleReads(created.id, 'targeted');
        setMessage(`Created schedule ${created.label}.`);
        void navigate({
          to: '/schedules',
          search: (previous) => ({
            ...previous,
            kind: 'targeted',
            query: '',
            scheduleId: created.id
          }),
          replace: true
        });
        return created;
      } catch (cause) {
        setError(getErrorMessage(cause, 'Failed to create schedule.'));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [navigate, refreshScheduleReads, token]
  );

  const handleSave = useCallback(
    async (schedule: ScheduleRow, form: ScheduleFormState): Promise<void> => {
      if (!token) {
        return;
      }
      if (scheduleJobModeUsesBrowser(form) && !form.browser.url.trim()) {
        setError('Browser capture schedules require a target URL.');
        return;
      }
      setBusy('save');
      setMessage(null);
      setError(null);
      try {
        await updateSchedule(token, schedule.id, buildSchedulePayload(form));
        await refreshScheduleReads(schedule.id);
        setMessage(
          schedule.kind === 'builtin' ? `Saved routing for ${schedule.label}.` : `Updated schedule ${schedule.label}.`
        );
      } catch (cause) {
        setError(getErrorMessage(cause, 'Failed to update schedule.'));
      } finally {
        setBusy(null);
      }
    },
    [refreshScheduleReads, token]
  );

  const handleDeleteMany = useCallback(
    async (scheduleIds: string[]): Promise<void> => {
      if (!token) {
        return;
      }

      const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
      const selectedSchedules = scheduleIds
        .map((scheduleId) => scheduleById.get(scheduleId))
        .filter((schedule): schedule is ScheduleRow => Boolean(schedule && canDeleteSchedule(schedule)));

      if (selectedSchedules.length === 0) {
        setMessage(null);
        setError('Select at least one custom schedule to delete.');
        return;
      }

      const confirmed = window.confirm(
        `Delete ${selectedSchedules.length} custom schedule${selectedSchedules.length === 1 ? '' : 's'}? This also clears their run history.`
      );
      if (!confirmed) {
        return;
      }

      setBusy('delete');
      setMessage(null);
      setError(null);

      try {
        const results = await Promise.allSettled(
          selectedSchedules.map(async (schedule) => {
            await deleteSchedule(token, schedule.id);
            return schedule;
          })
        );

        const deletedSchedules = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
        const failedResults = results.filter((result) => result.status === 'rejected');
        const deletedIds = new Set(deletedSchedules.map((schedule) => schedule.id));
        const nextSelectedScheduleId =
          selectedScheduleId && deletedIds.has(selectedScheduleId) ? undefined : selectedScheduleId ?? undefined;

        await refreshScheduleReads(nextSelectedScheduleId);

        void navigate({
          to: '/schedules',
          search: (previous) => ({
            ...previous,
            scheduleId:
              previous.scheduleId && deletedIds.has(previous.scheduleId) ? undefined : previous.scheduleId
          }),
          replace: true
        });

        if (deletedSchedules.length > 0) {
          setMessage(`Deleted ${deletedSchedules.length} schedule${deletedSchedules.length === 1 ? '' : 's'}.`);
        }
        if (failedResults.length > 0) {
          const firstFailure = failedResults[0];
          const fallback = `Failed to delete ${failedResults.length} schedule${failedResults.length === 1 ? '' : 's'}.`;
          setError(firstFailure.reason instanceof Error ? firstFailure.reason.message : fallback);
        }
      } catch (cause) {
        setError(getErrorMessage(cause, 'Failed to delete schedules.'));
      } finally {
        setBusy(null);
      }
    },
    [navigate, refreshScheduleReads, schedules, selectedScheduleId, token]
  );

  const handlePauseToggle = useCallback(
    async (schedule: ScheduleRow): Promise<void> => {
      if (!token) {
        return;
      }
      setBusy(schedule.paused ? 'resume' : 'pause');
      setMessage(null);
      setError(null);
      try {
        if (schedule.paused) {
          await resumeSchedule(token, schedule.id);
          setMessage(`Resumed ${schedule.label}.`);
        } else {
          await pauseSchedule(token, schedule.id);
          setMessage(`Paused ${schedule.label}.`);
        }
        await refreshScheduleReads(schedule.id);
      } catch (cause) {
        setError(getErrorMessage(cause, 'Failed to mutate schedule.'));
      } finally {
        setBusy(null);
      }
    },
    [refreshScheduleReads, token]
  );

  const handleRunNow = useCallback(
    async (schedule: ScheduleRow): Promise<void> => {
      if (!token) {
        return;
      }
      setBusy('run');
      setMessage(null);
      setError(null);
      try {
        const result = await runScheduleNow(token, schedule.id);
        await refreshScheduleReads(schedule.id);
        setMessage(result.runId ? `Queued run ${result.runId.slice(0, 8)} for ${schedule.label}.` : `Ran ${schedule.label}.`);
      } catch (cause) {
        setError(getErrorMessage(cause, 'Failed to run schedule.'));
      } finally {
        setBusy(null);
      }
    },
    [refreshScheduleReads, token]
  );

  const handleDelete = useCallback(
    async (schedule: ScheduleRow): Promise<void> => {
      if (!token || schedule.kind === 'builtin') {
        return;
      }
      const confirmed = window.confirm(`Delete schedule ${schedule.label}? This also clears its run history.`);
      if (!confirmed) {
        return;
      }
      setBusy('delete');
      setMessage(null);
      setError(null);
      try {
        await deleteSchedule(token, schedule.id);
        await refreshScheduleReads(selectedScheduleId === schedule.id ? undefined : selectedScheduleId ?? undefined);
        setMessage(`Deleted schedule ${schedule.label}.`);
        void navigate({
          to: '/schedules',
          search: (previous) => ({
            ...previous,
            scheduleId: previous.scheduleId === schedule.id ? undefined : previous.scheduleId
          }),
          replace: true
        });
      } catch (cause) {
        setError(getErrorMessage(cause, 'Failed to delete schedule.'));
      } finally {
        setBusy(null);
      }
    },
    [navigate, refreshScheduleReads, selectedScheduleId, token]
  );

  return {
    token,
    busy,
    message,
    pageError,
    kindFilter,
    query,
    selectedScheduleId,
    visibleSchedules,
    detail,
    agentProfiles,
    sessions,
    sessionProfiles,
    navigate,
    handleCreate,
    handleRefresh,
    handleSave,
    handleRunNow,
    handlePauseToggle,
    handleDelete,
    handleDeleteMany
  };
}

export function SchedulesPage() {
  const {
    token,
    busy,
    message,
    pageError,
    kindFilter,
    query,
    selectedScheduleId,
    visibleSchedules,
    detail,
    agentProfiles,
    sessions,
    sessionProfiles,
    navigate,
    handleCreate,
    handleRefresh,
    handleSave,
    handleRunNow,
    handlePauseToggle,
    handleDelete,
    handleDeleteMany
  } = useSchedulesPageModel();

  return (
    <section className="shell-page shell-page-wide space-y-6">
      <PageIntro
        eyebrow="Workforce"
        title="Recurring work"
        description="Custom schedules stay front and center. System jobs live behind their own filter because they are core automations you can pause or reroute, but not delete."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {kindFilter !== 'builtin' ? (
              <button
                type="button"
                onClick={() =>
                  void navigate({
                    to: '/schedules',
                    search: (previous) => ({
                      ...previous,
                      kind: 'builtin',
                      scheduleId: undefined
                    })
                  })
                }
                className="shell-button-ghost inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
              >
                System jobs
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={busy === 'refresh'}
              className="shell-button-ghost inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
            >
              {busy === 'refresh' ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        }
      />

      {message ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div>
      ) : null}
      {pageError ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{pageError}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
        <ScheduleRegistryCard
          busy={busy}
          kindFilter={kindFilter}
          query={query}
          selectedScheduleId={selectedScheduleId}
          schedules={visibleSchedules}
          onRunNow={(schedule) => void handleRunNow(schedule)}
          onPauseToggle={(schedule) => void handlePauseToggle(schedule)}
          onDelete={(schedule) => void handleDelete(schedule)}
          onDeleteMany={(scheduleIds) => void handleDeleteMany(scheduleIds)}
          onKindFilterChange={(nextKind) =>
            void navigate({
              to: '/schedules',
              search: (previous) => ({
                ...previous,
                kind: nextKind,
                scheduleId: undefined
              })
            })
          }
          onQueryChange={(nextQuery) =>
            void navigate({
              to: '/schedules',
              search: (previous) => ({
                ...previous,
                query: nextQuery
              }),
              replace: true
            })
          }
          onRefresh={() => void handleRefresh()}
          onSelectSchedule={(scheduleId) =>
            void navigate({
              to: '/schedules',
              search: (previous) => ({
                ...previous,
                scheduleId
              })
            })
          }
        />
        <ScheduleDetailCard
          token={token}
          busy={busy}
          detail={detail}
          agentProfiles={agentProfiles}
          sessions={sessions}
          sessionProfiles={sessionProfiles}
          onSave={handleSave}
          onRunNow={handleRunNow}
          onPauseToggle={handlePauseToggle}
          onDelete={handleDelete}
        />
      </div>

      <PageDisclosure
        title="New schedule"
        description="Open this only when you need to create a new agent prompt, browser capture, or workflow schedule."
      >
        <ScheduleComposerCard
          token={token}
          busy={busy}
          agentProfiles={agentProfiles}
          sessions={sessions}
          sessionProfiles={sessionProfiles}
          onCreate={handleCreate}
        />
      </PageDisclosure>
    </section>
  );
}

function ScheduleComposerCard({
  token,
  busy,
  agentProfiles,
  sessions,
  sessionProfiles,
  onCreate
}: {
  token: string | null;
  busy: ScheduleBusyState;
  agentProfiles: AgentProfileRow[];
  sessions: SessionRow[];
  sessionProfiles: BrowserSessionVaultState['sessionProfiles'];
  onCreate: (form: ScheduleFormState) => Promise<ScheduleRow | null>;
}) {
  const [form, setForm] = useState<ScheduleFormState>(emptyForm);

  useEffect(() => {
    if (!form.targetAgentId && agentProfiles.length > 0) {
      setForm((current) => ({
        ...current,
        targetAgentId: agentProfiles[0]?.id ?? ''
      }));
    }
  }, [agentProfiles, form.targetAgentId]);

  const handleCreate = useCallback(async () => {
    const created = await onCreate(form);
    if (!created) {
      return;
    }
    setForm((current) => ({
      ...emptyForm(),
      targetAgentId: current.targetAgentId
    }));
  }, [form, onCreate]);

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-medium text-white">New Schedule</h3>
      </div>
      <div className="mt-4">
        <ScheduleFormEditor
          form={form}
          fieldIdPrefix="schedule-create"
          agentProfiles={agentProfiles}
          sessions={sessions}
          sessionProfiles={sessionProfiles}
          disabled={false}
          showConcurrency
          showModeSelector
          onChangeForm={(updater) => setForm(updater)}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">Interval and five-field cron expressions are supported.</div>
        <button
          id="schedule-create-submit"
          type="button"
          disabled={!token || busy === 'create'}
          onClick={() => void handleCreate()}
          className="rounded-full border border-amber-300/30 bg-amber-300/15 px-4 py-2 text-sm font-medium text-amber-50 transition hover:border-amber-200/60 hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === 'create' ? 'Creating...' : 'Create Schedule'}
        </button>
      </div>
    </div>
  );
}

function ScheduleRegistryCard({
  busy,
  kindFilter,
  query,
  selectedScheduleId,
  schedules,
  onRunNow,
  onPauseToggle,
  onDelete,
  onDeleteMany,
  onKindFilterChange,
  onQueryChange,
  onRefresh,
  onSelectSchedule
}: {
  busy: ScheduleBusyState;
  kindFilter: 'all' | 'builtin' | 'targeted';
  query: string;
  selectedScheduleId: string | null;
  schedules: ScheduleRow[];
  onRunNow: (schedule: ScheduleRow) => void;
  onPauseToggle: (schedule: ScheduleRow) => void;
  onDelete: (schedule: ScheduleRow) => void;
  onDeleteMany: (scheduleIds: string[]) => void;
  onKindFilterChange: (kind: 'all' | 'builtin' | 'targeted') => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onSelectSchedule: (scheduleId: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const deletableSchedules = useMemo(() => schedules.filter((schedule) => canDeleteSchedule(schedule)), [schedules]);
  const selectedCount = selectedIds.length;
  const allVisibleSelected = deletableSchedules.length > 0 && deletableSchedules.every((schedule) => selectedIds.includes(schedule.id));
  const registryTitle = scheduleRegistryTitle(kindFilter);
  const registryDescription = scheduleRegistryDescription(kindFilter);

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((scheduleId) => schedules.some((schedule) => canDeleteSchedule(schedule) && schedule.id === scheduleId))
    );
  }, [schedules]);

  const toggleSelected = (scheduleId: string) => {
    setSelectedIds((current) =>
      current.includes(scheduleId) ? current.filter((entry) => entry !== scheduleId) : [...current, scheduleId]
    );
  };

  return (
    <article className="shell-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium text-white">{registryTitle}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{registryDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deletableSchedules.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(allVisibleSelected ? [] : deletableSchedules.map((schedule) => schedule.id))
                }
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25 hover:text-white"
              >
                {allVisibleSelected ? 'Clear selection' : 'Select visible custom'}
              </button>
              <button
                type="button"
                disabled={selectedCount === 0 || busy === 'delete'}
                onClick={() => onDeleteMany(selectedIds)}
                className="rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/14 disabled:opacity-60"
              >
                {busy === 'delete' ? 'Deleting...' : `Delete selected${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy === 'refresh'}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25 hover:text-white disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['targeted', 'builtin', 'all'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onKindFilterChange(kind)}
            className={`rounded-full px-3 py-1.5 text-xs transition ${
              kindFilter === kind
                ? 'bg-amber-300/20 text-amber-50'
                : 'border border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            {scheduleFilterLabel(kind)}
          </button>
        ))}
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={kindFilter === 'builtin' ? 'Search system jobs' : kindFilter === 'targeted' ? 'Search custom schedules' : 'Search schedules'}
          className="min-w-[12rem] flex-1 rounded-full border border-white/10 bg-slate-950/80 px-4 py-1.5 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
        />
      </div>
      <div className="mt-4 space-y-3">
        {schedules.length === 0 ? (
          <div className="rounded-[1.3rem] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-500">
            {kindFilter === 'targeted' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>No custom schedules matched the current filter. System jobs live under the System tab.</span>
                <button
                  type="button"
                  onClick={() => onKindFilterChange('builtin')}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25 hover:text-white"
                >
                  View system jobs
                </button>
              </div>
            ) : kindFilter === 'builtin' ? (
              'No system jobs matched the current filter. These entries are system-managed and cannot be deleted.'
            ) : (
              'No schedules matched the current filter.'
            )}
          </div>
        ) : (
          schedules.map((schedule) => (
            <article
              key={schedule.id}
              className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                selectedScheduleId === schedule.id
                  ? 'border-white/20 bg-white/[0.04]'
                  : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.03]'
              }`}
            >
              <button type="button" onClick={() => onSelectSchedule(schedule.id)} className="w-full text-left">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      <span>
                        {scheduleOwnershipLabel(schedule.kind)} / {schedule.category}
                      </span>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-300">
                        {scheduleJobModeLabel(schedule.jobMode)}
                      </span>
                    </div>
                    <div className="mt-2 text-base font-semibold text-slate-50">{schedule.label}</div>
                    <div className="mt-1 text-sm text-slate-400">{schedule.cadence}</div>
                  </div>
                  <div
                    className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${
                      statusToneBySchedule(schedule) === 'critical'
                        ? 'bg-rose-400/15 text-rose-100'
                        : statusToneBySchedule(schedule) === 'warn'
                          ? 'bg-amber-300/15 text-amber-100'
                          : statusToneBySchedule(schedule) === 'positive'
                            ? 'bg-emerald-300/15 text-emerald-100'
                            : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {schedule.lastStatus ?? (schedule.paused ? 'paused' : 'idle')}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                  <div>
                    Target: <span className="text-slate-200">{schedule.targetAgentId ?? 'system'}</span>
                  </div>
                  <div>
                    Next: <span className="text-slate-200">{formatWhen(schedule.nextRunAt)}</span>
                  </div>
                  <div>
                    Requester: <span className="text-slate-200">{schedule.requestedBy ?? 'unknown'}</span>
                  </div>
                </div>
              </button>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-3">
                <div className="flex items-center gap-2">
                  {canDeleteSchedule(schedule) ? (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(schedule.id)}
                        onChange={() => toggleSelected(schedule.id)}
                        className="h-4 w-4 rounded border-white/15 bg-slate-950/80"
                      />
                      Select
                    </label>
                  ) : (
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                      System job
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onSelectSchedule(schedule.id)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/25 hover:text-white"
                >
                  {canDeleteSchedule(schedule) ? 'Edit' : 'Open'}
                </button>
                <button
                  type="button"
                  disabled={busy === 'run'}
                  onClick={() => onRunNow(schedule)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/25 hover:text-white disabled:opacity-60"
                >
                  Run now
                </button>
                <button
                  type="button"
                  disabled={busy === 'pause' || busy === 'resume'}
                  onClick={() => onPauseToggle(schedule)}
                  className={`rounded-full px-3 py-1.5 text-xs transition disabled:opacity-60 ${
                    schedule.paused
                      ? 'border border-emerald-300/30 bg-emerald-300/15 text-emerald-50'
                      : 'border border-amber-300/30 bg-amber-300/15 text-amber-50'
                  }`}
                >
                  {schedule.paused ? 'Resume' : 'Pause'}
                </button>
                {canDeleteSchedule(schedule) ? (
                  <button
                    type="button"
                    disabled={busy === 'delete'}
                    onClick={() => onDelete(schedule)}
                    className="rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/14 disabled:opacity-60"
                  >
                    Delete
                  </button>
                ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </article>
  );
}

function ScheduleDetailCard({
  token,
  busy,
  detail,
  agentProfiles,
  sessions,
  sessionProfiles,
  onSave,
  onRunNow,
  onPauseToggle,
  onDelete
}: {
  token: string | null;
  busy: ScheduleBusyState;
  detail: ScheduleDetailState | null;
  agentProfiles: AgentProfileRow[];
  sessions: SessionRow[];
  sessionProfiles: BrowserSessionVaultState['sessionProfiles'];
  onSave: (schedule: ScheduleRow, form: ScheduleFormState) => Promise<void>;
  onRunNow: (schedule: ScheduleRow) => Promise<void>;
  onPauseToggle: (schedule: ScheduleRow) => Promise<void>;
  onDelete: (schedule: ScheduleRow) => Promise<void>;
}) {
  const selectedSchedule = detail?.schedule ?? null;
  const detailHistory = detail?.history ?? [];
  const [form, setForm] = useState<ScheduleFormState | null>(selectedSchedule ? toFormState(selectedSchedule) : null);

  useEffect(() => {
    setForm(selectedSchedule ? toFormState(selectedSchedule) : null);
  }, [selectedSchedule]);

  if (!selectedSchedule || !form) {
    return (
      <article className="shell-panel p-6">
        <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center text-sm text-slate-500">
          Select a schedule to inspect its delivery path, pause state, and history.
        </div>
      </article>
    );
  }

  const limitedRoutingEdit = selectedSchedule.kind === 'builtin';
  const workflowConfig = getWorkflowTemplateConfig(form.workflow.templateId);

  return (
    <article className="shell-panel p-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-white">{selectedSchedule.label}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!token || busy === 'save'}
              onClick={() => void onSave(selectedSchedule, form)}
              className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-100 transition hover:border-white/25 hover:bg-white/[0.09] disabled:opacity-60"
            >
              {busy === 'save' ? 'Saving...' : limitedRoutingEdit ? 'Save routing' : 'Save changes'}
            </button>
            <button
              id="schedule-run-now"
              type="button"
              disabled={!token || busy === 'run'}
              onClick={() => void onRunNow(selectedSchedule)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/25 hover:text-white disabled:opacity-60"
            >
              {busy === 'run' ? 'Running...' : 'Run Now'}
            </button>
            <button
              id="schedule-pause-toggle"
              type="button"
              disabled={!token || busy === 'pause' || busy === 'resume'}
              onClick={() => void onPauseToggle(selectedSchedule)}
              className={`rounded-full px-3 py-1.5 text-xs transition disabled:opacity-60 ${
                selectedSchedule.paused
                  ? 'border border-emerald-300/30 bg-emerald-300/15 text-emerald-50'
                  : 'border border-amber-300/30 bg-amber-300/15 text-amber-50'
              }`}
            >
              {selectedSchedule.paused ? 'Resume' : 'Pause'}
            </button>
            {canDeleteSchedule(selectedSchedule) ? (
              <button
                type="button"
                disabled={!token || busy === 'delete'}
                onClick={() => void onDelete(selectedSchedule)}
                className="rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/14 disabled:opacity-60"
              >
                {busy === 'delete' ? 'Deleting...' : 'Delete'}
              </button>
            ) : null}
          </div>
        </div>

        {limitedRoutingEdit ? (
          <div className="rounded-[1.3rem] border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-sky-100">
            System jobs cannot be deleted. You can change their routing targets here and manage run state, but cadence, target agent, and prompt stay system-managed.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Requester</div>
            <div className="mt-2 text-slate-100">{selectedSchedule.requestedBy ?? 'unknown'}</div>
            <div className="mt-1 text-xs text-slate-500">{selectedSchedule.requestingSessionId ?? 'No requesting session linked'}</div>
          </div>
          <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Lane</div>
            <div className="mt-2 text-slate-100">{scheduleJobModeLabel(form.jobMode)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {scheduleJobModeUsesBrowser(form)
                ? 'Direct governed browser execution with artifact receipts.'
                : form.jobMode === 'workflow'
                  ? `${workflowConfig.label} template`
                  : selectedSchedule.deliveryTargetSessionId ?? 'Automatic routing'}
            </div>
          </div>
        </div>

        <ScheduleFormEditor
          form={form}
          fieldIdPrefix="schedule-edit"
          agentProfiles={agentProfiles}
          sessions={sessions}
          sessionProfiles={sessionProfiles}
          disabled={false}
          limitedRoutingEdit={limitedRoutingEdit}
          showModeSelector={!limitedRoutingEdit}
          onChangeForm={(updater) => setForm((current) => (current ? updater(current) : current))}
        />

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Last run {formatWhen(selectedSchedule.lastRunAt)}. Next due {formatWhen(selectedSchedule.nextRunAt)}.
          </div>
          <button
            type="button"
            disabled={!token || busy === 'save'}
            onClick={() => void onSave(selectedSchedule, form)}
            className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-100 transition hover:border-white/25 hover:bg-white/[0.09] disabled:opacity-60"
          >
            {busy === 'save' ? 'Saving...' : limitedRoutingEdit ? 'Save routing' : 'Save changes'}
          </button>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <h4 className="text-sm font-medium text-white">History</h4>
          <div className="mt-3 space-y-3">
            {detailHistory.length === 0 ? (
              <div className="text-sm text-slate-500">No schedule runs recorded yet.</div>
            ) : (
              detailHistory.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-[1.1rem] border border-white/8 bg-white/[0.03] px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-100">{entry.summary ?? entry.status}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{entry.status}</div>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                    <div>
                      Trigger: <span className="text-slate-300">{entry.trigger}</span>
                    </div>
                    <div>
                      Requested by: <span className="text-slate-300">{entry.requestedBy ?? 'unknown'}</span>
                    </div>
                    <div>
                      Created: <span className="text-slate-300">{formatWhen(entry.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <h4 className="text-sm font-medium text-white">Last Result</h4>
          <pre className="mt-3 max-h-64 overflow-auto text-[11px] leading-6 text-slate-300">
            {JSON.stringify(selectedSchedule.lastResult ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </article>
  );
}

function ScheduleFormEditor({
  form,
  fieldIdPrefix,
  agentProfiles,
  sessions,
  sessionProfiles,
  disabled,
  limitedRoutingEdit = false,
  showConcurrency = false,
  showModeSelector,
  onChangeForm
}: {
  form: ScheduleFormState;
  fieldIdPrefix: string;
  agentProfiles: AgentProfileRow[];
  sessions: SessionRow[];
  sessionProfiles: BrowserSessionVaultState['sessionProfiles'];
  disabled: boolean;
  limitedRoutingEdit?: boolean;
  showConcurrency?: boolean;
  showModeSelector: boolean;
  onChangeForm: (updater: (current: ScheduleFormState) => ScheduleFormState) => void;
}) {
  const updateField = <K extends keyof ScheduleFormState>(key: K, value: ScheduleFormState[K]) => {
    onChangeForm((current) => ({
      ...current,
      [key]: value
    }));
  };

  const updateBrowserField = <K extends keyof BrowserScheduleFormState>(key: K, value: BrowserScheduleFormState[K]) => {
    onChangeForm((current) => ({
      ...current,
      browser: {
        ...current.browser,
        [key]: value
      }
    }));
  };

  const updateWorkflowField = <K extends keyof ScheduleFormState['workflow']>(
    key: K,
    value: ScheduleFormState['workflow'][K]
  ) => {
    onChangeForm((current) => ({
      ...current,
      workflow: {
        ...current.workflow,
        [key]: value
      }
    }));
  };

  return (
    <div className="space-y-4">
      <ScheduleModeSelector
        fieldIdPrefix={fieldIdPrefix}
        disabled={disabled}
        form={form}
        showModeSelector={showModeSelector}
        onChangeForm={onChangeForm}
      />
      <ScheduleExecutionNote form={form} />
      <ScheduleWorkflowTemplatePicker
        disabled={disabled || limitedRoutingEdit}
        form={form}
        onChangeForm={onChangeForm}
      />
      <ScheduleCommonFields
        form={form}
        fieldIdPrefix={fieldIdPrefix}
        agentProfiles={agentProfiles}
        sessions={sessions}
        disabled={disabled}
        limitedRoutingEdit={limitedRoutingEdit}
        showConcurrency={showConcurrency}
        onChangeField={updateField}
        onChangeWorkflowField={updateWorkflowField}
      />
      <ScheduleBrowserFields
        form={form}
        fieldIdPrefix={fieldIdPrefix}
        sessionProfiles={sessionProfiles}
        disabled={disabled || limitedRoutingEdit}
        onChangeBrowserField={updateBrowserField}
      />
      <SchedulePromptEditor
        form={form}
        fieldIdPrefix={fieldIdPrefix}
        disabled={disabled || limitedRoutingEdit}
        onChangeField={updateField}
      />
    </div>
  );
}

function ScheduleModeSelector({
  fieldIdPrefix,
  disabled,
  form,
  showModeSelector,
  onChangeForm
}: {
  fieldIdPrefix: string;
  disabled: boolean;
  form: ScheduleFormState;
  showModeSelector: boolean;
  onChangeForm: (updater: (current: ScheduleFormState) => ScheduleFormState) => void;
}) {
  if (!showModeSelector) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        id={`${fieldIdPrefix}-mode-agent`}
        type="button"
        disabled={disabled}
        onClick={() => onChangeForm((current) => setJobMode(current, 'agent_prompt'))}
        className={`rounded-full px-3 py-1.5 text-xs transition disabled:opacity-60 ${
          form.jobMode === 'agent_prompt'
            ? 'bg-amber-300/20 text-amber-50'
            : 'border border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
        }`}
      >
        Agent prompt
      </button>
      <button
        id={`${fieldIdPrefix}-mode-browser`}
        type="button"
        disabled={disabled}
        onClick={() => onChangeForm((current) => setJobMode(current, 'browser_capture'))}
        className={`rounded-full px-3 py-1.5 text-xs transition disabled:opacity-60 ${
          form.jobMode === 'browser_capture'
            ? 'bg-amber-300/20 text-amber-50'
            : 'border border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
        }`}
      >
        Browser capture
      </button>
      <button
        id={`${fieldIdPrefix}-mode-workflow`}
        type="button"
        disabled={disabled}
        onClick={() => onChangeForm((current) => setJobMode(current, 'workflow'))}
        className={`rounded-full px-3 py-1.5 text-xs transition disabled:opacity-60 ${
          form.jobMode === 'workflow'
            ? 'bg-amber-300/20 text-amber-50'
            : 'border border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
        }`}
      >
        Workflow
      </button>
    </div>
  );
}

function ScheduleExecutionNote({ form }: { form: ScheduleFormState }) {
  if (form.jobMode === 'browser_capture') {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-300">
        This mode runs the governed browser capability directly on cadence. It does not depend on a model finishing first, which makes it the reliable lane for profile monitors and recurring web capture.
      </div>
    );
  }
  if (form.jobMode === 'workflow') {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-300">
        Workflow mode keeps schedules generic but lets you choose a repeatable operator pattern. Browser-backed templates still execute through governed Scrapling directly; research templates keep the agent lane available.
      </div>
    );
  }
  return null;
}

function ScheduleWorkflowTemplatePicker({
  disabled,
  form,
  onChangeForm
}: {
  disabled: boolean;
  form: ScheduleFormState;
  onChangeForm: (updater: (current: ScheduleFormState) => ScheduleFormState) => void;
}) {
  if (form.jobMode !== 'workflow') {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(Object.entries(WORKFLOW_TEMPLATE_CONFIG) as Array<[WorkflowTemplateId, (typeof WORKFLOW_TEMPLATE_CONFIG)[WorkflowTemplateId]]>).map(
        ([templateId, template]) => (
          <button
            key={templateId}
            type="button"
            disabled={disabled}
            onClick={() => onChangeForm((current) => setWorkflowTemplate(current, templateId))}
            className={`rounded-2xl border px-5 py-4 text-left transition disabled:opacity-60 ${
              form.workflow.templateId === templateId
                ? 'border-white/20 bg-white/[0.04]'
                : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">{template.label}</div>
              <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                {template.usesBrowser ? 'direct browser' : 'agent lane'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{template.description}</p>
            <div className="mt-3 text-xs text-slate-500">Suggested cadence: {template.cadenceHint}</div>
          </button>
        )
      )}
    </div>
  );
}

function ScheduleCommonFields({
  form,
  fieldIdPrefix,
  agentProfiles,
  sessions,
  disabled,
  limitedRoutingEdit,
  showConcurrency,
  onChangeField,
  onChangeWorkflowField
}: {
  form: ScheduleFormState;
  fieldIdPrefix: string;
  agentProfiles: AgentProfileRow[];
  sessions: SessionRow[];
  disabled: boolean;
  limitedRoutingEdit: boolean;
  showConcurrency: boolean;
  onChangeField: <K extends keyof ScheduleFormState>(key: K, value: ScheduleFormState[K]) => void;
  onChangeWorkflowField: <K extends keyof ScheduleFormState['workflow']>(key: K, value: ScheduleFormState['workflow'][K]) => void;
}) {
  const workflowConfig = getWorkflowTemplateConfig(form.workflow.templateId);
  const lockedFields = disabled || limitedRoutingEdit;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm text-slate-300">
        <span>Label</span>
        <input
          id={`${fieldIdPrefix}-label`}
          value={form.label}
          disabled={lockedFields}
          onChange={(event) => onChangeField('label', event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
          placeholder="README follow-up"
        />
      </label>
      <label className="space-y-1 text-sm text-slate-300">
        <span>Category</span>
        {form.jobMode === 'workflow' ? (
          <div className="rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-sm text-sky-50">{workflowConfig.category}</div>
        ) : (
          <input
            id={`${fieldIdPrefix}-category`}
            value={form.category}
            disabled={lockedFields}
            onChange={(event) => onChangeField('category', event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
            placeholder="follow_up"
          />
        )}
      </label>
      <label className="space-y-1 text-sm text-slate-300">
        <span>Cadence</span>
        <input
          id={`${fieldIdPrefix}-cadence`}
          value={form.cadence}
          disabled={lockedFields}
          onChange={(event) => onChangeField('cadence', event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
          placeholder="every 10m"
        />
      </label>
      {form.jobMode === 'workflow' ? (
        <label className="space-y-1 text-sm text-slate-300 sm:col-span-2">
          <span>{workflowConfig.focusLabel}</span>
          <input
            id={`${fieldIdPrefix}-workflow-focus`}
            value={form.workflow.focus}
            disabled={lockedFields}
            onChange={(event) => onChangeWorkflowField('focus', event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
            placeholder="OpenAI launches, @openai, onboarding repo, pricing-page blocker"
          />
        </label>
      ) : null}
      <label className="space-y-1 text-sm text-slate-300">
        <span>Target Agent</span>
        <select
          id={`${fieldIdPrefix}-agent`}
          value={form.targetAgentId}
          disabled={lockedFields}
          onChange={(event) => onChangeField('targetAgentId', event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
        >
          <option value="">Select an agent</option>
          {agentProfiles.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.title}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm text-slate-300">
        <span>Delivery Target</span>
        <select
          id={`${fieldIdPrefix}-delivery-target`}
          value={form.deliveryTarget}
          onChange={(event) => onChangeField('deliveryTarget', event.target.value as ScheduleDeliveryTarget)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
        >
          <option value="origin_session">Origin session</option>
          <option value="dedicated_schedule_session">Dedicated schedule session</option>
          <option value="artifact_only">Artifact only</option>
          <option value="silent_on_heartbeat">Silent on heartbeat</option>
        </select>
      </label>
      <label className="space-y-1 text-sm text-slate-300">
        <span>Session Target</span>
        <select
          id={`${fieldIdPrefix}-session-target`}
          value={form.sessionTarget}
          onChange={(event) => onChangeField('sessionTarget', event.target.value as ScheduleSessionTarget)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
        >
          <option value="origin_session">Origin session</option>
          <option value="dedicated_schedule_session">Dedicated schedule session</option>
          <option value="explicit_session">Explicit session</option>
        </select>
      </label>
      <label className="space-y-1 text-sm text-slate-300">
        <span>Delivery Session</span>
        <select
          id={`${fieldIdPrefix}-delivery-session`}
          value={form.deliveryTargetSessionId}
          onChange={(event) => onChangeField('deliveryTargetSessionId', event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
        >
          <option value="">Automatic</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.sessionKey}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm text-slate-300">
        <span>Runtime</span>
        {scheduleJobModeUsesBrowser(form) ? (
          <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-50">
            process (direct governed lane)
          </div>
        ) : (
          <select
            id={`${fieldIdPrefix}-runtime`}
            value={form.runtime}
            disabled={lockedFields}
            onChange={(event) => onChangeField('runtime', event.target.value as ScheduleFormState['runtime'])}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
          >
            <option value="">Default</option>
            <option value="codex">codex</option>
            <option value="claude">claude</option>
            <option value="gemini">gemini</option>
            <option value="process">process</option>
          </select>
        )}
      </label>
      {showConcurrency ? (
        <label className="space-y-1 text-sm text-slate-300">
          <span>Concurrency</span>
          <select
            id={`${fieldIdPrefix}-concurrency`}
            value={form.concurrencyPolicy}
            disabled={lockedFields}
            onChange={(event) => onChangeField('concurrencyPolicy', event.target.value as ScheduleConcurrencyPolicy)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
          >
            <option value="skip">Skip</option>
            <option value="queue">Queue</option>
            <option value="replace">Replace</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

function ScheduleBrowserFields({
  form,
  fieldIdPrefix,
  sessionProfiles,
  disabled,
  onChangeBrowserField
}: {
  form: ScheduleFormState;
  fieldIdPrefix: string;
  sessionProfiles: BrowserSessionVaultState['sessionProfiles'];
  disabled: boolean;
  onChangeBrowserField: <K extends keyof BrowserScheduleFormState>(key: K, value: BrowserScheduleFormState[K]) => void;
}) {
  if (!scheduleJobModeUsesBrowser(form)) {
    return null;
  }

  return (
    <div className="space-y-3">
      {form.jobMode === 'workflow' ? (
        <div className="rounded-[1.3rem] border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-sky-100">
          {getWorkflowTemplateConfig(form.workflow.templateId).description}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-slate-300 sm:col-span-2">
          <span>Target URL</span>
          <input
            id={`${fieldIdPrefix}-browser-url`}
            value={form.browser.url}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('url', event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
            placeholder="https://www.tiktok.com/@tiktok"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Intent</span>
          <select
            id={`${fieldIdPrefix}-browser-intent`}
            value={form.browser.intent}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('intent', event.target.value as BrowserScheduleIntent)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
          >
            <option value="monitor">monitor</option>
            <option value="dynamic_app">dynamic app</option>
            <option value="structured_extract">structured extract</option>
            <option value="document_lookup">document lookup</option>
            <option value="article_read">article read</option>
            <option value="download_probe">download probe</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Extractor</span>
          <select
            id={`${fieldIdPrefix}-browser-extractor`}
            value={form.browser.extractorId}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('extractorId', event.target.value as BrowserScheduleFormState['extractorId'])}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
          >
            {BROWSER_EXTRACTOR_OPTIONS.map((option) => (
              <option key={option.id || 'auto'} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Extraction</span>
          <select
            id={`${fieldIdPrefix}-browser-extraction`}
            value={form.browser.extractionMode}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('extractionMode', event.target.value as BrowserExtractionMode)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
          >
            <option value="markdown">markdown</option>
            <option value="html">html</option>
            <option value="text">text</option>
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Selector</span>
          <input
            id={`${fieldIdPrefix}-browser-selector`}
            value={form.browser.selector}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('selector', event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
            placeholder="article, main, [data-e2e]"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Wait selector</span>
          <input
            id={`${fieldIdPrefix}-browser-wait-selector`}
            value={form.browser.waitSelector}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('waitSelector', event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
            placeholder="[data-e2e], main, article"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Session profile</span>
          <select
            id={`${fieldIdPrefix}-browser-session-profile`}
            value={form.browser.sessionProfileId}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('sessionProfileId', event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
          >
            <option value="">None</option>
            {sessionProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Cache TTL (ms)</span>
          <input
            id={`${fieldIdPrefix}-browser-cache-ttl`}
            value={form.browser.cacheTtlMs}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('cacheTtlMs', event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
            inputMode="numeric"
            placeholder="300000"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Preview chars</span>
          <input
            id={`${fieldIdPrefix}-browser-preview-chars`}
            value={form.browser.previewChars}
            disabled={disabled}
            onChange={(event) => onChangeBrowserField('previewChars', event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
            inputMode="numeric"
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ['dynamicLikely', 'Dynamic target'],
            ['requiresStealth', 'Require stealth'],
            ['requiresProxy', 'Require proxy'],
            ['requiresVisibleBrowser', 'Visible browser'],
            ['requiresDownload', 'Download aware'],
            ['mainContentOnly', 'Main content only'],
            ['suspiciousPromptInjection', 'Injection fixture']
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChangeBrowserField(key, !form.browser[key])}
            className={`rounded-[1.1rem] border px-3 py-3 text-left text-sm transition disabled:opacity-60 ${
              form.browser[key]
                ? 'border-amber-300/30 bg-amber-300/12 text-amber-50'
                : 'border-white/10 bg-slate-950/70 text-slate-300 hover:border-white/20'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SchedulePromptEditor({
  form,
  fieldIdPrefix,
  disabled,
  onChangeField
}: {
  form: ScheduleFormState;
  fieldIdPrefix: string;
  disabled: boolean;
  onChangeField: <K extends keyof ScheduleFormState>(key: K, value: ScheduleFormState[K]) => void;
}) {
  const rows = form.jobMode === 'browser_capture' ? 3 : 4;
  const placeholder =
    form.jobMode === 'browser_capture'
      ? buildBrowserSchedulePrompt(form.browser)
      : form.jobMode === 'workflow'
        ? buildWorkflowSchedulePrompt(form)
        : 'Check the README freshness and summarize only actionable drift.';
  const description =
    form.jobMode === 'workflow' && !scheduleJobModeUsesBrowser(form) ? getWorkflowTemplateConfig(form.workflow.templateId).description : null;

  return (
    <div className="space-y-3">
      {description ? (
        <div className="rounded-[1.3rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">
          {description}
        </div>
      ) : null}
      <label className="block space-y-1 text-sm text-slate-300">
        <span>{form.jobMode === 'agent_prompt' ? 'Prompt' : 'Prompt override'}</span>
        <textarea
          id={`${fieldIdPrefix}-prompt`}
          value={form.prompt}
          disabled={disabled}
          onChange={(event) => onChangeField('prompt', event.target.value)}
          rows={rows}
          className="w-full rounded-[1.2rem] border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-slate-100 outline-none transition disabled:opacity-60 focus:border-amber-300/40"
          placeholder={placeholder}
        />
      </label>
    </div>
  );
}
