import { describe, expect, it } from 'vitest';

import {
  normalizeMarkdownEscapedIdentifiers,
  sanitizeBacklogReceiptSummary,
  sanitizeRuntimeSummary
} from '../../src/server.js';

describe('telegram runtime summary sanitization', () => {
  it('does not collapse mixed prose + fenced JSON into a bare markdown fence', () => {
    const summary = [
      'I am initiating the browser-stream-check operation locally in this run.',
      '',
      '```json',
      '{',
      '  "schema": "ops.intake-decision.v1",',
      '  "action": "direct_execute",',
      '  "backlog": {"required": false}',
      '}',
      '```'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized.trim()).not.toBe('```');
    expect(sanitized).toContain('browser-stream-check');
  });

  it('never returns a lone markdown fence for fenced-only JSON payloads', () => {
    const summary = ['```json', '{', '  "schema": "ops.intake-decision.v1"', '}', '```'].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized.trim()).not.toBe('```');
  });

  it('prefers leading human prose over trailing JSON scalar lines', () => {
    const summary = [
      'I am executing the ping command directly for you now.',
      '',
      '```json',
      '{',
      '  "schema": "ops.execution-contract.v1",',
      '  "tasks": [',
      '    {',
      '      "action": "execute_command",',
      '      "commandPlan": {',
      '        "argv": [',
      '          "ping",',
      '          "-c",',
      '          "4",',
      '          "8.8.8.8"',
      '        ]',
      '      }',
      '    }',
      '  ]',
      '}',
      '```'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I am executing the ping command directly for you now.');
    expect(sanitized).not.toContain('8.8.8.8');
  });

  it('drops runtime credential noise prefixes before returning summary prose', () => {
    const summary = [
      'Loaded cached credentials.',
      'Skill "skill-creator" from "/tmp/skill" is overriding the built-in skill.',
      'I will create a simple HTML "Hello World" file in the current directory.',
      '',
      '```json',
      '{',
      '  "schema": "ops.execution-contract.v1"',
      '}',
      '```'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I will create a simple HTML "Hello World" file in the current directory.');
  });

  it('keeps concise ping command summary instead of raw command output lines', () => {
    const summary = [
      'I executed ping successfully and received replies from 8.8.8.8.',
      'PING 8.8.8.8 (8.8.8.8): 56 data bytes',
      '64 bytes from 8.8.8.8: icmp_seq=0 ttl=115 time=7.527 ms',
      '',
      '```json',
      '{',
      '  "schema": "ops.execution-contract.v1"',
      '}',
      '```'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I executed ping successfully and received replies from 8.8.8.8.');
    expect(sanitized).not.toContain('icmp_seq=0');
  });

  it('drops git credential prompt lines when a better summary exists', () => {
    const summary = [
      "Username for 'https://github.com':",
      "Password for 'https://github.com':",
      "I could not push because git credentials are missing.",
      '',
      '```json',
      '{',
      '  "schema": "ops.execution-contract.v1"',
      '}',
      '```'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I could not push because git credentials are missing.');
    expect(sanitized).not.toContain("Username for 'https://github.com':");
  });

  it('prefers human summary over curl JSON payload output', () => {
    const summary = ['I fetched the API health endpoint successfully.', '{"ok":true,"uptime":12345}'].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I fetched the API health endpoint successfully.');
    expect(sanitized).not.toContain('"ok":true');
  });

  it('drops shell bootstrap one-liners when a concise human summary exists', () => {
    const summary = [
      "if command -v browser-stream-check >/dev/null 2>&1; then browser-stream-check; elif [ -f package.json ] && grep -q '\\\"browser-stream-check\\\"' package.json; then npm run browser-stream-check; else echo 'Error: browser-stream-check not found as a system command or npm script. Searching workspace...'; find . -maxdepth 3 -name '*browser-stream-check*' -type f; exit 1; fi",
      'I ran browser-stream-check directly and it succeeded.',
      '',
      '```json',
      '{',
      '  "schema": "ops.execution-contract.v1"',
      '}',
      '```'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I ran browser-stream-check directly and it succeeded.');
    expect(sanitized).not.toContain('if command -v browser-stream-check');
  });

  it('drops SSH host verification prompt noise when a human summary exists', () => {
    const summary = [
      "The authenticity of host 'github.com (140.82.121.3)' can't be established.",
      'Are you sure you want to continue connecting (yes/no/[fingerprint])?',
      'SSH host verification is blocking this command until the host key is trusted.',
      '',
      '```json',
      '{',
      '  "schema": "ops.execution-contract.v1"',
      '}',
      '```'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('SSH host verification is blocking this command until the host key is trusted.');
    expect(sanitized).not.toContain('authenticity of host');
  });

  it('drops XML-like execution-context tags when a human summary exists', () => {
    const summary = [
      '<execution_context>',
      'I completed the command and verified the output.',
      '</execution_context>',
      '```json',
      '{',
      '  "schema": "ops.execution-contract.v1"',
      '}',
      '```'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I completed the command and verified the output.');
    expect(sanitized).not.toContain('<execution_context>');
  });

  it('drops cached-credentials noise even without structured JSON markers', () => {
    const summary = ['Loaded cached credentials.', 'I completed the runtime switch successfully.'].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I completed the runtime switch successfully.');
  });

  it('drops gemini skill-conflict noise when a verified summary follows it', () => {
    const summary = [
      'Skill conflict detected: "react-doctor" from "/tmp/a" is overriding the same skill from "/tmp/b".',
      'Verified browser capture for minilanoy: Following 514, Followers 3699, Likes 114.8K.'
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('Verified browser capture for minilanoy: Following 514, Followers 3699, Likes 114.8K.');
  });

  it('extracts the assistant result from transcript blobs with trailing internal tool noise', () => {
    const summary = [
      'P4R4DiSi4C:Start Polybot!P4SSISTANT:Polybot has been successfully started. All expected processes, including `dashboard`, `mt5_execution`, `mt5_ingest`, `mt5_llm_arbiter`, `mt5_prefilter`, `mt5_risk_manager`, and `mt5_signal_bundle`, are reported as running.Loaded cached credentials.',
      'Skill "skill-creator" from "/Users/test/.agents/skills/skill-creator/SKILL.md" is overriding the built-in skill.',
      'I will read the Polybot skill documentation to determine the correct command for starting the service.',
      'Error executing tool read_file: Path not in workspace: Attempted path "/Users/test/.agents/skills/polybot/SKILL.md" resolves outside the allowed workspace directories.',
      'I will use the `generalist` agent to start Polybot, as it has access to all tools and is suited for running commands.',
      "[LocalAgentExecutor] Skipping subagent tool 'codebase_investigator' for agent 'generalist' to prevent recursion.",
      "[LocalAgentExecutor] Blocked call: Unauthorized tool call: 'activate_skill' is not available to this agent."
    ].join('');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe(
      'Polybot has been successfully started. All expected processes, including `dashboard`, `mt5_execution`, `mt5_ingest`, `mt5_llm_arbiter`, `mt5_prefilter`, `mt5_risk_manager`, and `mt5_signal_bundle`, are reported as running.'
    );
    expect(sanitized).not.toContain('Loaded cached credentials');
    expect(sanitized).not.toContain('LocalAgentExecutor');
  });

  it('returns a generic failure when summary only contains blocked internal tool chatter', () => {
    const summary = [
      'Error executing tool read_file: Path not in workspace: Attempted path "/Users/test/.agents/skills/polybot/SKILL.md" resolves outside the allowed workspace directories.',
      'I will use the `generalist` agent to start Polybot, as it has access to all tools and is suited for running commands.',
      "[LocalAgentExecutor] Skipping subagent tool 'codebase_investigator' for agent 'generalist' to prevent recursion.",
      "[LocalAgentExecutor] Blocked call: Unauthorized tool call: 'run_shell_command' is not available to this agent."
    ].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('Run failed before a verified tool result was produced.');
  });

  it('returns a generic completion message when summary is noise-only', () => {
    const summary = 'Loaded cached credentials.';

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('Run completed.');
  });

  it('returns a generic completion message for a standalone markdown fence', () => {
    const summary = '```';

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('Run completed.');
  });

  it('unquotes scalar JSON string summaries', () => {
    const summary = '"I created the hello world file."';

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('I created the hello world file.');
  });

  it('drops quoted shell bootstrap scalar noise', () => {
    const summary =
      '"if command -v browser-stream-check >/dev/null 2>&1; then browser-stream-check; elif [ -f package.json ] && grep -q \\"browser-stream-check\\" package.json; then npm run browser-stream-check; else echo \\"Error\\"; fi"';

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('Run completed.');
  });

  it('preserves plain multiline summaries when no noise is present', () => {
    const summary = ['Step 1 completed.', 'Step 2 completed.'].join('\n');

    const sanitized = sanitizeRuntimeSummary(summary);
    expect(sanitized).toBe('Step 1 completed.\nStep 2 completed.');
  });
});

describe('markdown escaped identifier normalization', () => {
  it('removes accidental markdown escapes from isolated identifier-like tokens', () => {
    const summary = String.raw`Polybot started successfully. Running: mt5\_execution, mt5\_ingest, mt5\_llm\_arbiter.`;

    expect(normalizeMarkdownEscapedIdentifiers(summary)).toBe(
      'Polybot started successfully. Running: mt5_execution, mt5_ingest, mt5_llm_arbiter.'
    );
  });

  it('preserves path-like and regex-like backslashes', () => {
    const summary = String.raw`Keep C:\temp\_cache and /foo\_bar/ exactly as written.`;

    expect(normalizeMarkdownEscapedIdentifiers(summary)).toBe(summary);
  });
});

describe('backlog receipt summary sanitization', () => {
  it('extracts concise non-progress summary from verbose worker journaling', () => {
    const summary = [
      'I am going to locate the workspace contents first, then check .agents/PRD.md and .agents/PLAN.md.',
      'I found the ugothere.ai repo already present.',
      'Plan to finish this wave end-to-end:',
      '1. Run dependency validator',
      '2. Run typecheck/lint/build',
      'Dependency DAG validation passed.',
      'Typecheck passed.',
      'Build completed successfully.',
      'Repository status: ugothere.ai was already present in the workspace, so no clone step was needed.'
    ].join('\n');

    const sanitized = sanitizeBacklogReceiptSummary(summary);
    expect(sanitized).toBe(
      'Repository status: ugothere.ai was already present in the workspace, so no clone step was needed.'
    );
  });

  it('falls back to generic completion message for noise-only backlog summaries', () => {
    const summary = 'Loaded cached credentials.';
    const sanitized = sanitizeBacklogReceiptSummary(summary);
    expect(sanitized).toBe('Run completed.');
  });

  it('keeps concise clean summaries unchanged', () => {
    const summary = 'Support page implemented and build passed.';
    const sanitized = sanitizeBacklogReceiptSummary(summary);
    expect(sanitized).toBe('Support page implemented and build passed.');
  });

  it('drops deferred JSON command-plan summaries instead of echoing fake execution', () => {
    const summary = [
      'I need to gather evidence for the `/contact` route implementation.',
      '```json',
      '[{"name":"node","arguments":{"args":["-e","console.log(\\"run build\\")"]}}]',
      '```',
      'I will execute the verification once the command plan is approved.'
    ].join('\n');

    const sanitized = sanitizeBacklogReceiptSummary(summary);
    expect(sanitized).toBe('');
  });
});
