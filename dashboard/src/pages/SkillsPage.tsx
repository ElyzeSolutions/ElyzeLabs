import { useCallback, useMemo, useReducer } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  autodiscoverSkills,
  bootstrapVendorAssets,
  installExternalSkill,
  invokeSkill,
  removeExternalSkill,
  removeSkillCatalogEntry,
  resyncExternalSkills,
  upsertSkillCatalogEntry
} from '../app/api';
import { invalidateSkillReadQueries, skillsCatalogQueryOptions, skillsQueryOptions } from '../app/queryOptions';
import type { SkillCatalogState, SkillRow, VendorBootstrapResultRow } from '../app/types';
import { useAppStore } from '../app/store';
import { PageDisclosure, PageIntro } from '../components/ops/PageHeader';

const PANEL_CLASS = 'p-6 rounded-2xl border border-white/5 bg-white/[0.02]';
const FIELD_CLASS = 'w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-white/20 focus:bg-white/10 font-mono';
const PRIMARY_BUTTON_CLASS = 'inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-medium transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50';
const GHOST_BUTTON_CLASS = 'inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';
const WARN_BUTTON_CLASS = 'inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 text-amber-500 px-4 py-2 text-sm font-medium transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 border border-amber-500/20';

type SkillsPageState = {
  outputBySkill: Record<string, string>;
  busy: string | null;
  source: string;
  selectedSkillsInput: string;
  catalogPath: string;
  catalogName: string;
  autodiscoverRoot: string;
  approved: boolean;
  error: string | null;
  notice: string | null;
  repairResult: VendorBootstrapResultRow | null;
};

type SkillsPageAction =
  | { type: 'patch'; patch: Partial<SkillsPageState> }
  | { type: 'record_output'; skillName: string; output: string };

const INITIAL_SKILLS_PAGE_STATE: SkillsPageState = {
  outputBySkill: {},
  busy: null,
  source: '',
  selectedSkillsInput: '',
  catalogPath: '',
  catalogName: '',
  autodiscoverRoot: '',
  approved: false,
  error: null,
  notice: null,
  repairResult: null
};

function skillsPageReducer(state: SkillsPageState, action: SkillsPageAction): SkillsPageState {
  switch (action.type) {
    case 'patch':
      return {
        ...state,
        ...action.patch
      };
    case 'record_output':
      return {
        ...state,
        outputBySkill: {
          ...state.outputBySkill,
          [action.skillName]: action.output
        }
      };
    default:
      return state;
  }
}

function summarizeSkill(value: string, maxLength = 190): string {
  const normalized = value.trim();
  if (!normalized) {
    return 'No description provided.';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildScopeChips(skill: SkillRow): string[] {
  const scopeChips: string[] = [];

  if (skill.scopes.filesystem !== 'none') {
    scopeChips.push(`FS ${skill.scopes.filesystem}`);
  }
  if (skill.scopes.process !== 'none') {
    scopeChips.push(`PROC ${skill.scopes.process}`);
  }
  if (skill.scopes.network !== 'none') {
    scopeChips.push(`NET ${skill.scopes.network}`);
  }
  if (skill.scopes.secrets !== 'none') {
    scopeChips.push(`SECRETS ${skill.scopes.secrets}`);
  }

  if (scopeChips.length > 0) {
    return scopeChips;
  }

  return ['Sandboxed'];
}

type ParsedSkillInstallDraft = {
  canonicalSource: string;
  installSource: string;
  selectedSkills: string[];
  sourceKind: 'repo' | 'github' | 'skills.sh' | 'command';
};

function normalizeSkillNames(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

function serializeSkillArgs(selectedSkills: readonly string[]): string {
  return selectedSkills.map((skill) => ` --skill ${skill}`).join('');
}

function parseRepoReference(raw: string): { canonical: string } | null {
  const input = raw.trim();
  if (!input) {
    return null;
  }

  const githubMatch = input.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)(?:[/?#].*)?$/i);
  if (githubMatch?.[1] && githubMatch?.[2]) {
    return {
      canonical: `${githubMatch[1].trim().replace(/^@/, '').toLowerCase()}/${githubMatch[2]
        .trim()
        .replace(/\.git$/i, '')
        .replace(/\/+$/, '')
        .toLowerCase()}`
    };
  }

  const shortMatch = input.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch?.[1] && shortMatch?.[2]) {
    return {
      canonical: `${shortMatch[1].trim().replace(/^@/, '').toLowerCase()}/${shortMatch[2]
        .trim()
        .replace(/\.git$/i, '')
        .replace(/\/+$/, '')
        .toLowerCase()}`
    };
  }

  const sshMatch = input.match(/^git@github\.com:([^/\s]+)\/([^/\s]+)$/i);
  if (sshMatch?.[1] && sshMatch?.[2]) {
    return {
      canonical: `${sshMatch[1].trim().replace(/^@/, '').toLowerCase()}/${sshMatch[2]
        .trim()
        .replace(/\.git$/i, '')
        .replace(/\/+$/, '')
        .toLowerCase()}`
    };
  }

  return null;
}

function parseSkillsDotShUrl(raw: string): ParsedSkillInstallDraft | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.hostname !== 'skills.sh' && url.hostname !== 'www.skills.sh') {
    return null;
  }

  const segments = url.pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length < 2) {
    return null;
  }
  if (segments[0] === 'docs' || segments[0] === 'faq' || segments[0] === 'cli') {
    return null;
  }

  const repo = parseRepoReference(`${segments[0]}/${segments[1]}`);
  if (!repo) {
    return null;
  }

  return {
    canonicalSource: repo.canonical,
    installSource: repo.canonical,
    selectedSkills: segments.length >= 3 ? normalizeSkillNames(decodeURIComponent(segments[2] ?? '')) : [],
    sourceKind: 'skills.sh'
  };
}

function tokenizeShellCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? '';
    if (quote) {
      if (character === quote) {
        quote = null;
        continue;
      }
      if (character === '\\' && input[index + 1] === quote) {
        current += quote;
        index += 1;
        continue;
      }
      current += character;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function parseInstallCommand(raw: string): ParsedSkillInstallDraft | null {
  const tokens = tokenizeShellCommand(raw);
  if (tokens.length < 3) {
    return null;
  }

  let addIndex = -1;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index]?.trim().toLowerCase() ?? '';
    const nextToken = tokens[index + 1]?.trim().toLowerCase() ?? '';
    if ((token === 'skills' || token.startsWith('skills@')) && nextToken === 'add') {
      addIndex = index;
      break;
    }
  }

  if (addIndex === -1) {
    return null;
  }

  const remaining = tokens.slice(addIndex + 2);
  let installSource = '';
  const selectedSkills: string[] = [];

  for (let index = 0; index < remaining.length; index += 1) {
    const token = remaining[index]?.trim() ?? '';
    if (!token) {
      continue;
    }
    if (token === '--skill' && remaining[index + 1]) {
      selectedSkills.push(remaining[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (token.startsWith('--skill=')) {
      selectedSkills.push(token.slice('--skill='.length));
      continue;
    }
    if (!installSource && !token.startsWith('-')) {
      installSource = token;
    }
  }

  if (!installSource) {
    return null;
  }

  const skillsDotShInstall = parseSkillsDotShUrl(installSource);
  if (skillsDotShInstall) {
    return {
      ...skillsDotShInstall,
      selectedSkills: Array.from(new Set([...skillsDotShInstall.selectedSkills, ...normalizeSkillNames(selectedSkills.join(','))])),
      sourceKind: 'command'
    };
  }

  const repo = parseRepoReference(installSource);
  if (!repo) {
    return null;
  }

  return {
    canonicalSource: repo.canonical,
    installSource,
    selectedSkills: normalizeSkillNames(selectedSkills.join(',')),
    sourceKind: 'command'
  };
}

function parseSkillInstallDraft(sourceInput: string, selectedSkillsInput: string): ParsedSkillInstallDraft | null {
  const normalizedSource = sourceInput.trim();
  if (!normalizedSource) {
    return null;
  }

  const parsed = parseInstallCommand(normalizedSource) ?? parseSkillsDotShUrl(normalizedSource);
  if (parsed) {
    return {
      ...parsed,
      selectedSkills: Array.from(new Set([...parsed.selectedSkills, ...normalizeSkillNames(selectedSkillsInput)]))
    };
  }

  const repo = parseRepoReference(normalizedSource);
  if (!repo) {
    return null;
  }

  return {
    canonicalSource: repo.canonical,
    installSource: normalizedSource,
    selectedSkills: normalizeSkillNames(selectedSkillsInput),
    sourceKind: normalizedSource.includes('github.com') ? 'github' : 'repo'
  };
}

function buildInstallLabel(draft: ParsedSkillInstallDraft | null): string {
  if (!draft) {
    return 'Install skill';
  }
  if (draft.selectedSkills.length === 0) {
    return 'Install repo skills';
  }
  if (draft.selectedSkills.length === 1) {
    return 'Install selected skill';
  }
  return `Install ${draft.selectedSkills.length} skills`;
}

function installSourceKindLabel(kind: ParsedSkillInstallDraft['sourceKind']): string {
  if (kind === 'skills.sh') {
    return 'skills.sh page';
  }
  if (kind === 'command') {
    return 'docs command';
  }
  if (kind === 'github') {
    return 'GitHub URL';
  }
  return 'owner/repo';
}

function deriveCatalogEntryLabel(pathValue: string, explicitName?: string): string {
  if (explicitName && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  const segments = pathValue.split('/').map((segment) => segment.trim()).filter(Boolean);
  return segments[segments.length - 1] ?? '(auto name)';
}

function SkillCard({
  skill,
  token,
  busy,
  approved,
  output,
  onDryRun,
  onRemove
}: {
  skill: SkillRow;
  token: string;
  busy: string | null;
  approved: boolean;
  output?: string;
  onDryRun: (skill: SkillRow) => void;
  onRemove: (skill: SkillRow, approved: boolean) => void;
}) {
  const scopeChips = buildScopeChips(skill);

  return (
    <article className={`${PANEL_CLASS} rounded-[1.45rem]`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-medium text-white">{skill.name}</p>
            <span className="text-sm text-white/40">v{skill.version}</span>
            {skill.requiresApproval ? (
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[0.68rem] font-medium text-amber-100">
                approval
              </span>
            ) : null}
            {!skill.enabled ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.68rem] font-medium text-white/55">
                disabled
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-[72ch] line-clamp-4 text-sm leading-6 text-white/60 sm:line-clamp-3">{summarizeSkill(skill.description, 130)}</p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {scopeChips.map((chip) => (
              <span key={chip} className="rounded-md border border-white/10 px-2 py-1 text-white/60">
                {chip}
              </span>
            ))}
          </div>

          {((skill.allowedCommands && skill.allowedCommands.length > 0) || (skill.requiredTools && skill.requiredTools.length > 0)) ? (
            <details className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-white/65">
                Runtime details
              </summary>
              <div className="space-y-2 border-t border-white/8 px-3 py-3 text-xs text-white/45">
                {skill.allowedCommands && skill.allowedCommands.length > 0 ? (
                  <p>Allowed commands: {skill.allowedCommands.join(', ')}</p>
                ) : null}
                {skill.requiredTools && skill.requiredTools.length > 0 ? (
                  <p>Required tools: {skill.requiredTools.join(', ')}</p>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <button
            type="button"
            disabled={!token || busy === skill.name}
            onClick={() => onDryRun(skill)}
            className={PRIMARY_BUTTON_CLASS}
          >
            Run check
          </button>
          <button
            type="button"
            disabled={!token || busy === `remove:${skill.name}`}
            onClick={() => onRemove(skill, approved)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-500/10 text-rose-500 px-4 py-2 text-sm font-medium transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 border border-rose-500/20"
          >
            Remove
          </button>
          {!token ? <span className="text-xs text-amber-500">Set API token in Access</span> : null}
        </div>
      </div>

      {output ? (
        <pre className="mt-4 max-h-44 overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs font-mono text-white/80">
          {output}
        </pre>
      ) : null}
    </article>
  );
}

function SkillCatalogEntries({
  catalog,
  token,
  busy,
  approved,
  onRemoveEntry
}: {
  catalog: SkillCatalogState | null;
  token: string;
  busy: string | null;
  approved: boolean;
  onRemoveEntry: (path: string, approved: boolean) => void;
}) {
  return (
    <article className={PANEL_CLASS}>
      <h3 className="text-lg font-medium text-white mb-4">Catalog Entries</h3>
      {catalog?.entries && catalog.entries.length > 0 ? (
        <ul className="space-y-3">
          {catalog.entries.map((entry) => (
            <li key={entry.path} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="space-y-1">
                <p className="font-medium text-white">{deriveCatalogEntryLabel(entry.path, entry.name)}</p>
                <p className="text-sm font-mono text-white/40 break-all">{entry.path}</p>
              </div>
              <button
                type="button"
                disabled={!token || busy === `catalog:remove:${entry.path}`}
                onClick={() => onRemoveEntry(entry.path, approved)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-500/10 text-rose-500 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 border border-rose-500/20"
              >
                Remove Entry
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/40">No explicit catalog entries configured.</p>
      )}
    </article>
  );
}

function SkillOperationHistory({ catalog }: { catalog: SkillCatalogState | null }) {
  return (
    <article className={PANEL_CLASS}>
      <h3 className="text-lg font-medium text-white mb-4">Install History</h3>
      {catalog?.operations && catalog.operations.length > 0 ? (
        <ul className="space-y-3">
          {catalog.operations.slice(0, 10).map((operation) => (
            <li key={operation.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-white">
                {operation.action} · <span className={operation.status === 'ok' ? 'text-emerald-500' : 'text-amber-500'}>{operation.status}</span>
              </p>
              <p className="mt-1 text-sm text-white/60">{operation.summary}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/40">No catalog operations yet.</p>
      )}
    </article>
  );
}

function BaselineRepairTranscript({ repairResult, repairLog }: { repairResult: VendorBootstrapResultRow | null; repairLog: string }) {
  if (!repairResult) {
    return null;
  }

  return (
    <article className={PANEL_CLASS}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-white">Latest Baseline Repair</h3>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            repairResult.status === 'ok'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
          }`}
        >
          {repairResult.status}
        </span>
      </div>
      <p className="text-sm text-white/60">
        Baseline root: <span className="font-mono text-white/80">{repairResult.context.baselineSkillsDir}</span>
      </p>
      {repairResult.warnings.length > 0 ? (
        <p className="mt-3 text-sm text-amber-500">{repairResult.warnings.join(' ')}</p>
      ) : null}
      {repairLog ? (
        <pre className="mt-4 max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 text-xs font-mono text-white/80">
          {repairLog}
        </pre>
      ) : null}
    </article>
  );
}

function QuickSkillInstallPanel({
  token,
  busy,
  approved,
  source,
  selectedSkillsInput,
  catalog,
  error,
  notice,
  draft,
  onSourceChange,
  onSelectedSkillsInputChange,
  onApprovedChange,
  onInstall,
  onUseExample
}: {
  token: string;
  busy: string | null;
  approved: boolean;
  source: string;
  selectedSkillsInput: string;
  catalog: SkillCatalogState | null;
  error: string | null;
  notice: string | null;
  draft: ParsedSkillInstallDraft | null;
  onSourceChange: (value: string) => void;
  onSelectedSkillsInputChange: (value: string) => void;
  onApprovedChange: (value: boolean) => void;
  onInstall: () => void;
  onUseExample: (value: string, selectedSkillsInput: string) => void;
}) {
  const examples = [
    {
      label: 'skills.sh page',
      description: 'Paste a leaderboard page URL and install the exact skill.',
      source: 'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices',
      selectedSkillsInput: ''
    },
    {
      label: 'GitHub repo',
      description: 'Install every skill published by a repo.',
      source: 'https://github.com/vercel-labs/agent-skills',
      selectedSkillsInput: ''
    },
    {
      label: 'Docs command',
      description: 'Copy the command from docs and paste it here unchanged.',
      source: 'npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices',
      selectedSkillsInput: ''
    }
  ];

  const previewCommand = draft ? `npx skills add ${draft.installSource}${serializeSkillArgs(draft.selectedSkills)}` : null;
  const installLabel = buildInstallLabel(draft);
  const selectedSkillPreview =
    draft && draft.selectedSkills.length > 0 ? draft.selectedSkills.join(', ') : 'Whole repo';

  return (
    <article className="relative overflow-hidden rounded-[1.8rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-6 py-6 shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),transparent_45%,rgba(255,255,255,0.03))]" />
      <div className="relative grid gap-6 xl:grid-cols-[1.05fr_1.3fr]">
        <div className="flex flex-col justify-between">
          <div>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.22em] text-white/55">
              skills.sh quick add
            </span>
            <h2 className="mt-4 max-w-[14ch] text-3xl font-semibold tracking-[-0.05em] text-white text-balance">
              Paste a skill link. Install it.
            </h2>
            <p className="mt-3 max-w-[42ch] text-sm leading-6 text-white/65">
              Accepts a `skills.sh` page, GitHub URL, `owner/repo`, or the exact `npx skills add ...` command copied from docs.
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            {examples.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => onUseExample(example.source, example.selectedSkillsInput)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-colors hover:bg-white/[0.08]"
              >
                <p className="text-sm font-medium text-white">{example.label}</p>
                <p className="mt-2 text-sm leading-6 text-white/50">{example.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/55">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Direct skills.sh paste</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Command paste supported</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Single skill or full repo</span>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 backdrop-blur-sm">
          <div className="grid gap-5">
            <div>
              <label htmlFor="skills-source-input" className="mb-2 block text-sm font-medium text-white">
                Paste a skills.sh link, GitHub URL, repo slug, or docs command
              </label>
              <textarea
                id="skills-source-input"
                value={source}
                onChange={(event) => onSourceChange(event.target.value)}
                placeholder="npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices"
                className={`${FIELD_CLASS} min-h-[120px] resize-y leading-6`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <label htmlFor="skills-selected-input" className="mb-2 block text-sm font-medium text-white">
                  Specific skills
                </label>
                <input
                  id="skills-selected-input"
                  value={selectedSkillsInput}
                  onChange={(event) => onSelectedSkillsInputChange(event.target.value)}
                  placeholder="Optional. Comma separated. Leave empty to install the whole repo."
                  className={FIELD_CLASS}
                />
              </div>

              <button
                type="button"
                disabled={!token || !draft || busy === 'install'}
                onClick={onInstall}
                className={`${PRIMARY_BUTTON_CLASS} h-[46px] px-5`}
              >
                {busy === 'install' ? 'Installing...' : installLabel}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <label className="inline-flex items-center gap-2 text-sm text-white/75">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => onApprovedChange(event.target.checked)}
                  className="rounded border-white/20 bg-black/50"
                />
                Confirm install approval
              </label>

              <div className="flex flex-wrap gap-2 text-xs text-white/55">
                <span className="rounded-full border border-white/10 px-3 py-1">
                  installer {catalog?.installer.readiness.ready ? 'ready' : 'blocked'}
                </span>
                {catalog?.installer.installRoot ? (
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    root {catalog.installer.installRoot}
                  </span>
                ) : null}
              </div>
            </div>

            {catalog?.installer.readiness.required && catalog.installer.readiness.required.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-xs text-white/55">
                {catalog.installer.readiness.required.map((entry) => (
                  <span key={entry.name} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    {entry.name}:{entry.installed ? 'ok' : 'missing'}
                  </span>
                ))}
              </div>
            ) : null}

            {source.trim().length > 0 ? (
              draft ? (
                <div className="grid gap-3 rounded-[1.35rem] border border-emerald-500/15 bg-emerald-500/[0.04] p-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                    <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/40">Detected source</p>
                    <p className="mt-2 text-sm font-medium text-white">{installSourceKindLabel(draft.sourceKind)}</p>
                    <p className="mt-1 break-all text-sm text-white/55">{draft.canonicalSource}</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                    <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/40">Install scope</p>
                    <p className="mt-2 text-sm font-medium text-white">{draft.selectedSkills.length > 0 ? 'Selected skills' : 'Whole repo'}</p>
                    <p className="mt-1 text-sm text-white/55">{selectedSkillPreview}</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 p-3">
                    <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/40">Command preview</p>
                    <p className="mt-2 break-all font-mono text-sm text-white/75">{previewCommand}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  Paste a valid `skills.sh` URL, GitHub URL, `owner/repo`, or `npx skills add ...` command.
                </div>
              )
            ) : null}

            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            {!error && notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
            {!token ? <p className="text-xs text-amber-400">Set the API token in Access before installing.</p> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function SkillRegistryPanel({
  token,
  busy,
  approved,
  catalog,
  fallbackOnly,
  autodiscoverRoot,
  catalogPath,
  catalogName,
  onRefresh,
  onResync,
  onAutodiscover,
  onAutodiscoverRootChange,
  onCatalogPathChange,
  onCatalogNameChange,
  onCatalogAdd,
  onRepairBaseline
}: {
  token: string;
  busy: string | null;
  approved: boolean;
  catalog: SkillCatalogState | null;
  fallbackOnly: boolean;
  autodiscoverRoot: string;
  catalogPath: string;
  catalogName: string;
  onRefresh: () => void;
  onResync: () => void;
  onAutodiscover: () => void;
  onAutodiscoverRootChange: (value: string) => void;
  onCatalogPathChange: (value: string) => void;
  onCatalogNameChange: (value: string) => void;
  onCatalogAdd: () => void;
  onRepairBaseline: () => void;
}) {
  return (
    <article className={PANEL_CLASS}>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-medium text-white">Registry maintenance</h3>
          <p className="mt-1 text-sm text-white/60">Resync paths, repair the baseline, or add non-skills.sh catalog entries.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className={[GHOST_BUTTON_CLASS, 'self-start whitespace-nowrap'].join(' ')}
        >
          Reload
        </button>
      </div>

      {fallbackOnly ? (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-500">Baseline Skills Need Repair</p>
          <p className="mt-2 text-sm text-amber-500/80">
            Only `fallback-core` is loaded from the persisted baseline skills directory. Repairing will repopulate
            `/var/lib/ops/skills` from the configured baseline skills repo and reload the registry in-process.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={!token || busy === 'repair:baseline'}
              onClick={onRepairBaseline}
              className={WARN_BUTTON_CLASS}
            >
              {busy === 'repair:baseline' ? 'Repairing baseline...' : 'Repair Baseline Skills'}
            </button>
            <span className="text-xs text-amber-500/60">Needs the GitHub token available to the gateway.</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs text-white/60">
        <span>
          Installer ready:{' '}
          <strong className={catalog?.installer.readiness.ready ? 'text-emerald-400' : 'text-amber-400'}>
            {catalog?.installer.readiness.ready ? 'yes' : 'no'}
          </strong>
        </span>
        <span className="rounded-md border border-white/10 px-2 py-1">approval {approved ? 'armed' : 'off'}</span>
        {catalog?.installer.readiness.required.map((entry) => (
          <span key={entry.name} className="rounded-md border border-white/10 px-2 py-1">
            {entry.name}:{entry.installed ? 'ok' : 'missing'}
          </span>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!token || busy === 'resync'}
          onClick={onResync}
          className={GHOST_BUTTON_CLASS}
        >
          Resync Catalog
        </button>
        <button
          type="button"
          disabled={!token || busy === 'autodiscover'}
          onClick={onAutodiscover}
          className={WARN_BUTTON_CLASS}
        >
          Autodiscover
        </button>
        <button
          type="button"
          disabled={!token || busy === 'repair:baseline'}
          onClick={onRepairBaseline}
          className={GHOST_BUTTON_CLASS}
        >
          {busy === 'repair:baseline' ? 'Repairing...' : 'Repair Baseline'}
        </button>
      </div>

      <details className="mt-6 overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-white">Discovery and catalog paths</summary>
        <div className="space-y-4 border-t border-white/8 px-4 py-4">
          <input
            value={autodiscoverRoot}
            onChange={(event) => onAutodiscoverRootChange(event.target.value)}
            placeholder="Optional scan root (default: runtime workspace root)"
            className={FIELD_CLASS}
          />
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <input
              value={catalogPath}
              onChange={(event) => onCatalogPathChange(event.target.value)}
              placeholder="Catalog path (e.g. /abs/repo/skills/my-skill)"
              className={FIELD_CLASS}
            />
            <input
              value={catalogName}
              onChange={(event) => onCatalogNameChange(event.target.value)}
              placeholder="Optional name override"
              className={FIELD_CLASS}
            />
            <button
              type="button"
              disabled={!token || !catalogPath.trim() || busy === 'catalog:add'}
              onClick={onCatalogAdd}
              className={PRIMARY_BUTTON_CLASS}
            >
              Add To Catalog
            </button>
          </div>
        </div>
      </details>
    </article>
  );
}

export function SkillsPage() {
  const token = useAppStore((state) => state.token);
  const queryClient = useQueryClient();
  const skillsQuery = useQuery(skillsQueryOptions(token));
  const catalogQuery = useQuery(skillsCatalogQueryOptions(token));
  const skills = skillsQuery.data ?? [];
  const catalog = catalogQuery.data ?? null;
  const [pageState, dispatchPageState] = useReducer(skillsPageReducer, INITIAL_SKILLS_PAGE_STATE);
  const {
    outputBySkill,
    busy,
    source,
    selectedSkillsInput,
    catalogPath,
    catalogName,
    autodiscoverRoot,
    approved,
    error,
    notice,
    repairResult
  } = pageState;

  const fallbackOnly = useMemo(
    () => skills.length === 1 && skills[0]?.name.trim().toLowerCase() === 'fallback-core',
    [skills]
  );
  const installDraft = useMemo(() => parseSkillInstallDraft(source, selectedSkillsInput), [selectedSkillsInput, source]);
  const repairLog = useMemo(() => {
    if (!repairResult) {
      return '';
    }
    return repairResult.steps
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
  }, [repairResult]);

  const patchPageState = useCallback((patch: Partial<SkillsPageState>) => {
    dispatchPageState({ type: 'patch', patch });
  }, []);

  const recordSkillOutput = useCallback((skillName: string, output: string) => {
    dispatchPageState({ type: 'record_output', skillName, output });
  }, []);

  const invalidateSkillReads = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    patchPageState({ error: null });
    await invalidateSkillReadQueries(queryClient, token);
  }, [patchPageState, queryClient, token]);

  const refreshSkillReads = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    patchPageState({ error: null });
    await Promise.all([skillsQuery.refetch(), catalogQuery.refetch()]);
  }, [catalogQuery, patchPageState, skillsQuery, token]);

  const handleRepairBaselineSkills = useCallback(() => {
    if (!token) {
      return;
    }
    patchPageState({ busy: 'repair:baseline', error: null, notice: null });
    void bootstrapVendorAssets(token, { target: 'baseline-skills' })
      .then(async (result) => {
        patchPageState({ repairResult: result });
        await invalidateSkillReads();
        if (result.status === 'ok') {
          patchPageState({ notice: `Baseline skills repaired from ${result.context.baselineSkillsDir}.` });
        } else {
          patchPageState({ error: 'Baseline skills repair finished with errors. Review the transcript below.' });
        }
      })
      .catch((cause: unknown) => {
        patchPageState({ error: cause instanceof Error ? cause.message : 'Baseline skills repair failed' });
      })
      .finally(() => patchPageState({ busy: null }));
  }, [invalidateSkillReads, patchPageState, token]);

  const handleInstallSkill = useCallback(() => {
    if (!token || !installDraft) {
      return;
    }
    patchPageState({ busy: 'install', error: null, notice: null });
    void installExternalSkill(token, {
      source: source.trim(),
      approved,
      selectedSkills: installDraft.selectedSkills
    })
      .then(async (result) => {
        const installedNames =
          result.installation?.installedSkills
            ?.map((skill) => skill.name.trim())
            .filter((name) => name.length > 0) ?? [];
        patchPageState({
          source: '',
          selectedSkillsInput: '',
          notice:
            installedNames.length > 0
              ? `Installed ${installedNames.join(', ')}.`
              : installDraft.selectedSkills.length > 0
                ? `Install queued for ${installDraft.selectedSkills.join(', ')}.`
                : `Installed skills from ${installDraft.canonicalSource}.`
        });
        await invalidateSkillReads();
      })
      .catch((cause: unknown) => {
        patchPageState({ error: cause instanceof Error ? cause.message : 'Install failed' });
      })
      .finally(() => patchPageState({ busy: null }));
  }, [approved, installDraft, invalidateSkillReads, patchPageState, source, token]);

  const handleAutodiscover = useCallback(() => {
    if (!token) {
      return;
    }
    patchPageState({ busy: 'autodiscover' });
    void autodiscoverSkills(token, {
      roots: autodiscoverRoot.trim() ? [autodiscoverRoot.trim()] : undefined,
      approved
    })
      .then(async () => {
        await invalidateSkillReads();
      })
      .catch((cause: unknown) => {
        patchPageState({ error: cause instanceof Error ? cause.message : 'Autodiscover failed' });
      })
      .finally(() => patchPageState({ busy: null }));
  }, [approved, autodiscoverRoot, invalidateSkillReads, patchPageState, token]);

  const handleCatalogAdd = useCallback(() => {
    if (!token || !catalogPath.trim()) {
      return;
    }
    patchPageState({ busy: 'catalog:add' });
    void upsertSkillCatalogEntry(token, {
      path: catalogPath.trim(),
      name: catalogName.trim() || undefined,
      approved
    })
      .then(async () => {
        patchPageState({ catalogPath: '', catalogName: '' });
        await invalidateSkillReads();
      })
      .catch((cause: unknown) => {
        patchPageState({ error: cause instanceof Error ? cause.message : 'Catalog update failed' });
      })
      .finally(() => patchPageState({ busy: null }));
  }, [approved, catalogName, catalogPath, invalidateSkillReads, patchPageState, token]);

  const handleDryRun = useCallback((skill: SkillRow) => {
    patchPageState({ busy: skill.name });
    void invokeSkill(skill.name, token, { reason: 'dashboard_check' }, { dryRun: true })
      .then((result) => {
        recordSkillOutput(skill.name, result.output || JSON.stringify(result.structured ?? {}, null, 2));
      })
      .catch((cause: unknown) => {
        recordSkillOutput(skill.name, cause instanceof Error ? cause.message : 'Skill invocation failed');
      })
      .finally(() => {
        patchPageState({ busy: null });
      });
  }, [patchPageState, recordSkillOutput, token]);

  const handleRemoveSkill = useCallback((skill: SkillRow, approvedMode: boolean) => {
    if (!token) {
      return;
    }
    patchPageState({ busy: `remove:${skill.name}` });
    void removeExternalSkill(token, { skillName: skill.name, approved: approvedMode })
      .then(async () => {
        await invalidateSkillReads();
      })
      .catch((cause: unknown) => {
        patchPageState({ error: cause instanceof Error ? cause.message : 'Remove failed' });
      })
      .finally(() => patchPageState({ busy: null }));
  }, [invalidateSkillReads, patchPageState, token]);

  const handleRemoveCatalogEntry = useCallback((path: string, approvedMode: boolean) => {
    if (!token) {
      return;
    }
    patchPageState({ busy: `catalog:remove:${path}` });
    void removeSkillCatalogEntry(token, { path, approved: approvedMode })
      .then(async () => {
        await invalidateSkillReads();
      })
      .catch((cause: unknown) => {
        patchPageState({ error: cause instanceof Error ? cause.message : 'Catalog remove failed' });
      })
      .finally(() => patchPageState({ busy: null }));
  }, [invalidateSkillReads, patchPageState, token]);

  return (
    <section className="shell-page shell-page-wide pb-10">
      <PageIntro
        eyebrow="Workforce"
        title="Installed skills"
        description="Paste a skills.sh link or docs command to install fast, then run checks or remove skills below."
        actions={
          <button
            type="button"
            onClick={() => {
              void refreshSkillReads();
            }}
            className={GHOST_BUTTON_CLASS}
          >
            Reload
          </button>
        }
      />

      <QuickSkillInstallPanel
        token={token}
        busy={busy}
        approved={approved}
        source={source}
        selectedSkillsInput={selectedSkillsInput}
        catalog={catalog}
        error={error}
        notice={notice}
        draft={installDraft}
        onSourceChange={(value) => patchPageState({ source: value })}
        onSelectedSkillsInputChange={(value) => patchPageState({ selectedSkillsInput: value })}
        onApprovedChange={(value) => patchPageState({ approved: value })}
        onInstall={handleInstallSkill}
        onUseExample={(value, nextSelectedSkillsInput) =>
          patchPageState({ source: value, selectedSkillsInput: nextSelectedSkillsInput, error: null, notice: null })
        }
      />

      {skills.length === 0 ? (
        <article className="mt-6 rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/40">No skills discovered.</article>
      ) : (
        <div className="mt-6 space-y-3">
          {skills.map((skill) => (
            <SkillCard
              key={skill.id ?? `${skill.name}-${skill.version}`}
              skill={skill}
              token={token}
              busy={busy}
              approved={approved}
              output={outputBySkill[skill.name]}
              onDryRun={handleDryRun}
              onRemove={handleRemoveSkill}
            />
          ))}
        </div>
      )}

      <PageDisclosure
        title="Registry maintenance"
        description="Use this for resync, autodiscovery, baseline repair, or manual catalog paths."
      >
        <SkillRegistryPanel
          token={token}
          busy={busy}
          approved={approved}
          catalog={catalog}
          fallbackOnly={fallbackOnly}
          autodiscoverRoot={autodiscoverRoot}
          catalogPath={catalogPath}
          catalogName={catalogName}
          onRefresh={() => {
            void refreshSkillReads();
          }}
          onResync={() => {
            if (!token) {
              return;
            }
            patchPageState({ busy: 'resync' });
            void resyncExternalSkills(token, { approved })
              .then(async () => {
                await invalidateSkillReads();
              })
              .catch((cause: unknown) => {
                patchPageState({ error: cause instanceof Error ? cause.message : 'Resync failed' });
              })
              .finally(() => patchPageState({ busy: null }));
          }}
          onAutodiscover={handleAutodiscover}
          onAutodiscoverRootChange={(value) => patchPageState({ autodiscoverRoot: value })}
          onCatalogPathChange={(value) => patchPageState({ catalogPath: value })}
          onCatalogNameChange={(value) => patchPageState({ catalogName: value })}
          onCatalogAdd={handleCatalogAdd}
          onRepairBaseline={handleRepairBaselineSkills}
        />
      </PageDisclosure>

      <details className="overflow-hidden rounded-[1.55rem] border border-white/8 bg-[color:var(--shell-surface)]/90">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-white">Catalog entries</summary>
        <div className="border-t border-white/8 px-5 py-5">
          <SkillCatalogEntries
            catalog={catalog}
            token={token}
            busy={busy}
            approved={approved}
            onRemoveEntry={handleRemoveCatalogEntry}
          />
        </div>
      </details>

      <details className="overflow-hidden rounded-[1.55rem] border border-white/8 bg-[color:var(--shell-surface)]/90">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-white">Install history</summary>
        <div className="border-t border-white/8 px-5 py-5">
          <SkillOperationHistory catalog={catalog} />
        </div>
      </details>

      <BaselineRepairTranscript repairResult={repairResult} repairLog={repairLog} />
    </section>
  );
}
