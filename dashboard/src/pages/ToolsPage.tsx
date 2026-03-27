import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Browsers,
  Power,
  TerminalWindow,
  WarningCircle
} from '@phosphor-icons/react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';

import {
  agentProfilesQueryOptions,
  invalidateToolReadQueries,
  toolsQueryOptions
} from '../app/queryOptions';
import { PageIntro } from '../components/ops/PageHeader';
import { useAppStore } from '../app/store';

const PANEL_CLASS = 'p-6 rounded-2xl border border-white/5 bg-white/[0.02]';
const SECTION_LABEL_CLASS = 'text-lg font-medium text-white';
const GHOST_ACTION_CLASS = 'inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed';
const BROWSER_TOOL_NAME = 'browser:scrapling';

function getToolRowKey(tool: { name: string; source: string }, index: number): string {
  const normalizedName = tool.name.trim().length > 0 ? tool.name.trim() : 'unnamed';
  const normalizedSource = tool.source.trim().length > 0 ? tool.source.trim() : 'unknown';
  return `${normalizedSource}:${normalizedName}:${index}`;
}

// Helper to extract a clean display name
function getDisplayName(name: string): string {
  if (name.startsWith('runtime:')) {
    return name.replace('runtime:', '').charAt(0).toUpperCase() + name.replace('runtime:', '').slice(1);
  }
  return name;
}

// Reusable switch component
function Switch({ enabled, disabled, onChange }: { enabled: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className="inline-flex shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        aria-label="Toggle tool"
        checked={enabled}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-all duration-300 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-white/20 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${
          enabled
            ? 'border-white/20 bg-white/10'
            : 'border-white/10 bg-white/5'
        }`}
      >
        <m.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white ring-0 ${
            enabled ? 'translate-x-4 bg-white' : 'translate-x-0.5 bg-white/40'
          }`}
        />
      </span>
    </label>
  );
}

// Tool Row Component
function ToolRowItem({
  tool,
  token,
  onToggle
}: {
  tool: { name: string; source: string; installed: boolean; enabled: boolean };
  token: string;
  onToggle: (state: boolean) => void;
}) {
  const displayName = getDisplayName(tool.name);
  
  return (
    <m.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`group flex items-center justify-between gap-4 rounded-xl border p-4 transition-all duration-300 ${
        tool.enabled 
          ? 'border-white/10 bg-white/5'
          : 'border-transparent bg-transparent hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-5">
        {/* Status Indicator */}
        <div className="relative flex items-center justify-center w-2 h-2 ml-1">
           {tool.enabled ? (
             <>
               <span className="absolute h-2 w-2 rounded-full bg-emerald-500" />
               <span className="absolute h-2 w-2 rounded-full bg-emerald-500 animate-ping opacity-30" />
             </>
           ) : (
             <span className="absolute h-1.5 w-1.5 rounded-full bg-white/20" />
           )}
        </div>
        
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="select-text break-words text-sm font-medium text-white">{displayName}</span>
            {!tool.installed ? (
              <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 text-[10px] uppercase tracking-widest font-semibold border border-rose-500/20 flex items-center gap-1">
                <WarningCircle size={12} weight="bold" />
                Missing Binary
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 opacity-60">
            <span className="select-text truncate font-mono text-[11px] text-white/60">{tool.name}</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span className="select-text text-[9px] font-medium uppercase tracking-wider text-white/40">{tool.source}</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
         <Switch enabled={tool.enabled} disabled={!token} onChange={() => onToggle(!tool.enabled)} />
      </div>
    </m.div>
  );
}

export function ToolsPage() {
  const token = useAppStore((state) => state.token);
  const toggleTool = useAppStore((state) => state.toggleTool);
  const queryClient = useQueryClient();
  const toolsQuery = useQuery(toolsQueryOptions(token));
  const agentProfilesQuery = useQuery(agentProfilesQueryOptions(token));
  const tools = toolsQuery.data ?? [];
  const agentProfiles = agentProfilesQuery.data ?? [];

  const [isRefreshing, setIsRefreshing] = useState(false);

  const hydrateRegistry = useCallback(async (): Promise<void> => {
    await Promise.all([toolsQuery.refetch(), agentProfilesQuery.refetch()]);
  }, [agentProfilesQuery, toolsQuery]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await hydrateRegistry();
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  const handleToggleTool = useCallback(
    async (toolName: string, enabled: boolean) => {
      await toggleTool(toolName, enabled);
      await invalidateToolReadQueries(queryClient, token);
    },
    [queryClient, toggleTool, token]
  );

  const runtimeTools = useMemo(() => tools.filter((t) => t.name.startsWith('runtime:')), [tools]);
  const cliTools = useMemo(() => tools.filter((t) => !t.name.startsWith('runtime:')), [tools]);
  const browserTool = useMemo(() => tools.find((tool) => tool.name === BROWSER_TOOL_NAME) ?? null, [tools]);
  const browserEnabledAgents = agentProfiles.filter(
    (agent) => agent.enabled && agent.tools.includes(BROWSER_TOOL_NAME)
  ).length;
  const enabledCount = tools.filter((tool) => tool.enabled).length;
  const missingCount = tools.filter((tool) => !tool.installed).length;

  return (
    <LazyMotion features={domAnimation}>
      <div className="shell-page shell-page-wide">
        <PageIntro
          eyebrow="Workforce"
          title="Tools"
          description="Keep the tool surface small and trustworthy. Agents can only use a tool when the registry entry is enabled and the underlying binary exists."
          actions={
            <>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                aria-label="Refresh registry"
                className={GHOST_ACTION_CLASS}
              >
                <ArrowsClockwise size={16} className={`transition-transform duration-700 ease-out ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh registry
              </button>
              <Link to="/browser" className={GHOST_ACTION_CLASS}>
                <Browsers size={16} />
                Browser Ops
                <ArrowSquareOut size={16} />
              </Link>
            </>
          }
          stats={[
            {
              label: 'Enabled',
              value: enabledCount
            },
            {
              label: 'Discovered',
              value: tools.length
            },
            {
              label: 'Runtime adapters',
              value: runtimeTools.length
            },
            {
              label: 'Missing',
              value: missingCount,
              tone: missingCount > 0 ? 'critical' : 'neutral'
            }
          ]}
        />

        <div className="space-y-8 pb-12">
          <m.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${PANEL_CLASS} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Browsers size={18} className="text-white/80" />
                <p className="text-sm font-medium text-white">Browser provider workflow</p>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-white/60">
                {browserTool
                  ? `${browserTool.installed ? 'Binary detected' : 'Binary missing'} / ${browserTool.enabled ? 'tool enabled' : 'tool disabled'} / ${browserEnabledAgents} agent${browserEnabledAgents === 1 ? '' : 's'} carry the tool.`
                  : 'The browser tool is not registered yet.'}
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              {browserEnabledAgents} browser-ready agents
            </div>
          </m.section>

          {tools.length === 0 && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`${PANEL_CLASS} flex flex-col items-center justify-center border-dashed py-24`}
            >
              <WarningCircle size={48} className="mb-4 text-white/20" />
              <p className="text-base font-medium text-white">No tools discovered.</p>
              <p className="mt-2 text-sm text-white/40">
                Your environment might not be configured correctly. Try refreshing.
              </p>
            </m.div>
          )}

          <AnimatePresence mode="popLayout">
            {runtimeTools.length > 0 && (
              <m.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <header className="flex items-center gap-3 px-1">
                  <Power size={18} className="text-white/60" />
                  <h3 className={SECTION_LABEL_CLASS}>Runtime Adapters</h3>
                </header>
                <div className="flex flex-col gap-2">
                  {runtimeTools.map((tool, index) => (
                    <ToolRowItem
                      key={getToolRowKey(tool, index)}
                      tool={tool}
                      token={token}
                      onToggle={(state) => void handleToggleTool(tool.name, state)}
                    />
                  ))}
                </div>
              </m.section>
            )}

            {cliTools.length > 0 && (
              <m.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-4"
              >
                <header className="mt-4 flex items-center gap-3 px-1">
                  <TerminalWindow size={18} className="text-white/60" />
                  <h3 className={SECTION_LABEL_CLASS}>System Binaries</h3>
                </header>
                <div className="flex flex-col gap-2">
                  {cliTools.map((tool, index) => (
                    <ToolRowItem
                      key={getToolRowKey(tool, index)}
                      tool={tool}
                      token={token}
                      onToggle={(state) => void handleToggleTool(tool.name, state)}
                    />
                  ))}
                </div>
              </m.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </LazyMotion>
  );
}
