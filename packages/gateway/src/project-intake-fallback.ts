import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface DeterministicProjectIntakeArtifacts {
  prd: string;
  plan: string;
  metadata: {
    projectLabel: string;
    repoRoot: string | null;
    repoExists: boolean;
    gitHead: string | null;
    packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | null;
    frontendSurface: string | null;
    fallbackReason: string;
  };
}

interface BuildDeterministicProjectIntakeInput {
  prompt: string;
  projectId: string | null;
  repoRoot: string | null;
  fallbackReason: string;
  generatedAt?: string;
}

function repoExists(repoRoot: string | null): boolean {
  return typeof repoRoot === 'string' && repoRoot.trim().length > 0 && fsSync.existsSync(path.resolve(repoRoot));
}

function resolveProjectLabel(input: { projectId: string | null; repoRoot: string | null }): string {
  const repoName =
    typeof input.repoRoot === 'string' && input.repoRoot.trim().length > 0
      ? path.basename(path.resolve(input.repoRoot.trim()))
      : null;
  const raw = repoName ?? input.projectId ?? 'tracked repository';
  return raw
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readGitHead(repoRoot: string | null): string | null {
  if (!repoExists(repoRoot)) {
    return null;
  }
  const result = spawnSync('git', ['-C', path.resolve(repoRoot as string), 'rev-parse', 'HEAD'], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return null;
  }
  const head = String(result.stdout ?? '').trim();
  return head.length > 0 ? head : null;
}

function detectPackageManager(repoRoot: string | null): 'bun' | 'pnpm' | 'yarn' | 'npm' | null {
  if (!repoExists(repoRoot)) {
    return null;
  }
  const resolvedRepoRoot = path.resolve(repoRoot as string);
  const lockfileMap: Array<{ file: string; manager: 'bun' | 'pnpm' | 'yarn' | 'npm' }> = [
    { file: 'bun.lock', manager: 'bun' },
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' }
  ];
  for (const lockfile of lockfileMap) {
    if (fsSync.existsSync(path.join(resolvedRepoRoot, lockfile.file))) {
      return lockfile.manager;
    }
  }

  const readmeCandidates = ['README.md', 'README.MD', 'README.txt'];
  for (const candidate of readmeCandidates) {
    const candidatePath = path.join(resolvedRepoRoot, candidate);
    if (!fsSync.existsSync(candidatePath)) {
      continue;
    }
    const content = fsSync.readFileSync(candidatePath, 'utf8').toLowerCase();
    if (content.includes('bun install') || content.includes('bun run ')) {
      return 'bun';
    }
    if (content.includes('pnpm install') || content.includes('pnpm run ')) {
      return 'pnpm';
    }
    if (content.includes('yarn install') || content.includes('yarn ')) {
      return 'yarn';
    }
    if (content.includes('npm install') || content.includes('npm run ')) {
      return 'npm';
    }
  }
  return null;
}

function detectFrontendSurface(repoRoot: string | null): string | null {
  if (!repoExists(repoRoot)) {
    return null;
  }
  const resolvedRepoRoot = path.resolve(repoRoot as string);
  const candidates = [
    'frontend/src/routes',
    'src/routes',
    'app/routes',
    'app',
    'pages',
    'frontend/src/pages',
    'src/pages'
  ];
  for (const candidate of candidates) {
    const candidatePath = path.join(resolvedRepoRoot, candidate);
    if (fsSync.existsSync(candidatePath)) {
      return candidate;
    }
  }
  return null;
}

function installCommandForPackageManager(packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | null): string {
  switch (packageManager) {
    case 'bun':
      return 'bun install';
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn install';
    case 'npm':
      return 'npm install';
    default:
      return 'inspect README and lockfiles before installing dependencies';
  }
}

function verificationCommandForPackageManager(packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | null): string {
  switch (packageManager) {
    case 'bun':
      return 'bun run build';
    case 'pnpm':
      return 'pnpm build';
    case 'yarn':
      return 'yarn build';
    case 'npm':
      return 'npm run build';
    default:
      return 'run the repo-native build or typecheck command documented in the README';
  }
}

function buildFunctionalRequirementSteps(input: {
  prompt: string;
  frontendSurface: string | null;
  packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | null;
}): string[] {
  const steps = [
    'Audit the current repository structure, README guidance, and relevant route or navigation files before editing.',
    `Use the repo-native package manager flow (${installCommandForPackageManager(input.packageManager)}) instead of mixing toolchains.`,
    `Implement the requested change in product files only: ${input.prompt}.`
  ];
  if (input.frontendSurface) {
    steps.push(`Preserve the existing app shell and route conventions under ${input.frontendSurface}.`);
  } else {
    steps.push('Preserve the existing project architecture and place new UI or API surfaces in the established app structure.');
  }
  return steps;
}

function buildTestingSteps(packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | null): string[] {
  return [
    'Run the most relevant local validation for the touched surface after implementation.',
    `Prefer the documented repo-native verification command (${verificationCommandForPackageManager(packageManager)} or narrower equivalents).`,
    'Capture the exact commands, outcomes, and changed product files in the delivery summary.'
  ];
}

function buildPlanTasks(input: {
  prompt: string;
  repoAvailable: boolean;
  gitHead: string | null;
  packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm' | null;
  frontendSurface: string | null;
}): Array<Record<string, unknown>> {
  const auditPasses = input.repoAvailable;
  const auditExample = input.repoAvailable
    ? `Example: repository audit confirms the current codebase is present${input.gitHead ? ` at commit ${input.gitHead}` : ''}.`
    : 'Example: repository clone or workspace resolution succeeds before implementation starts.';
  const auditNegative = input.repoAvailable
    ? 'Negative: missing README, manifests, or route surfaces are called out explicitly before coding.'
    : 'Negative: do not claim implementation readiness when the repository is still missing or unresolved.';
  const requestLabel = input.prompt.trim();
  return [
    {
      id: 'T-001',
      category: 'setup',
      description: 'Audit the repository state, toolchain, and feature touchpoints before implementation.',
      depends_on: [],
      steps: [
        'Confirm the repository workspace exists and identify the current project surfaces relevant to the request.',
        'Inspect README instructions, lockfiles, and package manifests before running install/build/test commands.',
        'Locate the existing routes, navigation components, or API surfaces that the requested change should extend.'
      ],
      criteria: [
        auditExample,
        auditNegative
      ],
      passes: auditPasses,
      priority: 55
    },
    {
      id: 'T-002',
      category: 'feature',
      description: `Implement the operator request in publishable product files: ${requestLabel}.`,
      depends_on: ['T-001'],
      steps: buildFunctionalRequirementSteps({
        prompt: requestLabel,
        frontendSurface: input.frontendSurface,
        packageManager: input.packageManager
      }),
      criteria: [
        `Example: the requested behavior "${requestLabel}" exists in product code and can be reached through the intended user flow.`,
        'Negative: do not satisfy the task by editing only planning artifacts, runtime logs, screenshots, or incidental lockfiles.'
      ],
      passes: false,
      priority: 90
    },
    {
      id: 'T-003',
      category: 'ui',
      description: 'Integrate the requested change into the existing shell, navigation, and safe fallback states.',
      depends_on: ['T-002'],
      steps: [
        'Wire any required route, navigation, or discoverability entry using the project’s existing shell patterns.',
        'Preserve unauthenticated vs authenticated behavior based on the surrounding route hierarchy.',
        'Use honest fallback copy and avoid fake destinations, dead submit buttons, or placeholder contact details.'
      ],
      criteria: [
        'Example: users can discover and open the new surface from the existing shell without breaking the surrounding layout.',
        'Negative: avoid inaccessible routes, broken links, or hidden pages that only exist in source code.'
      ],
      passes: false,
      priority: 75
    },
    {
      id: 'T-004',
      category: 'testing',
      description: 'Validate the requested change with repo-native checks and behavior-focused evidence.',
      depends_on: ['T-002', 'T-003'],
      steps: buildTestingSteps(input.packageManager),
      criteria: [
        'Example: the relevant build, typecheck, lint, test, or smoke check passes for the touched surface.',
        'Negative: do not mark validation complete when checks fail, are skipped without explanation, or target the wrong route/environment.'
      ],
      passes: false,
      priority: 95
    },
    {
      id: 'T-005',
      category: 'testing',
      description: 'Ship clean delivery evidence tied to real repository changes and backlog completion.',
      depends_on: ['T-004'],
      steps: [
        'Review git status and changed files before publishing or marking the backlog item done.',
        'Exclude `.ops-runtime/*`, `.agents/*`, `.routing/*`, and incidental lockfiles unless the feature genuinely requires them.',
        'Capture commit SHA, PR URL, or a precise changed-file list that points only to publishable product work.'
      ],
      criteria: [
        'Example: delivery evidence references real product-file diffs and a clean publishable repository state.',
        'Negative: do not report success when the only changes are runtime artifacts, planning files, screenshots, or unscoped workspace noise.'
      ],
      passes: false,
      priority: 80
    }
  ];
}

export function buildDeterministicProjectIntakeArtifacts(
  input: BuildDeterministicProjectIntakeInput
): DeterministicProjectIntakeArtifacts {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const normalizedRepoRoot =
    typeof input.repoRoot === 'string' && input.repoRoot.trim().length > 0 ? path.resolve(input.repoRoot.trim()) : null;
  const repoAvailable = repoExists(normalizedRepoRoot);
  const gitHead = readGitHead(normalizedRepoRoot);
  const packageManager = detectPackageManager(normalizedRepoRoot);
  const frontendSurface = detectFrontendSurface(normalizedRepoRoot);
  const projectLabel = resolveProjectLabel({
    projectId: input.projectId,
    repoRoot: normalizedRepoRoot
  });
  const taskList = buildPlanTasks({
    prompt: input.prompt,
    repoAvailable,
    gitHead,
    packageManager,
    frontendSurface
  });

  const prdLines = [
    `# ${projectLabel} Intake PRD`,
    '',
    `Generated at: ${generatedAt}`,
    '',
    '## Overview',
    `Deterministic intake fallback generated because the planning run did not leave syncable artifacts in place. This PRD keeps backlog creation moving while preserving the operator request and the repository evidence we could verify locally.`,
    '',
    '## Goals',
    `- Deliver the operator request against the tracked repository: ${input.prompt.trim()}.`,
    '- Keep implementation scoped to publishable product files instead of runtime or planning artifacts.',
    '- Validate the change with the repository-native toolchain and record trustworthy delivery evidence.',
    '',
    '## Non-Goals',
    '- Invent deployment work, infrastructure changes, or backend form handling unless the operator request explicitly requires them.',
    '- Fabricate contact destinations, auth rules, or verification results that do not exist in the repository.',
    '- Count `.ops-runtime`, `.agents`, `.routing`, or incidental lockfile noise as completed product work.',
    '',
    '## Technical Stack',
    `- Repository root: ${normalizedRepoRoot ?? 'unresolved'}`,
    `- Git HEAD: ${gitHead ?? 'unresolved'}`,
    `- Package manager hint: ${packageManager ?? 'unknown'}`,
    `- Primary frontend surface: ${frontendSurface ?? 'not detected'}`,
    '',
    '## Functional Requirements',
    '- Preserve the existing app shell, architecture, and conventions when introducing the requested change.',
    '- Keep public vs authenticated behavior aligned with the existing route hierarchy and surrounding navigation.',
    '- Surface honest fallback states instead of fake destinations, fake emails, or dead submit flows.',
    '',
    '## Quality Gates',
    `- Inspect README and manifests before running ${installCommandForPackageManager(packageManager)} or any other dependency command.`,
    `- Run the repo-native validation command after implementation (${verificationCommandForPackageManager(packageManager)} or a narrower documented check).`,
    '- Confirm that delivery evidence points only to publishable product files and excludes control-plane artifacts.',
    '',
    '## Open Questions',
    '- Are there real contact destinations, inboxes, or support policies already defined elsewhere in the repository or product docs?',
    '- Does the requested change require a purely public surface, or should it respect existing authenticated route patterns?',
    '',
    '## Fallback Reason',
    input.fallbackReason.trim()
  ];

  const planLines = [
    `# ${projectLabel} Intake Plan`,
    '',
    `Generated at: ${generatedAt}`,
    '',
    '## Intake Summary',
    `- Request: ${input.prompt.trim()}`,
    `- Repo root: ${normalizedRepoRoot ?? 'unresolved'}`,
    `- Package manager hint: ${packageManager ?? 'unknown'}`,
    `- Frontend surface: ${frontendSurface ?? 'not detected'}`,
    `- Fallback reason: ${input.fallbackReason.trim()}`,
    '',
    '## Task List',
    '```json',
    JSON.stringify(taskList, null, 2),
    '```',
    ''
  ];

  return {
    prd: prdLines.join('\n'),
    plan: planLines.join('\n'),
    metadata: {
      projectLabel,
      repoRoot: normalizedRepoRoot,
      repoExists: repoAvailable,
      gitHead,
      packageManager,
      frontendSurface,
      fallbackReason: input.fallbackReason.trim()
    }
  };
}
