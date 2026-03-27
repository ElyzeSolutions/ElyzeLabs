import fs from 'node:fs';
import path from 'node:path';

import type { RuntimeKind } from '@ops/shared';

import type { ReasoningEffort } from './reasoning.js';

export interface RuntimeReasoningSupport {
  mechanism: 'config_toml' | 'flag' | 'unsupported' | 'unknown';
  levels: ReasoningEffort[];
  injection: string;
  flag?: string | null;
}

export interface RuntimeCapability {
  runtimeId: RuntimeKind;
  displayName: string;
  modelFlag: string;
  role: {
    defaultLane: 'reasoning' | 'executor' | 'hybrid';
    reasoningBackedByLlm: boolean;
    localExecutorRequiresExplicitOptIn: boolean;
  };
  nativeToolSessions: {
    supported: boolean;
    transport: 'provider_bridge' | 'runtime_cli' | 'none';
    resumable: boolean;
    notes: string;
  };
  reasoningEffortSupport: RuntimeReasoningSupport;
  localSessionArtifacts: {
    roots: string[];
    formats: string[];
    strategy: string;
  } | null;
  supportedModels: string[];
  staffingHeuristics: string;
  limitations: string[];
  exampleCommands: string[];
}

export interface RuntimeCapabilitiesDocument {
  schemaVersion: 1;
  runtimes: RuntimeCapability[];
}

const DEFAULT_CAPABILITIES: RuntimeCapabilitiesDocument = {
  schemaVersion: 1,
  runtimes: [
    {
      runtimeId: 'codex',
      displayName: 'Codex CLI',
      modelFlag: '-m',
      role: {
        defaultLane: 'hybrid',
        reasoningBackedByLlm: true,
        localExecutorRequiresExplicitOptIn: false
      },
      nativeToolSessions: {
        supported: false,
        transport: 'none',
        resumable: false,
        notes: 'Codex currently runs through the runtime CLI lane without embedded native tool-session bridging.'
      },
      reasoningEffortSupport: {
        mechanism: 'config_toml',
        levels: ['low', 'medium', 'high', 'xhigh'],
        injection:
          'Add model_reasoning_effort and optional plan_mode_reasoning_effort to workspace config.toml before launch.',
        flag: null
      },
      localSessionArtifacts: {
        roots: ['~/.codex'],
        formats: ['history.jsonl'],
        strategy: 'Incremental JSONL tail scan with bounded file window and malformed-line tolerance.'
      },
      supportedModels: ['gpt-5.3-codex', 'gpt-5.2-codex', 'default'],
      staffingHeuristics: 'Deep implementation and heads-down coding tasks.',
      limitations: ['Requires config.toml mutation for reasoning effort.', 'Long-running tmux sessions should be supervised.'],
      exampleCommands: ['codex -m gpt-5.3-codex exec --skip-git-repo-check']
    },
    {
      runtimeId: 'claude',
      displayName: 'Claude Code',
      modelFlag: '--model',
      role: {
        defaultLane: 'hybrid',
        reasoningBackedByLlm: true,
        localExecutorRequiresExplicitOptIn: false
      },
      nativeToolSessions: {
        supported: false,
        transport: 'none',
        resumable: false,
        notes: 'Claude currently runs through the runtime CLI lane without embedded native tool-session bridging.'
      },
      reasoningEffortSupport: {
        mechanism: 'unsupported',
        levels: [],
        injection: 'No stable reasoning-effort control is available in baseline CLI.',
        flag: null
      },
      localSessionArtifacts: {
        roots: ['~/.claude/projects'],
        formats: ['**/*.jsonl'],
        strategy: 'Incremental JSONL scan keyed by runtime+file offsets.'
      },
      supportedModels: ['claude-sonnet', 'claude-opus', 'default'],
      staffingHeuristics: 'Coordination, review, and interruptible tasks.',
      limitations: ['Reasoning effort field is accepted but ignored when unsupported.'],
      exampleCommands: ['claude --model claude-sonnet']
    },
    {
      runtimeId: 'gemini',
      displayName: 'Gemini CLI',
      modelFlag: '--model',
      role: {
        defaultLane: 'hybrid',
        reasoningBackedByLlm: true,
        localExecutorRequiresExplicitOptIn: false
      },
      nativeToolSessions: {
        supported: false,
        transport: 'none',
        resumable: false,
        notes: 'Gemini CLI remains a runtime-cli lane; native tool-session bridging is not yet wired through the CLI path.'
      },
      reasoningEffortSupport: {
        mechanism: 'unknown',
        levels: [],
        injection: 'Reasoning effort mapping is runtime/provider dependent and currently experimental.',
        flag: null
      },
      localSessionArtifacts: {
        roots: ['~/.gemini/tmp'],
        formats: ['**/chats/*.json', '**/.project_root'],
        strategy: 'Full chat JSON parse with project-root sidecar lookup and incremental size checkpointing.'
      },
      supportedModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'default'],
      staffingHeuristics: 'Design sensibility and UI/UX focused tasks.',
      limitations: ['Reasoning effort support depends on provider path and may be unavailable.'],
      exampleCommands: ['gemini --model gemini-2.5-pro']
    },
    {
      runtimeId: 'process',
      displayName: 'Local Process Adapter',
      modelFlag: '--model',
      role: {
        defaultLane: 'hybrid',
        reasoningBackedByLlm: true,
        localExecutorRequiresExplicitOptIn: true
      },
      nativeToolSessions: {
        supported: true,
        transport: 'provider_bridge',
        resumable: true,
        notes:
          'Native tool sessions are available only on provider-backed process routes that expose tool calling; local shell execution stays a separate explicit fallback.'
      },
      reasoningEffortSupport: {
        mechanism: 'unsupported',
        levels: [],
        injection: 'Local process route does not expose a direct reasoning effort lane.',
        flag: null
      },
      localSessionArtifacts: null,
      supportedModels: ['default'],
      staffingHeuristics: 'Local scripts, diagnostics, and fallback orchestration.',
      limitations: ['Reasoning effort is advisory only.'],
      exampleCommands: ['node scripts/runtime/process-fail-closed.mjs']
    }
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRuntimeId(value: unknown): RuntimeKind | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'codex' || normalized === 'claude' || normalized === 'gemini' || normalized === 'process') {
    return normalized;
  }
  return null;
}

function parseCapability(value: unknown): RuntimeCapability | null {
  if (!isRecord(value)) {
    return null;
  }
  const runtimeId = normalizeRuntimeId(value.runtimeId);
  if (!runtimeId) {
    return null;
  }

  const reasoningRaw = isRecord(value.reasoningEffortSupport) ? value.reasoningEffortSupport : {};
  const levelsRaw = Array.isArray(reasoningRaw.levels) ? reasoningRaw.levels : [];
  const levels = levelsRaw
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry): entry is ReasoningEffort => entry === 'low' || entry === 'medium' || entry === 'high' || entry === 'xhigh');

  const mechanismRaw = String(reasoningRaw.mechanism ?? 'unsupported').trim().toLowerCase();
  const mechanism: RuntimeReasoningSupport['mechanism'] =
    mechanismRaw === 'config_toml' || mechanismRaw === 'flag' || mechanismRaw === 'unknown'
      ? mechanismRaw
      : 'unsupported';
  const localSessionArtifactsRaw = isRecord(value.localSessionArtifacts) ? value.localSessionArtifacts : null;
  const localSessionArtifacts =
    localSessionArtifactsRaw === null
      ? null
      : {
          roots: Array.isArray(localSessionArtifactsRaw.roots)
            ? localSessionArtifactsRaw.roots
                .map((entry) => String(entry).trim())
                .filter((entry) => entry.length > 0)
            : [],
          formats: Array.isArray(localSessionArtifactsRaw.formats)
            ? localSessionArtifactsRaw.formats
                .map((entry) => String(entry).trim())
                .filter((entry) => entry.length > 0)
            : [],
          strategy: String(localSessionArtifactsRaw.strategy ?? '').trim()
        };

  return {
    runtimeId,
    displayName: String(value.displayName ?? runtimeId),
    modelFlag: String(value.modelFlag ?? '--model'),
    role: {
      defaultLane:
        value.role && isRecord(value.role) && typeof value.role.defaultLane === 'string'
          ? (['reasoning', 'executor', 'hybrid'].includes(value.role.defaultLane)
              ? (value.role.defaultLane as 'reasoning' | 'executor' | 'hybrid')
              : 'hybrid')
          : 'hybrid',
      reasoningBackedByLlm:
        value.role && isRecord(value.role) ? value.role.reasoningBackedByLlm !== false : true,
      localExecutorRequiresExplicitOptIn:
        value.role && isRecord(value.role) ? value.role.localExecutorRequiresExplicitOptIn === true : false
    },
    nativeToolSessions: {
      supported:
        value.nativeToolSessions && isRecord(value.nativeToolSessions)
          ? value.nativeToolSessions.supported === true
          : false,
      transport:
        value.nativeToolSessions && isRecord(value.nativeToolSessions) && typeof value.nativeToolSessions.transport === 'string'
          ? (['provider_bridge', 'runtime_cli', 'none'].includes(value.nativeToolSessions.transport)
              ? (value.nativeToolSessions.transport as 'provider_bridge' | 'runtime_cli' | 'none')
              : 'none')
          : 'none',
      resumable:
        value.nativeToolSessions && isRecord(value.nativeToolSessions)
          ? value.nativeToolSessions.resumable === true
          : false,
      notes:
        value.nativeToolSessions && isRecord(value.nativeToolSessions)
          ? String(value.nativeToolSessions.notes ?? '')
          : ''
    },
    reasoningEffortSupport: {
      mechanism,
      levels,
      injection: String(reasoningRaw.injection ?? ''),
      flag: typeof reasoningRaw.flag === 'string' ? reasoningRaw.flag : null
    },
    localSessionArtifacts,
    supportedModels: Array.isArray(value.supportedModels)
      ? value.supportedModels.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
      : [],
    staffingHeuristics: String(value.staffingHeuristics ?? ''),
    limitations: Array.isArray(value.limitations)
      ? value.limitations.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
      : [],
    exampleCommands: Array.isArray(value.exampleCommands)
      ? value.exampleCommands.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
      : []
  };
}

function normalizeDocument(value: unknown): RuntimeCapabilitiesDocument | null {
  if (!isRecord(value) || !Array.isArray(value.runtimes)) {
    return null;
  }
  const runtimes = value.runtimes.map((entry) => parseCapability(entry)).filter((entry): entry is RuntimeCapability => entry !== null);
  if (runtimes.length === 0) {
    return null;
  }
  return {
    schemaVersion: 1,
    runtimes
  };
}

export function defaultRuntimeCapabilities(): RuntimeCapabilitiesDocument {
  return JSON.parse(JSON.stringify(DEFAULT_CAPABILITIES)) as RuntimeCapabilitiesDocument;
}

export function loadRuntimeCapabilities(input?: { rootDir?: string; filePath?: string }): RuntimeCapabilitiesDocument {
  const rootDir = input?.rootDir ? path.resolve(input.rootDir) : process.cwd();
  const filePath = input?.filePath ? path.resolve(input.filePath) : path.join(rootDir, '.ops', 'runtime-capabilities.json');
  if (!fs.existsSync(filePath)) {
    return defaultRuntimeCapabilities();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    const normalized = normalizeDocument(parsed);
    if (!normalized) {
      return defaultRuntimeCapabilities();
    }
    return normalized;
  } catch {
    return defaultRuntimeCapabilities();
  }
}

export function runtimeCapabilityById(
  document: RuntimeCapabilitiesDocument,
  runtime: RuntimeKind
): RuntimeCapability | null {
  return document.runtimes.find((entry) => entry.runtimeId === runtime) ?? null;
}
