import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Browsers,
  Plus,
  Cpu,
  Gear,
  IdentificationBadge,
  Robot
} from '@phosphor-icons/react';
import { AnimatePresence, m, LazyMotion, domAnimation } from 'framer-motion';
import type { ChangeEvent } from 'react';
import { useId, useState, memo, useEffect, useMemo } from 'react';
import { Link, useLocation } from '@tanstack/react-router';

import {
  agentProfilesQueryOptions,
  invalidateAgentReadQueries,
  invalidateChatReadQueries,
  invalidateOfficeReadQueries,
  skillsQueryOptions,
  toolsQueryOptions
} from '../app/queryOptions';
import { PageIntro } from '../components/ops/PageHeader';
import { useAppStore } from '../app/store';
import type { AgentProfileRow } from '../app/types';
import { AGENT_TEAM_OPTIONS, resolveAgentTeam, toAgentTeamInputValue } from '../lib/agentTeams';

/* ── Constants & Types ─────────────────────────────────────────────── */

const RUNTIME_OPTIONS = ['codex', 'claude', 'gemini', 'process'] as const;
const EXECUTION_MODE_OPTIONS = ['on_demand', 'persistent_harness', 'dispatch_only'] as const;

type RuntimeOption = (typeof RUNTIME_OPTIONS)[number];
type ExecutionModeOption = (typeof EXECUTION_MODE_OPTIONS)[number];
type AgentFormData = {
  name: string;
  title: string;
  defaultRuntime: RuntimeOption;
  systemPrompt: string;
  executionMode: ExecutionModeOption;
  department: string;
  skills: string[];
  tools: string[];
};

const SEGMENT_GROUP_CLASS = 'flex items-center gap-2';
const SEGMENT_IDLE_CLASS = 'px-3 py-1.5 text-sm font-medium text-white/60 hover:text-white transition-colors';
const SEGMENT_ACTIVE_CLASS = 'px-3 py-1.5 text-sm font-medium text-white bg-white/10 rounded-lg transition-colors';
const PRIMARY_ACTION_CLASS = 'inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-medium transition-colors hover:bg-white/90 disabled:opacity-50';
const SECONDARY_ACTION_CLASS = 'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10';
const INPUT_CLASS = 'w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-white/20 focus:bg-white/10 font-mono';
const TEXTAREA_CLASS = 'w-full flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all resize-none focus:border-white/20 focus:bg-white/10 font-mono';
const FORM_LABEL_CLASS = 'block text-sm font-medium text-white/80 mb-2';
const TAG_IDLE_CLASS = 'rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition-all hover:border-white/20 hover:text-white';
const TAG_ACTIVE_CLASS = 'rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-all';
const BROWSER_TOOL_NAME = 'browser:scrapling';

const EMPTY_AGENT_FORM_DATA: AgentFormData = {
  name: '',
  title: '',
  defaultRuntime: 'codex',
  systemPrompt: '',
  executionMode: 'on_demand',
  department: '',
  skills: [],
  tools: []
};

function summarizePrompt(value: string, maxLength = 120): string {
  const normalized = value.trim();
  if (!normalized) {
    return 'No system prompt configured.';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildAgentFormData(agent: AgentProfileRow | null): AgentFormData {
  if (!agent) {
    return EMPTY_AGENT_FORM_DATA;
  }

  return {
    name: agent.name,
    title: agent.title,
    defaultRuntime: agent.defaultRuntime,
    systemPrompt: agent.systemPrompt,
    executionMode: agent.executionMode || 'on_demand',
    department: toAgentTeamInputValue(agent.metadata.department),
    skills: agent.skills || [],
    tools: agent.tools || []
  };
}

/* ── Main Page Component ───────────────────────────────────────────── */

export function AgentsPage() {
  const pageKey = useLocation({ select: (location) => `${location.pathname}:${location.searchStr}` });
  return <AgentsPageContent key={pageKey} />;
}

function AgentsPageContent() {
  const token = useAppStore((state) => state.token);
  const editingAgentId = useAppStore((state) => state.editingAgentId);
  const setEditingAgentId = useAppStore((state) => state.setEditingAgentId);
  const agentProfiles = useQuery(agentProfilesQueryOptions(token)).data ?? [];
  const [activeTab, setActiveTab] = useState<'roster' | 'editor'>('roster');
  const enabledCount = agentProfiles.filter((agent) => agent.enabled).length;
  const browserReadyCount = agentProfiles.filter((agent) => agent.enabled && agent.tools.includes(BROWSER_TOOL_NAME)).length;

  useEffect(() => {
    setEditingAgentId(null);
    return () => {
      setEditingAgentId(null);
    };
  }, [setEditingAgentId]);

  const onNewEntity = () => {
    setEditingAgentId(null);
    setActiveTab('editor');
  };

  const onConfigure = (agentId: string) => {
    setEditingAgentId(agentId);
    setActiveTab('editor');
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="shell-page shell-page-wide">
        <PageIntro
          eyebrow="Workforce"
          title="Agent roster"
          description={`${enabledCount} active agent${enabledCount === 1 ? '' : 's'}, ${browserReadyCount} browser-ready. Open a roster card to edit runtime, tools, and prompt.`}
          actions={
            <>
              <Link to="/browser" className={SECONDARY_ACTION_CLASS}>
                <Browsers size={16} /> Browser Ops
              </Link>
              <div className={SEGMENT_GROUP_CLASS}>
                <button onClick={() => setActiveTab('roster')} className={activeTab === 'roster' ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS}>
                  Roster
                </button>
                <button onClick={onNewEntity} className={activeTab === 'editor' ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS}>
                  Editor
                </button>
              </div>
              <button onClick={onNewEntity} className={PRIMARY_ACTION_CLASS}>
                <Plus size={16} /> New Agent
              </button>
            </>
          }
        />

        <div className="flex-1">
          <AnimatePresence mode="wait">
            {activeTab === 'roster' ? (
              <m.div
                key="roster"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {agentProfiles.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} onConfigure={() => onConfigure(agent.id)} />
                ))}
                {agentProfiles.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-white/5 bg-white/[0.02] px-10 py-20 text-center">
                    <p className="text-white/60">No agents found</p>
                  </div>
                ) : null}
              </m.div>
            ) : (
              <m.div
                key="editor"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-auto max-w-4xl w-full"
              >
                <AgentForge key={editingAgentId ?? 'new'} onCancel={() => setActiveTab('roster')} />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </LazyMotion>
  );
}

/* ── UI Components ────────────────────────────────────────────────── */

const AgentCard = memo(({ agent, onConfigure }: { agent: AgentProfileRow; onConfigure: () => void }) => {
  const team = resolveAgentTeam(agent);
  const browserEnabled = agent.tools.includes(BROWSER_TOOL_NAME);
  const visibleTools = agent.tools.filter((tool) => tool !== BROWSER_TOOL_NAME);
  const capabilitySummary = `${agent.skills.length} skill${agent.skills.length === 1 ? '' : 's'}, ${visibleTools.length} tool${visibleTools.length === 1 ? '' : 's'}`;

  return (
    <article className="group grid gap-3 overflow-hidden rounded-[1.6rem] border border-white/6 bg-white/[0.02] p-4 transition-colors hover:border-white/12 sm:p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(15rem,0.9fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80">
            <Robot size={20} weight="duotone" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-medium text-white">{agent.name}</h3>
            <p className="text-sm text-white/60">{agent.title}</p>
            <p className="mt-2 max-w-[58ch] line-clamp-4 text-sm leading-6 text-white/55 sm:line-clamp-3">
              {summarizePrompt(agent.systemPrompt)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-start">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
          <Cpu size={12} className="text-white/55" />
          {agent.defaultRuntime}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
          <IdentificationBadge size={12} className="text-white/55" />
          {team}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
          <Gear size={12} className="text-white/55" />
          {capabilitySummary}
        </span>
        {browserEnabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--shell-accent-border)] bg-[color:var(--shell-accent-soft)] px-3 py-1.5 text-xs text-[var(--shell-accent)]">
            <Browsers size={12} />
            Browser ready
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end">
        <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${agent.enabled ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'}`}>
          {agent.enabled ? 'Active' : 'Offline'}
        </div>
        <button
          onClick={onConfigure}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/75 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          Edit <Gear size={14} />
        </button>
      </div>
    </article>
  );
});
AgentCard.displayName = 'AgentCard';

function AgentForge({ onCancel }: { onCancel: () => void }) {
  const token = useAppStore((state) => state.token);
  const editingAgentId = useAppStore((state) => state.editingAgentId);
  const setEditingAgentId = useAppStore((state) => state.setEditingAgentId);
  const createAgentProfile = useAppStore((state) => state.createAgentProfile);
  const updateAgentProfile = useAppStore((state) => state.updateAgentProfile);
  const queryClient = useQueryClient();
  const agentProfiles = useQuery(agentProfilesQueryOptions(token)).data ?? [];
  const skillsList = useQuery(skillsQueryOptions(token)).data ?? [];
  const toolsList = useQuery(toolsQueryOptions(token)).data ?? [];

  const editingAgent = useMemo(
    () => (editingAgentId ? agentProfiles.find((agent) => agent.id === editingAgentId) ?? null : null),
    [editingAgentId, agentProfiles]
  );
  const nonBrowserTools = useMemo(
    () => toolsList.filter((tool) => tool.name !== BROWSER_TOOL_NAME),
    [toolsList]
  );

  const [formData, setFormData] = useState<AgentFormData>(() => buildAgentFormData(editingAgent));
  const browserEnabled = formData.tools.includes(BROWSER_TOOL_NAME);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onRuntimeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value as RuntimeOption;
    setFormData((prev) => ({ ...prev, defaultRuntime: value }));
  };

  const onExecutionModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value as ExecutionModeOption;
    setFormData((prev) => ({ ...prev, executionMode: value }));
  };

  const toggleSkill = (skillId: string) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.includes(skillId) 
        ? prev.skills.filter(id => id !== skillId)
        : [...prev.skills, skillId]
    }));
  };

  const toggleTool = (toolName: string) => {
    setFormData(prev => ({
      ...prev,
      tools: prev.tools.includes(toolName)
        ? prev.tools.filter(name => name !== toolName)
        : [...prev.tools, toolName]
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (editingAgentId) {
        await updateAgentProfile(editingAgentId, {
          ...formData,
          metadata: {
            department: formData.department || null,
          },
        });
      } else {
        await createAgentProfile({
          ...formData,
          metadata: formData.department
            ? {
                department: formData.department,
              }
            : undefined,
        });
      }
      await Promise.all([
        invalidateAgentReadQueries(queryClient, token),
        invalidateOfficeReadQueries(queryClient, token),
        invalidateChatReadQueries(queryClient, token)
      ]);
      setEditingAgentId(null);
      onCancel();
    } catch (err) {
      console.error('Failed to save agent:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-8">
      <header className="mb-8 flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h2 className="text-xl font-medium text-white">
            {editingAgentId ? 'Configure Agent' : 'New Agent'}
          </h2>
        </div>
        <button
          onClick={() => { setEditingAgentId(null); onCancel(); }}
          className="text-sm font-medium text-white/60 hover:text-white"
        >
          Cancel
        </button>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <FormField 
            label="Name" 
            placeholder="e.g. OMEGA" 
            value={formData.name}
            onChange={(v) => setFormData(prev => ({ ...prev, name: v }))}
          />
          <FormField 
            label="Title" 
            placeholder="e.g. Principal Architect" 
            value={formData.title}
            onChange={(v) => setFormData(prev => ({ ...prev, title: v }))}
          />
          
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="agent-runtime" className={FORM_LABEL_CLASS}>Runtime</label>
              <select 
                id="agent-runtime"
                value={formData.defaultRuntime}
                onChange={onRuntimeChange}
                className={INPUT_CLASS}
              >
                {RUNTIME_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="agent-mode" className={FORM_LABEL_CLASS}>Mode</label>
              <select 
                id="agent-mode"
                value={formData.executionMode}
                onChange={onExecutionModeChange}
                className={INPUT_CLASS}
              >
                <option value={EXECUTION_MODE_OPTIONS[0]}>On Demand</option>
                <option value={EXECUTION_MODE_OPTIONS[1]}>Persistent</option>
                <option value={EXECUTION_MODE_OPTIONS[2]}>Dispatch Only</option>
              </select>
            </div>
            <div>
              <label htmlFor="agent-team" className={FORM_LABEL_CLASS}>Team</label>
              <select
                id="agent-team"
                value={formData.department}
                onChange={(event) => setFormData((prev) => ({ ...prev, department: event.currentTarget.value }))}
                className={INPUT_CLASS}
              >
                <option value="">Auto</option>
                {AGENT_TEAM_OPTIONS.map((team) => (
                  <option key={team.value} value={team.value}>
                    {team.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className={FORM_LABEL_CLASS}>Skills</p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {skillsList.map(skill => (
                <button
                  key={skill.id}
                  onClick={() => toggleSkill(skill.id)}
                  className={formData.skills.includes(skill.id) ? TAG_ACTIVE_CLASS : TAG_IDLE_CLASS}
                >
                  {skill.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={FORM_LABEL_CLASS}>Browser Access</p>
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <Browsers size={18} className="text-white/60" />
                <span className="text-sm text-white/80">Enable browser tools</span>
              </div>
              <button
                type="button"
                onClick={() => toggleTool(BROWSER_TOOL_NAME)}
                className={browserEnabled ? TAG_ACTIVE_CLASS : TAG_IDLE_CLASS}
              >
                {browserEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div>
            <p className={FORM_LABEL_CLASS}>Tools</p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {nonBrowserTools.map(tool => (
                <button
                  key={tool.name}
                  onClick={() => toggleTool(tool.name)}
                  className={formData.tools.includes(tool.name) ? TAG_ACTIVE_CLASS : TAG_IDLE_CLASS}
                >
                  {tool.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col">
          <label htmlFor="agent-system-prompt" className={FORM_LABEL_CLASS}>System Prompt</label>
          <textarea 
            id="agent-system-prompt"
            value={formData.systemPrompt}
            onChange={(e) => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
            className={TEXTAREA_CLASS}
            placeholder="Agent instructions..." 
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={PRIMARY_ACTION_CLASS}
        >
          {isSubmitting ? 'Saving...' : 'Save Agent'}
        </button>
      </div>
    </section>
  );
}

function FormField({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  const fieldId = useId();
  return (
    <div>
      <label htmlFor={fieldId} className={FORM_LABEL_CLASS}>{label}</label>
      <input 
        id={fieldId}
        className={INPUT_CLASS}
        placeholder={placeholder} 
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
