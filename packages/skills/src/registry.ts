import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import YAML from 'yaml';

import type { ControlPlaneDatabase } from '@ops/db';
import { utcNow } from '@ops/shared';

import { skillCatalogEntrySchema, type SkillCatalogEntry } from './catalog.js';
import { skillManifestSchema, type SkillManifest } from './manifest.js';

export interface SkillInvocationInput {
  name: string;
  payload: Record<string, unknown>;
  dryRun?: boolean;
  approved?: boolean;
  actor: string;
  correlationId: string;
}

export interface SkillInvocationOutput {
  ok: boolean;
  output: string;
  structured?: Record<string, unknown>;
}

export interface SkillRegistryOptions {
  directories: string[];
  catalogStrict?: boolean;
  sandboxDefault: boolean;
  workingDirectory: string;
  installer?: {
    enabled: boolean;
    allowedSources: string[];
    blockedSources: string[];
    requireApproval: boolean;
    timeoutMs: number;
    maxAttempts: number;
    installRoot: string;
  };
  runner?: (
    input: {
      command: string;
      args: string[];
      cwd: string;
      timeoutMs: number;
    }
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface SkillSourceRef {
  owner: string;
  repo: string;
  canonical: string;
}

export interface SkillInstallTarget {
  source: SkillSourceRef;
  installSource: string;
  selectedSkills: string[];
  sourceKind: 'repo' | 'github' | 'skills.sh' | 'command';
}

export interface SkillInstallResult {
  source: SkillSourceRef;
  installSource: string;
  selectedSkills: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  installedSkills: SkillManifest[];
  installRoot: string;
}

export interface SkillRemoveResult {
  removedSkillName: string;
  removedPath: string;
  removedDirectory: boolean;
}

export interface SkillPromptEntry {
  name: string;
  description: string;
  location: string;
  enabled: boolean;
  requiresApproval: boolean;
  runtimeSource: 'script' | 'markdown';
}

interface SkillRuntimeManifest extends SkillManifest {
  runtimeSource: 'script' | 'markdown';
  absolutePath: string;
  absoluteEntry: string;
  absoluteManifestPath: string;
  markdownBody?: string;
  markdownFrontmatter?: Record<string, unknown>;
}

const MARKDOWN_SKILL_ENTRY = '__skill_markdown__';

export class SkillRegistry {
  private readonly manifests = new Map<string, SkillRuntimeManifest>();
  private readonly disabledReasons = new Map<string, string[]>();

  constructor(
    private readonly database: ControlPlaneDatabase,
    private readonly options: SkillRegistryOptions
  ) {}

  async load(): Promise<SkillManifest[]> {
    this.manifests.clear();
    this.disabledReasons.clear();

    const { entries: catalogEntries, strict: catalogStrict } = await this.readCatalog();
    const loadedPaths = new Set<string>();

    for (const entry of catalogEntries) {
      const absoluteSkillPath = this.resolvePath(entry.path);
      loadedPaths.add(path.resolve(absoluteSkillPath));
      await this.loadSkillFromDirectory(absoluteSkillPath, entry);
    }

    if (!catalogStrict) {
      for (const directory of this.options.directories) {
        const absoluteDirectory = this.resolvePath(directory);
        const entries = await readDirectorySafe(absoluteDirectory);

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const skillPath = path.join(absoluteDirectory, String(entry.name));
          if (loadedPaths.has(path.resolve(skillPath))) {
            continue;
          }

          try {
            await this.loadSkillFromDirectory(skillPath);
          } catch {
            // Ignore malformed or incomplete skills during directory discovery.
            continue;
          }
        }
      }
    }

    const loadedNames = new Set(this.manifests.keys());
    for (const persisted of this.database.listSkills()) {
      if (!loadedNames.has(persisted.name)) {
        this.database.removeSkillByName(persisted.name);
      }
    }

    return [...this.manifests.values()].map(stripInternalFields);
  }

  list(): SkillManifest[] {
    return [...this.manifests.values()].map(stripInternalFields);
  }

  listPromptEntries(): SkillPromptEntry[] {
    return [...this.manifests.values()].map((manifest) => ({
      name: manifest.name,
      description: manifest.description,
      location: manifest.absoluteManifestPath,
      enabled: manifest.enabled,
      requiresApproval: manifest.requiresApproval,
      runtimeSource: manifest.runtimeSource
    }));
  }

  get(name: string): SkillManifest | undefined {
    const manifest = this.manifests.get(name);
    return manifest ? stripInternalFields(manifest) : undefined;
  }

  installerPolicy(): NonNullable<SkillRegistryOptions['installer']> {
    return {
      enabled: this.options.installer?.enabled ?? false,
      allowedSources: this.options.installer?.allowedSources ?? ['*/*'],
      blockedSources: this.options.installer?.blockedSources ?? [],
      requireApproval: this.options.installer?.requireApproval ?? true,
      timeoutMs: this.options.installer?.timeoutMs ?? 180_000,
      maxAttempts: this.options.installer?.maxAttempts ?? 2,
      installRoot: this.options.installer?.installRoot ?? '.ops/skills'
    };
  }

  parseSourceReference(raw: string): SkillSourceRef | null {
    return this.resolveInstallTarget(raw)?.source ?? null;
  }

  resolveInstallTarget(raw: string, selectedSkills?: string[]): SkillInstallTarget | null {
    const normalizedRequestedSkills = normalizeSelectedSkills(selectedSkills);
    const commandInstall = parseSkillsInstallCommand(raw);
    const resolvedInput = commandInstall ?? parseDirectInstallInput(raw);
    if (!resolvedInput) {
      return null;
    }

    return {
      source: resolvedInput.source,
      installSource: resolvedInput.installSource,
      selectedSkills: mergeUniqueStringArrays(resolvedInput.selectedSkills, normalizedRequestedSkills),
      sourceKind: resolvedInput.sourceKind
    };
  }

  validateInstallerSource(sourceRef: SkillSourceRef): { allowed: boolean; reason?: string } {
    const policy = this.installerPolicy();
    const canonical = sourceRef.canonical;

    const blocked = policy.blockedSources.some((pattern) => wildcardMatch(canonical, pattern));
    if (blocked) {
      return {
        allowed: false,
        reason: `blocked by policy pattern (${policy.blockedSources.join(', ')})`
      };
    }

    const allowed = policy.allowedSources.length === 0 || policy.allowedSources.some((pattern) => wildcardMatch(canonical, pattern));
    if (!allowed) {
      return {
        allowed: false,
        reason: `source not allowed by policy (${policy.allowedSources.join(', ')})`
      };
    }

    return {
      allowed: true
    };
  }

  async installExternal(input: {
    source: string;
    actor: string;
    approved?: boolean;
    selectedSkills?: string[];
  }): Promise<SkillInstallResult> {
    const policy = this.installerPolicy();
    if (!policy.enabled) {
      throw new Error('Skill installer is disabled by policy');
    }
    if (policy.requireApproval && !input.approved) {
      throw new Error('Skill installer requires approval');
    }

    const target = this.resolveInstallTarget(input.source, input.selectedSkills);
    if (!target) {
      throw new Error('Invalid source reference. Expected a skills.sh URL, owner/repo, github URL, or npx skills add command.');
    }
    const sourcePolicy = this.validateInstallerSource(target.source);
    if (!sourcePolicy.allowed) {
      throw new Error(sourcePolicy.reason ?? 'Skill source blocked by policy');
    }

    const installRoot = this.resolvePath(policy.installRoot);
    await fs.mkdir(installRoot, { recursive: true });

    let lastResult: { exitCode: number; stdout: string; stderr: string } = {
      exitCode: 1,
      stdout: '',
      stderr: 'installer did not execute'
    };
    for (let attempt = 1; attempt <= Math.max(1, policy.maxAttempts); attempt += 1) {
      lastResult = await this.runCommand({
        command: 'npx',
        args: ['skills', 'add', target.installSource, ...serializeSelectedSkills(target.selectedSkills)],
        cwd: installRoot,
        timeoutMs: policy.timeoutMs
      });
      if (lastResult.exitCode === 0) {
        break;
      }
    }

    if (lastResult.exitCode !== 0) {
      throw new Error(
        `skills add failed for ${target.source.canonical}: ${lastResult.stderr || lastResult.stdout || `exit ${String(lastResult.exitCode)}`}`
      );
    }

    await this.syncCatalogWithDirectory(installRoot);
    const loaded = await this.load();
    const installedSkills = loaded.filter((skill) => {
      const skillPath = this.resolvePath(this.database.listSkills().find((row) => row.name === skill.name)?.path ?? '');
      return skillPath.startsWith(installRoot);
    });

    return {
      source: target.source,
      installSource: target.installSource,
      selectedSkills: target.selectedSkills,
      exitCode: lastResult.exitCode,
      stdout: lastResult.stdout,
      stderr: lastResult.stderr,
      installedSkills,
      installRoot
    };
  }

  async removeExternal(input: { skillName: string }): Promise<SkillRemoveResult> {
    const manifest = this.manifests.get(input.skillName);
    if (!manifest) {
      throw new Error(`Skill not found: ${input.skillName}`);
    }

    const removedPath = manifest.absolutePath;
    await fs.rm(removedPath, { recursive: true, force: true });
    this.database.removeSkillByName(input.skillName);
    await this.syncCatalogWithoutPath(removedPath);
    await this.load();

    return {
      removedSkillName: input.skillName,
      removedPath,
      removedDirectory: true
    };
  }

  async resyncExternalCatalog(): Promise<SkillManifest[]> {
    const policy = this.installerPolicy();
    const installRoot = this.resolvePath(policy.installRoot);
    await fs.mkdir(installRoot, { recursive: true });
    await this.syncCatalogWithDirectory(installRoot);
    return this.load();
  }

  async listCatalogEntries(): Promise<SkillCatalogEntry[]> {
    return this.readCatalogEntriesFromDatabase();
  }

  async upsertCatalogEntry(input: { entry: SkillCatalogEntry }): Promise<SkillCatalogEntry[]> {
    const parsedEntry = skillCatalogEntrySchema.parse(input.entry);
    const absolutePath = path.resolve(this.resolvePath(parsedEntry.path));
    const normalizedEntry: SkillCatalogEntry = {
      ...parsedEntry,
      path: this.pathRelativeToWorkspace(absolutePath)
    };
    this.database.upsertSkillCatalogEntry({
      path: normalizedEntry.path,
      name: normalizedEntry.name,
      enabled: normalizedEntry.enabled,
      requiresApproval: normalizedEntry.requiresApproval,
      supportsDryRun: normalizedEntry.supportsDryRun,
      tags: normalizedEntry.tags,
      allowedCommands: normalizedEntry.allowedCommands,
      requiredTools: normalizedEntry.requiredTools
    });
    return this.readCatalogEntriesFromDatabase();
  }

  async removeCatalogEntry(input: { path: string }): Promise<{ removed: boolean; entries: SkillCatalogEntry[] }> {
    const targetPath = this.pathRelativeToWorkspace(path.resolve(this.resolvePath(input.path)));
    const removed = this.database.removeSkillCatalogEntry(targetPath);
    if (!removed) {
      return {
        removed: false,
        entries: this.readCatalogEntriesFromDatabase()
      };
    }

    return {
      removed: true,
      entries: this.readCatalogEntriesFromDatabase()
    };
  }

  async autodiscover(input: {
    roots: string[];
    depth?: number;
  }): Promise<{
    roots: string[];
    discoveredDirectories: string[];
    addedEntries: number;
    entries: SkillCatalogEntry[];
  }> {
    const roots = input.roots.map((root) => this.resolvePath(root));
    const depth = input.depth ?? 6;
    const existingPaths = new Set(
      this.readCatalogEntriesFromDatabase().map((entry) => path.resolve(this.resolvePath(entry.path)))
    );
    const discoveredDirectories: string[] = [];
    let addedEntries = 0;

    for (const root of roots) {
      const discovered = await discoverSkillManifestDirectories(root, depth);
      for (const discoveredDirectory of discovered) {
        discoveredDirectories.push(discoveredDirectory);
        const absolute = path.resolve(discoveredDirectory);
        if (existingPaths.has(absolute)) {
          continue;
        }
        this.database.upsertSkillCatalogEntry({
          path: this.pathRelativeToWorkspace(absolute)
        });
        existingPaths.add(absolute);
        addedEntries += 1;
      }
    };

    return {
      roots,
      discoveredDirectories: Array.from(new Set(discoveredDirectories.map((item) => path.resolve(item)))),
      addedEntries,
      entries: this.readCatalogEntriesFromDatabase()
    };
  }

  async invoke(input: SkillInvocationInput): Promise<SkillInvocationOutput> {
    const manifest = this.manifests.get(input.name);
    if (!manifest) {
      throw new Error(`Skill not found: ${input.name}`);
    }

    if (!manifest.enabled) {
      const reasons = this.disabledReasons.get(manifest.name) ?? [];
      const suffix = reasons.length > 0 ? ` (${reasons.join('; ')})` : '';
      throw new Error(`Skill disabled: ${input.name}${suffix}`);
    }

    this.assertPermissionPolicy(manifest, input);

    const payload = {
      ...input.payload,
      dryRun: input.dryRun ?? false,
      approved: input.approved ?? false,
      invokedAt: utcNow(),
      skill: manifest.name
    };

    const output =
      manifest.runtimeSource === 'markdown'
        ? invokeMarkdownSkill(manifest, payload)
        : await executeSkillEntry(manifest.absoluteEntry, payload, manifest.absolutePath, {
            allowedCommands: manifest.allowedCommands,
            requiredTools: manifest.requiredTools
          });

    this.database.appendAudit({
      actor: input.actor,
      action: 'skill.invoke',
      resource: manifest.name,
      decision: 'allowed',
      reason: input.dryRun ? 'dry_run' : 'approved_execution',
      details: {
        scopes: manifest.scopes,
        output: output.output.slice(0, 500)
      },
      correlationId: input.correlationId
    });

    return output;
  }

  private async readCatalog(): Promise<{ entries: SkillCatalogEntry[]; strict: boolean }> {
    return {
      entries: this.readCatalogEntriesFromDatabase(),
      strict: Boolean(this.options.catalogStrict)
    };
  }

  private async syncCatalogWithDirectory(directory: string): Promise<void> {
    const discovery = await discoverSkillManifestDirectories(directory);
    if (discovery.length === 0) {
      return;
    }

    const existingPaths = new Set(
      this.readCatalogEntriesFromDatabase().map((entry) => path.resolve(this.resolvePath(entry.path)))
    );
    for (const manifestDirectory of discovery) {
      const absolute = path.resolve(manifestDirectory);
      if (existingPaths.has(absolute)) {
        continue;
      }
      this.database.upsertSkillCatalogEntry({
        path: this.pathRelativeToWorkspace(absolute)
      });
      existingPaths.add(absolute);
    }
  }

  private async syncCatalogWithoutPath(directoryPath: string): Promise<void> {
    this.database.removeSkillCatalogEntry(this.pathRelativeToWorkspace(path.resolve(directoryPath)));
  }

  private readCatalogEntriesFromDatabase(): SkillCatalogEntry[] {
    return this.database.listSkillCatalogEntries().map((entry) =>
      skillCatalogEntrySchema.parse({
        path: entry.path,
        name: entry.name ?? undefined,
        enabled: entry.enabled ?? undefined,
        requiresApproval: entry.requiresApproval ?? undefined,
        supportsDryRun: entry.supportsDryRun ?? undefined,
        tags: entry.tags,
        allowedCommands: entry.allowedCommands,
        requiredTools: entry.requiredTools
      })
    );
  }

  private pathRelativeToWorkspace(targetPath: string): string {
    const relative = path.relative(this.options.workingDirectory, targetPath);
    if (!relative || relative.startsWith('..')) {
      return targetPath;
    }
    return relative.split(path.sep).join('/');
  }

  private async runCommand(input: {
    command: string;
    args: string[];
    cwd: string;
    timeoutMs: number;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    if (this.options.runner) {
      return this.options.runner(input);
    }

    return new Promise((resolve) => {
      const child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      let finished = false;
      const timeout = setTimeout(() => {
        if (finished) {
          return;
        }
        child.kill('SIGKILL');
      }, Math.max(1_000, input.timeoutMs));

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeout);
        resolve({
          exitCode: 1,
          stdout,
          stderr: `${stderr}\n${error.message}`.trim()
        });
      });
      child.on('close', (code) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr
        });
      });
    });
  }

  private async loadSkillFromDirectory(skillPath: string, overrides?: SkillCatalogEntry): Promise<void> {
    const parsedManifest = await this.readDirectoryManifest(skillPath);
    const parsed = parsedManifest.manifest;

    const mergedManifestInput: Record<string, unknown> = { ...parsed };

    if (overrides) {
      if (overrides.name !== undefined && overrides.name !== String(parsed.name ?? '')) {
        throw new Error(
          `Catalog name mismatch for ${skillPath}: expected ${overrides.name}, found ${String(parsed.name ?? 'unknown')}`
        );
      }

      mergedManifestInput.enabled = overrides.enabled ?? mergedManifestInput.enabled;
      mergedManifestInput.requiresApproval = overrides.requiresApproval ?? mergedManifestInput.requiresApproval;
      mergedManifestInput.supportsDryRun = overrides.supportsDryRun ?? mergedManifestInput.supportsDryRun;
      mergedManifestInput.tags = mergeUniqueStringArrays(toStringArray(mergedManifestInput.tags), overrides.tags);
      mergedManifestInput.allowedCommands = mergeUniqueStringArrays(
        toStringArray(mergedManifestInput.allowedCommands),
        overrides.allowedCommands
      );
      mergedManifestInput.requiredTools = mergeUniqueStringArrays(
        toStringArray(mergedManifestInput.requiredTools),
        overrides.requiredTools
      );
    }

    const manifest = skillManifestSchema.parse(mergedManifestInput);
    const absoluteEntry =
      parsedManifest.runtimeSource === 'script' ? path.join(skillPath, manifest.entry) : parsedManifest.entryPath;

    const missingTools = findMissingTools(manifest.requiredTools);
    const disableForMissingTools = parsedManifest.runtimeSource === 'script' && missingTools.length > 0;
    const finalManifest: SkillRuntimeManifest = {
      ...manifest,
      runtimeSource: parsedManifest.runtimeSource,
      enabled: manifest.enabled && !disableForMissingTools,
      absolutePath: skillPath,
      absoluteEntry,
      absoluteManifestPath: parsedManifest.entryPath,
      ...(parsedManifest.runtimeSource === 'markdown'
        ? {
            markdownBody: parsedManifest.markdownBody,
            markdownFrontmatter: parsedManifest.frontmatter
          }
        : {})
    };

    if (disableForMissingTools) {
      this.disabledReasons.set(manifest.name, [`missing required tools: ${missingTools.join(', ')}`]);
    }

    this.manifests.set(manifest.name, finalManifest);
    this.database.upsertSkill({
      name: manifest.name,
      version: manifest.version,
      path: skillPath,
      scopes: manifest.scopes,
      enabled: finalManifest.enabled
    });
  }

  private async readDirectoryManifest(skillPath: string): Promise<
    | {
        runtimeSource: 'script';
        manifest: Record<string, unknown>;
        entryPath: string;
      }
    | {
        runtimeSource: 'markdown';
        manifest: Record<string, unknown>;
        entryPath: string;
        markdownBody: string;
        frontmatter: Record<string, unknown>;
      }
  > {
    const markdownPath = await resolveSkillMarkdownPath(skillPath);
    if (!markdownPath) {
      throw new Error(`No SKILL.md manifest found in ${skillPath}`);
    }
    const rawMarkdown = await fs.readFile(markdownPath, 'utf8');
    const parsedMarkdown = parseSkillMarkdown(rawMarkdown);
    const manifest = markdownSkillToManifest({
      directoryPath: skillPath,
      markdownPath,
      frontmatter: parsedMarkdown.frontmatter,
      body: parsedMarkdown.body
    });
    if (typeof manifest.entry === 'string' && manifest.entry !== MARKDOWN_SKILL_ENTRY) {
      return {
        runtimeSource: 'script',
        manifest,
        entryPath: markdownPath
      };
    }
    return {
      runtimeSource: 'markdown',
      manifest,
      entryPath: markdownPath,
      markdownBody: parsedMarkdown.body,
      frontmatter: parsedMarkdown.frontmatter
    };
  }

  private resolvePath(targetPath: string): string {
    const expanded = expandHomeDirectory(targetPath);
    return path.isAbsolute(expanded) ? expanded : path.join(this.options.workingDirectory, expanded);
  }

  private assertPermissionPolicy(manifest: SkillRuntimeManifest, input: SkillInvocationInput): void {
    if (manifest.requiresApproval && !input.dryRun && !input.approved) {
      this.database.appendAudit({
        actor: input.actor,
        action: 'skill.invoke',
        resource: manifest.name,
        decision: 'blocked',
        reason: 'approval_required',
        details: {
          requiresApproval: true,
          supportsDryRun: manifest.supportsDryRun
        },
        correlationId: input.correlationId
      });
      throw new Error(`Skill ${manifest.name} requires explicit approval`);
    }

    if (!manifest.supportsDryRun && input.dryRun) {
      throw new Error(`Skill ${manifest.name} does not support dry-run mode`);
    }

    if (this.options.sandboxDefault && manifest.scopes.process === 'exec' && !input.approved && !input.dryRun) {
      throw new Error(`Skill ${manifest.name} needs approval for process execution under sandbox policy`);
    }

    const missingTools = findMissingTools(manifest.requiredTools);
    if (missingTools.length > 0 && manifest.runtimeSource === 'script') {
      throw new Error(`Skill ${manifest.name} missing required tools: ${missingTools.join(', ')}`);
    }

    const requestedCommand = typeof input.payload.command === 'string' ? input.payload.command.trim() : '';
    if (
      manifest.runtimeSource === 'script' &&
      requestedCommand &&
      manifest.allowedCommands.length > 0 &&
      !manifest.allowedCommands.includes(requestedCommand)
    ) {
      throw new Error(`Command ${requestedCommand} is not allowed for skill ${manifest.name}`);
    }
  }
}

function stripInternalFields(manifest: SkillRuntimeManifest): SkillManifest {
  const publicManifest = { ...manifest } as SkillManifest & {
    absolutePath?: string;
    absoluteEntry?: string;
    runtimeSource?: 'script' | 'markdown';
    markdownBody?: string;
    markdownFrontmatter?: Record<string, unknown>;
  };
  delete publicManifest.absoluteEntry;
  delete publicManifest.absolutePath;
  delete publicManifest.runtimeSource;
  delete publicManifest.markdownBody;
  delete publicManifest.markdownFrontmatter;
  return publicManifest;
}

function invokeMarkdownSkill(manifest: SkillRuntimeManifest, payload: Record<string, unknown>): SkillInvocationOutput {
  const requestedTask = extractTaskHint(payload);
  const missingTools = findMissingTools(manifest.requiredTools);
  const instructions = (manifest.markdownBody ?? '').trim();
  const outputSections = [
    `Skill ${manifest.name} (${manifest.description})`,
    requestedTask ? `Requested task: ${requestedTask}` : null,
    missingTools.length > 0 ? `Tooling note: missing ${missingTools.join(', ')} in the current environment.` : null,
    instructions
  ].filter((section): section is string => Boolean(section && section.trim().length > 0));
  const output = outputSections.join('\n\n').trim().slice(0, 16_000);

  return {
    ok: true,
    output: output || manifest.description,
    structured: {
      kind: 'markdown_skill',
      name: manifest.name,
      description: manifest.description,
      requestedTask,
      missingTools,
      allowedCommands: manifest.allowedCommands,
      requiredTools: manifest.requiredTools,
      instructions,
      frontmatter: manifest.markdownFrontmatter ?? {}
    }
  };
}

async function executeSkillEntry(
  entryPath: string,
  payload: Record<string, unknown>,
  cwd: string,
  tooling: {
    allowedCommands: string[];
    requiredTools: string[];
  }
): Promise<SkillInvocationOutput> {
  await fs.access(entryPath);

  return new Promise<SkillInvocationOutput>((resolve, reject) => {
    const child = spawn('node', [entryPath], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OPS_SKILL_PAYLOAD: JSON.stringify(payload),
        OPS_SKILL_ALLOWED_COMMANDS: tooling.allowedCommands.join(','),
        OPS_SKILL_REQUIRED_TOOLS: tooling.requiredTools.join(',')
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Skill exited with code ${String(code)}`));
        return;
      }

      let structured: Record<string, unknown> | undefined;
      try {
        structured = JSON.parse(stdout) as Record<string, unknown>;
      } catch {
        structured = undefined;
      }

      if (structured !== undefined) {
        resolve({
          ok: true,
          output: stdout.trim() || stderr.trim(),
          structured
        });
        return;
      }

      resolve({
        ok: true,
        output: stdout.trim() || stderr.trim()
      });
    });

    child.stdin?.end();
  });
}

function findMissingTools(requiredTools: string[]): string[] {
  const missing = new Set<string>();
  for (const tool of requiredTools) {
    if (!commandExists(tool)) {
      missing.add(tool);
    }
  }
  return [...missing];
}

function commandExists(command: string): boolean {
  const binary = command.trim().split(/\s+/)[0];
  if (!binary) {
    return false;
  }

  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [binary], {
    stdio: 'ignore'
  });
  return result.status === 0;
}

function mergeUniqueStringArrays(base: string[], incoming?: string[]): string[] {
  const merged = [...base, ...(incoming ?? [])].map((item) => item.trim()).filter(Boolean);
  return [...new Set(merged)];
}

function normalizeSelectedSkills(input?: readonly string[]): string[] {
  const selected: string[] = [];
  for (const raw of input ?? []) {
    for (const candidate of raw.split(/[\n,]/)) {
      const normalized = candidate.trim();
      if (normalized) {
        selected.push(normalized);
      }
    }
  }
  return mergeUniqueStringArrays([], selected);
}

function serializeSelectedSkills(selectedSkills: readonly string[]): string[] {
  const args: string[] = [];
  for (const skill of selectedSkills) {
    const normalized = skill.trim();
    if (!normalized) {
      continue;
    }
    args.push('--skill', normalized);
  }
  return args;
}

function parseDirectInstallInput(raw: string): SkillInstallTarget | null {
  const input = raw.trim();
  if (!input) {
    return null;
  }

  const skillsDotShTarget = parseSkillsDotShUrl(input);
  if (skillsDotShTarget) {
    return skillsDotShTarget;
  }

  const source = parseRepoSourceReference(input);
  if (!source) {
    return null;
  }

  return {
    source,
    installSource: input,
    selectedSkills: [],
    sourceKind: input.includes('github.com') ? 'github' : 'repo'
  };
}

function parseSkillsInstallCommand(raw: string): SkillInstallTarget | null {
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

  const skillsDotShTarget = parseSkillsDotShUrl(installSource);
  if (skillsDotShTarget) {
    return {
      ...skillsDotShTarget,
      selectedSkills: mergeUniqueStringArrays(skillsDotShTarget.selectedSkills, selectedSkills),
      sourceKind: 'command'
    };
  }

  const source = parseRepoSourceReference(installSource);
  if (!source) {
    return null;
  }

  return {
    source,
    installSource,
    selectedSkills: normalizeSelectedSkills(selectedSkills),
    sourceKind: 'command'
  };
}

function parseRepoSourceReference(raw: string): SkillSourceRef | null {
  const input = raw.trim();
  if (!input) {
    return null;
  }

  const normalize = (ownerRaw: string, repoRaw: string): SkillSourceRef | null => {
    const owner = ownerRaw.trim().replace(/^@/, '').toLowerCase();
    const repo = repoRaw.trim().replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
    if (!owner || !repo) {
      return null;
    }
    return {
      owner,
      repo,
      canonical: `${owner}/${repo}`
    };
  };

  const httpsMatch = input.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)(?:[/?#].*)?$/i);
  if (httpsMatch?.[1] && httpsMatch?.[2]) {
    return normalize(httpsMatch[1], httpsMatch[2]);
  }

  const sshMatch = input.match(/^git@github\.com:([^/\s]+)\/([^/\s]+)$/i);
  if (sshMatch?.[1] && sshMatch?.[2]) {
    return normalize(sshMatch[1], sshMatch[2]);
  }

  const shortMatch = input.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch?.[1] && shortMatch?.[2]) {
    return normalize(shortMatch[1], shortMatch[2]);
  }

  return null;
}

function parseSkillsDotShUrl(raw: string): SkillInstallTarget | null {
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

  const source = parseRepoSourceReference(`${segments[0]}/${segments[1]}`);
  if (!source) {
    return null;
  }

  const selectedSkills = segments.length >= 3 ? normalizeSelectedSkills([decodeURIComponent(segments[2] ?? '')]) : [];
  return {
    source,
    installSource: source.canonical,
    selectedSkills,
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

function wildcardMatch(value: string, pattern: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern === '*') {
    return true;
  }
  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`, 'i');
  return regex.test(normalizedValue);
}

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => String(item));
}

async function readDirectorySafe(directoryPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM') {
      return [];
    }
    throw error;
  }
}

async function discoverSkillManifestDirectories(root: string, depth = 4): Promise<string[]> {
  const results: string[] = [];
  const walk = async (directory: string, remainingDepth: number): Promise<void> => {
    if (remainingDepth < 0) {
      return;
    }
    const entries = await readDirectorySafe(directory);
    for (const entry of entries) {
      const absolute = path.join(directory, String(entry.name));
      if (entry.isDirectory()) {
        await walk(absolute, remainingDepth - 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const normalized = entry.name.trim().toLowerCase();
      if (normalized !== 'skill.md') {
        continue;
      }
      results.push(path.dirname(absolute));
    }
  };

  await walk(root, depth);
  return Array.from(new Set(results.map((item) => path.resolve(item))));
}

async function resolveSkillMarkdownPath(skillPath: string): Promise<string | null> {
  const candidates = ['SKILL.md', 'skill.md'].map((name) => path.join(skillPath, name));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function parseSkillMarkdown(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) {
    return {
      frontmatter: {},
      body: raw
    };
  }
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: {},
      body: raw
    };
  }
  const parsed = YAML.parse(match[1] ?? '') as unknown;
  return {
    frontmatter: isRecord(parsed) ? parsed : {},
    body: match[2] ?? ''
  };
}

function markdownSkillToManifest(input: {
  directoryPath: string;
  markdownPath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}): Record<string, unknown> {
  const frontmatter = input.frontmatter;
  const rawName = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
  const fallbackName = normalizeMarkdownSkillName(path.basename(input.directoryPath));
  const name = rawName || fallbackName || normalizeMarkdownSkillName(path.basename(input.markdownPath)) || 'markdown-skill';
  const description =
    (typeof frontmatter.description === 'string' && frontmatter.description.trim().length > 0
      ? frontmatter.description.trim()
      : extractFirstMarkdownHeading(input.body) ?? `Markdown skill imported from ${path.basename(input.directoryPath)}`);
  const version =
    typeof frontmatter.version === 'string' && frontmatter.version.trim().length > 0 ? frontmatter.version.trim() : '1.0.0';
  const requiresApproval = typeof frontmatter.requiresApproval === 'boolean' ? frontmatter.requiresApproval : false;
  const supportsDryRun = typeof frontmatter.supportsDryRun === 'boolean' ? frontmatter.supportsDryRun : true;
  const enabled = typeof frontmatter.enabled === 'boolean' ? frontmatter.enabled : true;
  const entry =
    typeof frontmatter.entry === 'string' && frontmatter.entry.trim().length > 0
      ? frontmatter.entry.trim()
      : MARKDOWN_SKILL_ENTRY;
  const parseLegacyAllowedTools = (value: unknown): string[] =>
    toStringArray(value)
      .map((entry) => entry.trim())
      .flatMap((entry) => {
        if (!entry) {
          return [];
        }
        const wrappedMatch = entry.match(/^[A-Za-z0-9_-]+\(([^)]+)\)$/);
        const inner = wrappedMatch?.[1]?.trim() ?? entry;
        const command = inner.split(':')[0]?.trim() ?? '';
        return command ? [command] : [];
      })
      .filter(Boolean);
  const legacyAllowedTools = mergeUniqueStringArrays(
    parseLegacyAllowedTools(frontmatter['allowed-tools']),
    mergeUniqueStringArrays(
      parseLegacyAllowedTools(frontmatter.allowed_tools),
      parseLegacyAllowedTools(frontmatter.allowedTools)
    )
  );
  const allowedCommands = mergeUniqueStringArrays(
    toStringArray(frontmatter.allowedCommands).map((command) => command.trim()).filter(Boolean),
    legacyAllowedTools
  );
  const requiredTools = mergeUniqueStringArrays(
    toStringArray(frontmatter.requiredTools).map((tool) => tool.trim()).filter(Boolean),
    legacyAllowedTools
  );

  return {
    id:
      typeof frontmatter.id === 'string' && frontmatter.id.trim().length > 0
        ? frontmatter.id.trim()
        : normalizeMarkdownSkillName(name) || name,
    name,
    version,
    description,
    entry,
    enabled,
    requiresApproval,
    supportsDryRun,
    tags: toStringArray(frontmatter.tags).map((tag) => tag.trim()).filter(Boolean),
    allowedCommands,
    requiredTools,
    scopes: isRecord(frontmatter.scopes)
      ? frontmatter.scopes
      : {
          filesystem: 'none',
          process: 'none',
          network: 'none',
          secrets: 'none'
        }
  };
}

function normalizeMarkdownSkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractFirstMarkdownHeading(body: string): string | null {
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

function extractTaskHint(payload: Record<string, unknown>): string | null {
  const candidates = ['task', 'query', 'prompt', 'goal', 'objective'] as const;
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expandHomeDirectory(input: string): string {
  const value = input.trim();
  if (!value) {
    return input;
  }
  if (value === '~') {
    return process.env.HOME ?? process.env.USERPROFILE ?? value;
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    const home = process.env.HOME ?? process.env.USERPROFILE;
    if (!home) {
      return value;
    }
    return path.join(home, value.slice(2));
  }
  return value;
}
