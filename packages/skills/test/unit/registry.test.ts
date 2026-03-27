import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ControlPlaneDatabase } from '@ops/db';

import { SkillRegistry } from '../../src/index.ts';

describe('skill registry', () => {
  it('blocks risky execution without approval and allows dry run', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-'));
    const skillsDir = path.join(temp, 'skills', 'sample');
    fs.mkdirSync(skillsDir, { recursive: true });

    fs.writeFileSync(
      path.join(skillsDir, 'SKILL.md'),
      [
        '---',
        'id: sample',
        'name: sample',
        'version: 1.0.0',
        'description: sample skill',
        'entry: index.js',
        'enabled: true',
        'requiresApproval: true',
        'supportsDryRun: true',
        'scopes:',
        '  filesystem: read',
        '  process: exec',
        '  network: none',
        '  secrets: none',
        '---',
        '# sample'
      ].join('\n')
    );

    fs.writeFileSync(
      path.join(skillsDir, 'index.js'),
      "process.stdout.write(JSON.stringify({ ok: true, message: 'dry-run plan' }));"
    );

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    const registry = new SkillRegistry(db, {
      directories: ['skills'],
      sandboxDefault: true,
      workingDirectory: temp
    });

    await registry.load();

    await expect(
      registry.invoke({
        name: 'sample',
        payload: {},
        actor: 'test',
        correlationId: 'corr-1',
        dryRun: false,
        approved: false
      })
    ).rejects.toThrow('requires explicit approval');

    const dryRun = await registry.invoke({
      name: 'sample',
      payload: {},
      actor: 'test',
      correlationId: 'corr-2',
      dryRun: true,
      approved: false
    });

    expect(dryRun.ok).toBe(true);

    db.close();
  });

  it('loads catalog overrides and blocks disallowed command payloads', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-catalog-'));
    const skillsDir = path.join(temp, 'skills', 'cataloged');
    fs.mkdirSync(skillsDir, { recursive: true });

    fs.writeFileSync(
      path.join(skillsDir, 'SKILL.md'),
      [
        '---',
        'id: cataloged',
        'name: cataloged',
        'version: 1.0.0',
        'description: cataloged skill',
        'entry: index.js',
        'enabled: true',
        'requiresApproval: false',
        'supportsDryRun: true',
        'scopes:',
        '  filesystem: read',
        '  process: exec',
        '  network: none',
        '  secrets: none',
        '---',
        '# cataloged'
      ].join('\n')
    );

    fs.writeFileSync(
      path.join(skillsDir, 'index.js'),
      "process.stdout.write(JSON.stringify({ ok: true, message: 'cataloged' }));"
    );

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    const registry = new SkillRegistry(db, {
      directories: ['skills'],
      catalogStrict: true,
      sandboxDefault: true,
      workingDirectory: temp
    });

    await registry.upsertCatalogEntry({
      entry: {
        path: path.join(temp, 'skills', 'cataloged'),
        allowedCommands: ['node'],
        requiredTools: ['node']
      }
    });

    const loaded = await registry.load();
    expect(loaded.length).toBe(1);

    await expect(
      registry.invoke({
        name: 'cataloged',
        payload: { command: 'python' },
        actor: 'test',
        correlationId: 'corr-3',
        dryRun: true,
        approved: false
      })
    ).rejects.toThrow('not allowed');

    const response = await registry.invoke({
      name: 'cataloged',
      payload: { command: 'node' },
      actor: 'test',
      correlationId: 'corr-4',
      dryRun: true,
      approved: false
    });

    expect(response.ok).toBe(true);
    db.close();
  });

  it('loads and invokes markdown skills from SKILL.md frontmatter', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-markdown-'));
    const markdownSkillDir = path.join(temp, 'skills', 'graph-router');
    fs.mkdirSync(markdownSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(markdownSkillDir, 'SKILL.md'),
      [
        '---',
        'name: graph-router',
        'description: Route requests across a skill graph',
        'allowedCommands:',
        '  - graph-router',
        'requiredTools:',
        '  - definitely-missing-tool',
        'tags:',
        '  - routing',
        '  - graph',
        '---',
        '# Graph Router',
        '',
        'Follow links and load only relevant nodes.',
        '',
        '1. Read index first',
        '2. Traverse matching wikilinks'
      ].join('\n')
    );

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    const registry = new SkillRegistry(db, {
      directories: ['skills'],
      sandboxDefault: true,
      workingDirectory: temp
    });

    const loaded = await registry.load();
    expect(loaded.some((skill) => skill.name === 'graph-router')).toBe(true);

    const invoked = await registry.invoke({
      name: 'graph-router',
      payload: {
        task: 'Route this compliance request safely',
        command: 'search'
      },
      actor: 'tester',
      correlationId: 'corr-md-1',
      dryRun: false,
      approved: false
    });

    expect(invoked.ok).toBe(true);
    expect(invoked.output).toContain('Graph Router');
    expect(invoked.output).toContain('Route this compliance request safely');
    expect(invoked.output).toContain('Tooling note: missing definitely-missing-tool');
    expect(invoked.structured).toBeTruthy();
    expect(invoked.structured?.kind).toBe('markdown_skill');
    expect(invoked.structured?.missingTools).toEqual(['definitely-missing-tool']);
    expect(invoked.structured?.allowedCommands).toEqual(['graph-router']);
    expect(invoked.structured?.requiredTools).toEqual(['definitely-missing-tool']);

    db.close();
  });

  it('maps legacy allowed-tools frontmatter into callable command metadata', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-legacy-tools-'));
    const markdownSkillDir = path.join(temp, 'skills', 'browser-helper');
    fs.mkdirSync(markdownSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(markdownSkillDir, 'SKILL.md'),
      [
        '---',
        'name: browser-helper',
        'description: Browser helper imported from an upstream skills ecosystem',
        'allowed-tools:',
        '  - Bash(browser-use:*)',
        '  - Bash(agent-browser:open)',
        '---',
        '# Browser Helper',
        '',
        'Use browser automation when available.'
      ].join('\n')
    );

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    const registry = new SkillRegistry(db, {
      directories: ['skills'],
      sandboxDefault: true,
      workingDirectory: temp
    });

    const loaded = await registry.load();
    const manifest = loaded.find((skill) => skill.name === 'browser-helper');
    expect(manifest).toBeTruthy();
    expect(manifest?.allowedCommands).toEqual(['browser-use', 'agent-browser']);
    expect(manifest?.requiredTools).toEqual(['browser-use', 'agent-browser']);

    db.close();
  });

  it('installs, resyncs, and removes external skills with installer policy checks', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-installer-'));
    fs.mkdirSync(path.join(temp, 'skills'), { recursive: true });
    const installRoot = path.join(temp, '.ops', 'skills');
    fs.mkdirSync(installRoot, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    const registry = new SkillRegistry(db, {
      directories: ['skills', '.ops/skills'],
      catalogStrict: false,
      sandboxDefault: true,
      workingDirectory: temp,
      installer: {
        enabled: true,
        allowedSources: ['vercel-labs/*'],
        blockedSources: ['evil/*'],
        requireApproval: true,
        timeoutMs: 20_000,
        maxAttempts: 1,
        installRoot: '.ops/skills'
      },
      runner: async () => {
        const installedSkillPath = path.join(installRoot, 'vercel-labs-agent-skills', 'external-check');
        fs.mkdirSync(installedSkillPath, { recursive: true });
        fs.writeFileSync(
          path.join(installedSkillPath, 'SKILL.md'),
          [
            '---',
            'id: external-check',
            'name: external-check',
            'version: 1.0.0',
            'description: externally installed',
            'entry: index.js',
            'enabled: true',
            'requiresApproval: false',
            'supportsDryRun: true',
            'scopes:',
            '  filesystem: read',
            '  process: none',
            '  network: none',
            '  secrets: none',
            '---',
            '# external-check'
          ].join('\n')
        );
        fs.writeFileSync(path.join(installedSkillPath, 'index.js'), "process.stdout.write('ok');");
        return {
          exitCode: 0,
          stdout: 'installed',
          stderr: ''
        };
      }
    });

    await registry.load();

    await expect(
      registry.installExternal({
        source: 'evil/repo',
        actor: 'tester',
        approved: true
      })
    ).rejects.toThrow(/blocked by policy/i);

    const installed = await registry.installExternal({
      source: 'vercel-labs/agent-skills',
      actor: 'tester',
      approved: true
    });
    expect(installed.installedSkills.some((skill) => skill.name === 'external-check')).toBe(true);
    expect(registry.get('external-check')).toBeTruthy();

    const resynced = await registry.resyncExternalCatalog();
    expect(resynced.some((skill) => skill.name === 'external-check')).toBe(true);

    const removed = await registry.removeExternal({
      skillName: 'external-check'
    });
    expect(removed.removedSkillName).toBe('external-check');
    expect(registry.get('external-check')).toBeUndefined();

    db.close();
  });

  it('discovers externally installed SKILL.md nodes during install/resync/remove flows', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-installer-markdown-'));
    fs.mkdirSync(path.join(temp, 'skills'), { recursive: true });
    const installRoot = path.join(temp, '.ops', 'skills');
    fs.mkdirSync(installRoot, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    const registry = new SkillRegistry(db, {
      directories: ['skills', '.ops/skills'],
      catalogStrict: false,
      sandboxDefault: true,
      workingDirectory: temp,
      installer: {
        enabled: true,
        allowedSources: ['vercel-labs/*'],
        blockedSources: [],
        requireApproval: false,
        timeoutMs: 20_000,
        maxAttempts: 1,
        installRoot: '.ops/skills'
      },
      runner: async () => {
        const installedSkillPath = path.join(installRoot, 'vercel-labs-agent-skills', 'skill-graph-router');
        fs.mkdirSync(installedSkillPath, { recursive: true });
        fs.writeFileSync(
          path.join(installedSkillPath, 'SKILL.md'),
          [
            '---',
            'name: skill-graph-router',
            'description: markdown-based external skill',
            '---',
            '# Skill Graph Router',
            '',
            'Use frontmatter and wikilinks to route tasks.'
          ].join('\n')
        );
        return {
          exitCode: 0,
          stdout: 'installed markdown',
          stderr: ''
        };
      }
    });

    await registry.load();

    const installed = await registry.installExternal({
      source: 'vercel-labs/agent-skills',
      actor: 'tester',
      approved: true
    });
    expect(installed.installedSkills.some((skill) => skill.name === 'skill-graph-router')).toBe(true);

    const invoked = await registry.invoke({
      name: 'skill-graph-router',
      payload: { query: 'Need docs traversal strategy' },
      actor: 'tester',
      correlationId: 'corr-md-2',
      dryRun: false,
      approved: false
    });
    expect(invoked.ok).toBe(true);
    expect(invoked.output).toContain('Skill Graph Router');

    const resynced = await registry.resyncExternalCatalog();
    expect(resynced.some((skill) => skill.name === 'skill-graph-router')).toBe(true);

    const removed = await registry.removeExternal({
      skillName: 'skill-graph-router'
    });
    expect(removed.removedSkillName).toBe('skill-graph-router');
    expect(registry.get('skill-graph-router')).toBeUndefined();

    db.close();
  });

  it('parses skills.sh URLs and forwards selected skills to the CLI installer', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-installer-skills-sh-'));
    fs.mkdirSync(path.join(temp, 'skills'), { recursive: true });
    const installRoot = path.join(temp, '.ops', 'skills');
    fs.mkdirSync(installRoot, { recursive: true });

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();
    const observedArgs: string[][] = [];

    const registry = new SkillRegistry(db, {
      directories: ['skills', '.ops/skills'],
      catalogStrict: false,
      sandboxDefault: true,
      workingDirectory: temp,
      installer: {
        enabled: true,
        allowedSources: ['vercel-labs/*'],
        blockedSources: [],
        requireApproval: false,
        timeoutMs: 20_000,
        maxAttempts: 1,
        installRoot: '.ops/skills'
      },
      runner: async (input) => {
        observedArgs.push(input.args);
        const installedSkillPath = path.join(installRoot, 'vercel-labs-agent-skills', 'vercel-react-best-practices');
        fs.mkdirSync(installedSkillPath, { recursive: true });
        fs.writeFileSync(
          path.join(installedSkillPath, 'SKILL.md'),
          [
            '---',
            'name: vercel-react-best-practices',
            'description: vercel react guide',
            '---',
            '# Vercel React Best Practices'
          ].join('\n')
        );
        return {
          exitCode: 0,
          stdout: 'installed',
          stderr: ''
        };
      }
    });

    const fromSkillsDotSh = registry.resolveInstallTarget(
      'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices'
    );
    expect(fromSkillsDotSh?.source.canonical).toBe('vercel-labs/agent-skills');
    expect(fromSkillsDotSh?.selectedSkills).toEqual(['vercel-react-best-practices']);

    const fromCommand = registry.resolveInstallTarget(
      'npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices'
    );
    expect(fromCommand?.source.canonical).toBe('vercel-labs/agent-skills');
    expect(fromCommand?.selectedSkills).toEqual(['vercel-react-best-practices']);

    await registry.load();
    await registry.installExternal({
      source: 'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices',
      selectedSkills: ['tanstack-query-best-practices'],
      actor: 'tester',
      approved: true
    });

    expect(observedArgs[0]).toEqual([
      'skills',
      'add',
      'vercel-labs/agent-skills',
      '--skill',
      'vercel-react-best-practices',
      '--skill',
      'tanstack-query-best-practices'
    ]);

    db.close();
  });

  it('expands ~/ paths for global skill discovery', async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-home-'));
    const globalSkillDir = path.join(tempHome, '.agents', 'skills', 'global-router');
    fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalSkillDir, 'SKILL.md'),
      [
        '---',
        'name: global-router',
        'description: globally installed skill',
        '---',
        '# Global Router',
        '',
        'Route from globally installed skills.'
      ].join('\n')
    );

    const previousHome = process.env.HOME;
    process.env.HOME = tempHome;

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-global-discovery-'));
    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    try {
      const registry = new SkillRegistry(db, {
        directories: ['~/.agents/skills'],
        sandboxDefault: true,
        workingDirectory: temp
      });

      const loaded = await registry.load();
      expect(loaded.some((skill) => skill.name === 'global-router')).toBe(true);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      db.close();
    }
  });

  it('supports catalog entry upsert/list/remove without manual file edits', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-catalog-entry-'));
    fs.mkdirSync(path.join(temp, 'skills'), { recursive: true });
    const externalSkillDir = path.join(temp, 'external', 'catalog-added');
    fs.mkdirSync(externalSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(externalSkillDir, 'SKILL.md'),
      [
        '---',
        'name: catalog-added',
        'description: loaded from catalog entry api',
        '---',
        '# Catalog Added',
        '',
        'Catalog managed entry skill.'
      ].join('\n')
    );

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    const registry = new SkillRegistry(db, {
      directories: ['skills'],
      catalogStrict: false,
      sandboxDefault: true,
      workingDirectory: temp
    });

    await registry.load();
    expect(registry.get('catalog-added')).toBeUndefined();

    const entries = await registry.upsertCatalogEntry({
      entry: {
        path: externalSkillDir
      }
    });
    expect(entries.some((entry) => entry.path.includes('external'))).toBe(true);

    const listed = await registry.listCatalogEntries();
    expect(listed.length).toBeGreaterThanOrEqual(1);

    await registry.load();
    expect(registry.get('catalog-added')).toBeTruthy();

    const removed = await registry.removeCatalogEntry({
      path: externalSkillDir
    });
    expect(removed.removed).toBe(true);

    await registry.load();
    expect(registry.get('catalog-added')).toBeUndefined();

    db.close();
  });

  it('autodiscovers SKILL.md nodes from workspace roots and makes them invokable', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-skill-autodiscover-'));
    const workspaceRoot = path.join(temp, 'workspaces', 'session-1', 'polybot-clone', 'skills', 'router');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, 'SKILL.md'),
      [
        '---',
        'name: workspace-router',
        'description: discovered from workspace clone',
        '---',
        '# Workspace Router',
        '',
        'Discovered from cloned repository.'
      ].join('\n')
    );

    const db = new ControlPlaneDatabase(path.join(temp, 'state.db'));
    db.migrate();

    const registry = new SkillRegistry(db, {
      directories: ['skills'],
      catalogStrict: true,
      sandboxDefault: true,
      workingDirectory: temp
    });

    await registry.load();
    expect(registry.get('workspace-router')).toBeUndefined();

    const discovery = await registry.autodiscover({
      roots: [path.join(temp, 'workspaces')],
      depth: 8
    });
    expect(discovery.addedEntries).toBeGreaterThanOrEqual(1);

    await registry.load();
    const skill = registry.get('workspace-router');
    expect(skill).toBeTruthy();

    const output = await registry.invoke({
      name: 'workspace-router',
      payload: { task: 'route me' },
      actor: 'test',
      correlationId: 'corr-autodiscover-1'
    });
    expect(output.ok).toBe(true);
    expect(output.output).toContain('Workspace Router');

    db.close();
  });
});
