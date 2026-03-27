import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDefaultAdapters, defaultRuntimeCapabilities, RuntimeManager } from '../../src/index.ts';
import type { RuntimeAdapter } from '../../src/types.ts';

describe('runtime manager', () => {
  it('maps waiting-input transitions from adapter response', async () => {
    const manager = new RuntimeManager({
      defaultRuntime: 'codex',
      adapters: createDefaultAdapters({
        codex: { command: '', args: [] },
        claude: { command: '', args: [] },
        gemini: { command: '', args: [] },
        process: { command: '', args: [] }
      })
    });

    const response = await manager.execute({
      runtime: 'codex',
      runId: 'run-1',
      sessionId: 'session-1',
      prompt: 'please approve this operation',
      workspacePath: process.cwd()
    });

    expect(response.finalStatus).toEqual('waiting_input');
    expect(response.waitingPrompt).toBeTruthy();
  });

  it('supports send and heartbeat contracts for active runtimes', async () => {
    const manager = new RuntimeManager({
      defaultRuntime: 'codex',
      adapters: createDefaultAdapters({
        codex: { command: '', args: [] },
        claude: { command: '', args: [] },
        gemini: { command: '', args: [] },
        process: { command: '', args: [] }
      })
    });

    const sendResult = await manager.send({
      runtime: 'codex',
      runId: 'run-send-1',
      sessionId: 'session-send-1',
      prompt: 'continue with implementation',
      workspacePath: process.cwd()
    });
    expect(sendResult.finalStatus).toBe('completed');

    const heartbeat = await manager.heartbeat('missing-run', 'codex');
    expect(heartbeat).toBe('unknown');
  });

  it('maps adapter responses through one shared execution-result path', async () => {
    const calls: string[] = [];
    const adapter: RuntimeAdapter = {
      kind: 'codex',
      async launch() {
        calls.push('launch');
        return {
          status: 'waiting_input',
          summary: 'launch summary',
          waitingPrompt: 'Need approval',
          raw: 'launch raw',
          toolSessionMode: 'native_tool_session',
          toolEvents: [{ type: 'tool_call', toolName: 'polyx', native: true }],
          toolSessionHandle: {
            schema: 'ops.native-tool-session-handle.v1',
            id: 'handle-1',
            runtime: 'codex',
            provider: null,
            model: null,
            transport: 'none',
            resumable: true,
            version: 1,
            createdAt: '2026-03-15T10:00:00.000Z',
            updatedAt: '2026-03-15T10:00:00.000Z',
            toolSessionMode: 'native_tool_session',
            eventCount: 1
          }
        };
      },
      async send() {
        calls.push('send');
        return {
          status: 'completed',
          summary: 'send summary',
          raw: 'send raw',
          usage: {
            totalTokens: 9
          }
        };
      },
      async abort() {
        calls.push('abort');
      },
      async heartbeat() {
        return 'running';
      },
      async resume() {
        calls.push('resume');
        return {
          status: 'completed',
          summary: 'resume summary',
          providerApiCalls: [
            {
              provider: 'google',
              model: 'gemini-2.5-pro',
              status: 'completed'
            }
          ]
        };
      }
    };

    const manager = new RuntimeManager({
      defaultRuntime: 'codex',
      adapters: {
        codex: adapter,
        claude: adapter,
        gemini: adapter,
        process: adapter
      }
    });

    await expect(
      manager.execute({
        runtime: 'codex',
        runId: 'run-shared-launch',
        sessionId: 'session-shared-launch',
        prompt: 'launch',
        workspacePath: process.cwd()
      })
    ).resolves.toMatchObject({
      finalStatus: 'waiting_input',
      waitingPrompt: 'Need approval',
      raw: 'launch raw',
      toolSessionMode: 'native_tool_session'
    });

    await expect(
      manager.send({
        runtime: 'codex',
        runId: 'run-shared-send',
        sessionId: 'session-shared-send',
        prompt: 'send',
        workspacePath: process.cwd()
      })
    ).resolves.toMatchObject({
      finalStatus: 'completed',
      summary: 'send summary',
      usage: {
        totalTokens: 9
      }
    });

    await expect(
      manager.resume({
        runtime: 'codex',
        runId: 'run-shared-resume',
        sessionId: 'session-shared-resume',
        prompt: 'resume',
        workspacePath: process.cwd()
      })
    ).resolves.toMatchObject({
      finalStatus: 'completed',
      summary: 'resume summary',
      providerApiCalls: [
        expect.objectContaining({
          provider: 'google'
        })
      ]
    });

    expect(calls).toEqual(['launch', 'send', 'resume']);
  });

  it('keeps codex runtime on CLI even when provider/model metadata is present', async () => {
    const manager = new RuntimeManager({
      defaultRuntime: 'codex',
      adapters: createDefaultAdapters({
        codex: {
          command: 'node',
          args: [
            '-e',
            'let b="";process.stdin.on("data",c=>b+=c);process.stdin.on("end",()=>process.stdout.write(`CLI_OK:${b.trim()}`));'
          ]
        },
        claude: { command: '', args: [] },
        gemini: { command: '', args: [] },
        process: { command: '', args: [] }
      })
    });

    const response = await manager.execute({
      runtime: 'codex',
      runId: 'run-cli-provider-hint',
      sessionId: 'session-cli-provider-hint',
      prompt: 'implement support page',
      workspacePath: process.cwd(),
      metadata: {
        provider: 'google'
      }
    });

    expect(response.finalStatus).toBe('completed');
    expect(response.summary).toContain('CLI_OK:implement support page');
  });

  it('fails closed for process runtime when no provider route or explicit local fallback is supplied', async () => {
    const manager = new RuntimeManager({
      defaultRuntime: 'process',
      adapters: createDefaultAdapters({
        codex: { command: '', args: [] },
        claude: { command: '', args: [] },
        gemini: { command: '', args: [] },
        process: { command: 'node', args: ['-e', 'process.stdout.write("should-not-run");'] }
      })
    });

    const response = await manager.execute({
      runtime: 'process',
      runId: 'run-process-fail-closed',
      sessionId: 'session-process-fail-closed',
      prompt: 'start polybot',
      workspacePath: process.cwd()
    });

    expect(response.finalStatus).toBe('failed');
    expect(response.error).toContain('requires a provider-backed model route');
    expect(response.summary).toBeUndefined();
  });

  it('allows explicit local process fallback when the gateway marks the route as local', async () => {
    const manager = new RuntimeManager({
      defaultRuntime: 'process',
      adapters: createDefaultAdapters({
        codex: { command: '', args: [] },
        claude: { command: '', args: [] },
        gemini: { command: '', args: [] },
        process: {
          command: 'node',
          args: [
            '-e',
            'let b="";process.stdin.on("data",c=>b+=c);process.stdin.on("end",()=>process.stdout.write(`LOCAL_OK:${b.trim()}`));'
          ]
        }
      })
    });

    const response = await manager.execute({
      runtime: 'process',
      runId: 'run-process-local-fallback',
      sessionId: 'session-process-local-fallback',
      prompt: 'polybot status',
      workspacePath: process.cwd(),
      metadata: {
        processCommandFallbackAllowed: true
      }
    });

    expect(response.finalStatus).toBe('completed');
    expect(response.summary).toContain('LOCAL_OK:polybot status');
  });

  it('surfaces local process launch failures instead of falling back to mock completion', async () => {
    const manager = new RuntimeManager({
      defaultRuntime: 'process',
      adapters: createDefaultAdapters({
        codex: { command: '', args: [] },
        claude: { command: '', args: [] },
        gemini: { command: '', args: [] },
        process: { command: '__ops_missing_process_binary__', args: [] }
      })
    });

    const response = await manager.execute({
      runtime: 'process',
      runId: 'run-process-launch-failure',
      sessionId: 'session-process-launch-failure',
      prompt: 'polyx search xauusd',
      workspacePath: process.cwd(),
      metadata: {
        processCommandFallbackAllowed: true
      }
    });

    expect(response.finalStatus).toBe('failed');
    expect(response.error).toContain('local executor failed to launch');
    expect(response.summary).toBeUndefined();
  });

  it('resolves relative process adapter script args from the runtime adapter base dir instead of the session workspace', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-runtime-relative-adapter-'));
    const adapterDir = path.join(tempRoot, 'scripts', 'runtime');
    const adapterScript = path.join(adapterDir, 'echo-process.mjs');
    const isolatedWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-runtime-relative-workspace-'));
    fs.mkdirSync(adapterDir, { recursive: true });
    fs.writeFileSync(
      adapterScript,
      [
        'let input = "";',
        'process.stdin.on("data", (chunk) => (input += chunk));',
        'process.stdin.on("end", () => process.stdout.write(`RELATIVE_OK:${input.trim()}`));'
      ].join('\n'),
      'utf8'
    );

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'process',
        adapters: createDefaultAdapters({
          codex: { command: '', args: [] },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: 'node', args: ['scripts/runtime/echo-process.mjs'] }
        })
      });

      const response = await manager.execute({
        runtime: 'process',
        runId: 'run-process-relative-adapter',
        sessionId: 'session-process-relative-adapter',
        prompt: 'python3 -c "print(123)"',
        workspacePath: isolatedWorkspace,
        metadata: {
          processCommandFallbackAllowed: true,
          runtimeAdapterBaseDir: tempRoot
        }
      });

      expect(response.finalStatus).toBe('completed');
      expect(response.summary).toContain('RELATIVE_OK:python3 -c "print(123)"');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.rmSync(isolatedWorkspace, { recursive: true, force: true });
    }
  });

  it('injects non-interactive git env and GitHub token aliases for runtime commands', async () => {
    const originalGithubToken = process.env.GITHUB_TOKEN;
    const originalGhToken = process.env.GH_TOKEN;
    const originalOpsGithubPat = process.env.OPS_GITHUB_PAT;
    const originalGitDir = process.env.GIT_DIR;
    const originalGitConfigCount = process.env.GIT_CONFIG_COUNT;
    process.env.OPS_GITHUB_PAT = 'runtime-token-123';
    process.env.GIT_DIR = '/tmp/root-repo.git';
    process.env.GIT_CONFIG_COUNT = '99';

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'codex',
        adapters: createDefaultAdapters({
          codex: {
            command: 'node',
            args: [
              '-e',
              'process.stdout.write(JSON.stringify({gitPrompt:process.env.GIT_TERMINAL_PROMPT||null,gitConfigGlobal:process.env.GIT_CONFIG_GLOBAL||null,gitConfigCount:process.env.GIT_CONFIG_COUNT||null,rewrite:process.env.GIT_CONFIG_VALUE_0||null,helperConfigured:(process.env.GIT_CONFIG_VALUE_2||"").includes("x-access-token"),gitDir:process.env.GIT_DIR||null,githubTokenAlias:Boolean(process.env.GITHUB_TOKEN),ghTokenAlias:Boolean(process.env.GH_TOKEN),opsTokenAlias:Boolean(process.env.OPS_GITHUB_PAT)}));'
            ]
          },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const response = await manager.execute({
        runtime: 'codex',
        runId: 'run-git-env',
        sessionId: 'session-git-env',
        prompt: 'noop',
        workspacePath: process.cwd()
      });
      expect(response.finalStatus).toBe('completed');
      const payload = JSON.parse(String(response.summary ?? '{}')) as Record<string, unknown>;
      expect(payload.gitPrompt).toBe('0');
      expect(payload.gitConfigGlobal).toBe('/dev/null');
      expect(payload.gitConfigCount).toBe('3');
      expect(payload.rewrite).toBe('git@github.com:');
      expect(payload.helperConfigured).toBe(true);
      expect(payload.gitDir).toBeNull();
      expect(payload.githubTokenAlias).toBe(true);
      expect(payload.ghTokenAlias).toBe(true);
      expect(payload.opsTokenAlias).toBe(true);
    } finally {
      if (originalGithubToken === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = originalGithubToken;
      }
      if (originalGhToken === undefined) {
        delete process.env.GH_TOKEN;
      } else {
        process.env.GH_TOKEN = originalGhToken;
      }
      if (originalOpsGithubPat === undefined) {
        delete process.env.OPS_GITHUB_PAT;
      } else {
        process.env.OPS_GITHUB_PAT = originalOpsGithubPat;
      }
      if (originalGitDir === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = originalGitDir;
      }
      if (originalGitConfigCount === undefined) {
        delete process.env.GIT_CONFIG_COUNT;
      } else {
        process.env.GIT_CONFIG_COUNT = originalGitConfigCount;
      }
    }
  });

  it('sanitizes git env for tmux-backed runtime commands', async () => {
    const hasTmux = spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status === 0;
    if (!hasTmux) {
      return;
    }

    const originalGitConfigCount = process.env.GIT_CONFIG_COUNT;
    const originalGitConfigKey2 = process.env.GIT_CONFIG_KEY_2;
    const originalGitConfigValue2 = process.env.GIT_CONFIG_VALUE_2;
    const originalGitConfigValue3 = process.env.GIT_CONFIG_VALUE_3;
    const originalGitDir = process.env.GIT_DIR;
    process.env.GIT_CONFIG_COUNT = '4';
    process.env.GIT_CONFIG_KEY_2 = 'credential.helper';
    process.env.GIT_CONFIG_VALUE_2 = '';
    process.env.GIT_CONFIG_VALUE_3 = 'stale-value';
    process.env.GIT_DIR = '/tmp/root-repo.git';

    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-runtime-tmux-git-env-'));
    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'codex',
        adapters: createDefaultAdapters({
          codex: {
            command: 'bash',
            args: [
              '-lc',
              [
                'git init -q . >/dev/null 2>&1 || true',
                'git status --short >/dev/null',
                `node -e ${JSON.stringify(
                  'process.stdout.write(JSON.stringify({count:process.env.GIT_CONFIG_COUNT||null,value2:process.env.GIT_CONFIG_VALUE_2||null,gitDir:process.env.GIT_DIR||null}))'
                )}`
              ].join('; ')
            ]
          },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const response = await manager.execute({
        runtime: 'codex',
        runId: 'run-tmux-git-env',
        sessionId: 'session-tmux-git-env',
        prompt: 'noop',
        workspacePath,
        terminal: {
          mode: 'tmux',
          maxDurationMs: 20_000
        }
      });

      expect(response.finalStatus).toBe('completed');
      const payload = JSON.parse(String(response.summary ?? '{}')) as Record<string, unknown>;
      expect(payload.count).toBe('3');
      expect(typeof payload.value2).toBe('string');
      expect(String(payload.value2)).toContain('x-access-token');
      expect(payload.gitDir).toBeNull();
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
      if (originalGitConfigCount === undefined) {
        delete process.env.GIT_CONFIG_COUNT;
      } else {
        process.env.GIT_CONFIG_COUNT = originalGitConfigCount;
      }
      if (originalGitConfigKey2 === undefined) {
        delete process.env.GIT_CONFIG_KEY_2;
      } else {
        process.env.GIT_CONFIG_KEY_2 = originalGitConfigKey2;
      }
      if (originalGitConfigValue2 === undefined) {
        delete process.env.GIT_CONFIG_VALUE_2;
      } else {
        process.env.GIT_CONFIG_VALUE_2 = originalGitConfigValue2;
      }
      if (originalGitConfigValue3 === undefined) {
        delete process.env.GIT_CONFIG_VALUE_3;
      } else {
        process.env.GIT_CONFIG_VALUE_3 = originalGitConfigValue3;
      }
      if (originalGitDir === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = originalGitDir;
      }
    }
  });

  it('sanitizes unsupported additionalProperties in Gemini response schema', async () => {
    const originalFetch = globalThis.fetch;
    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    let capturedRequest: Record<string, unknown> | null = null;

    process.env.GOOGLE_API_KEY = 'test-google-key';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedRequest =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : ({} as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"action":"direct","targetAgentIds":[],"reason":"ok"}' }] } }]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'process',
        adapters: createDefaultAdapters({
          codex: { command: '', args: [] },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const response = await manager.execute({
        runtime: 'process',
        runId: 'run-google-schema-sanitize',
        sessionId: 'session-google-schema-sanitize',
        prompt: 'route this task',
        workspacePath: process.cwd(),
        metadata: {
          provider: 'google',
          model: 'gemini-2.5-flash-lite',
          responseFormat: 'json_schema',
          responseJsonSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              assignments: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    itemId: { type: 'string' }
                  },
                  required: ['itemId']
                }
              }
            },
            required: ['assignments']
          }
        }
      });

      expect(response.finalStatus).toBe('completed');
      const generationConfig =
        capturedRequest && typeof capturedRequest.generationConfig === 'object'
          ? (capturedRequest.generationConfig as Record<string, unknown>)
          : null;
      expect(generationConfig).not.toBeNull();
      const schema =
        generationConfig && typeof generationConfig.responseSchema === 'object'
          ? (generationConfig.responseSchema as Record<string, unknown>)
          : null;
      expect(schema).not.toBeNull();
      expect(schema?.additionalProperties).toBeUndefined();
      const assignments =
        schema && typeof schema.properties === 'object'
          ? ((schema.properties as Record<string, unknown>).assignments as Record<string, unknown>)
          : null;
      const items = assignments && typeof assignments.items === 'object' ? (assignments.items as Record<string, unknown>) : null;
      expect(items?.additionalProperties).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalGoogleApiKey === undefined) {
        delete process.env.GOOGLE_API_KEY;
      } else {
        process.env.GOOGLE_API_KEY = originalGoogleApiKey;
      }
    }
  });

  it('captures native OpenRouter tool session calls and exposes normalized tool events', async () => {
    const originalFetch = globalThis.fetch;
    const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
    let capturedRequest: Record<string, unknown> | null = null;

    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedRequest =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : ({} as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-native-tool',
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call_skill_1',
                    function: {
                      name: 'skill_call',
                      arguments: JSON.stringify({
                        skill: 'polyx',
                        payload: {
                          query: 'xauusd'
                        },
                        reason: 'Need the PolyX runbook before deciding CLI args.'
                      })
                    }
                  }
                ]
              }
            }
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 7,
            total_tokens: 19
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'process',
        adapters: createDefaultAdapters({
          codex: { command: '', args: [] },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const response = await manager.execute({
        runtime: 'process',
        runId: 'run-openrouter-native-tool',
        sessionId: 'session-openrouter-native-tool',
        prompt: 'Use polyx for xauusd sentiment.',
        workspacePath: process.cwd(),
        metadata: {
          provider: 'openrouter',
          model: 'openrouter/free',
          nativeSkillCallCatalog: [
            {
              name: 'polyx',
              description: 'X/Twitter intelligence skill'
            }
          ]
        }
      });

      expect(response.finalStatus).toBe('completed');
      expect(response.toolSessionMode).toBe('native_tool_session');
      expect(response.toolEvents).toEqual([
        {
          type: 'tool_call',
          toolName: 'skill_call',
          callId: 'call_skill_1',
          payload: {
            skill: 'polyx',
            payload: {
              query: 'xauusd'
            },
            reason: 'Need the PolyX runbook before deciding CLI args.'
          },
          native: true
        }
      ]);
      expect(response.toolSessionHandle).toMatchObject({
        schema: 'ops.native-tool-session-handle.v1',
        runtime: 'process',
        provider: 'openrouter',
        model: 'openrouter/free',
        transport: 'provider_bridge',
        resumable: true,
        toolSessionMode: 'native_tool_session'
      });
      expect(Array.isArray(capturedRequest?.tools)).toBe(true);
      expect(capturedRequest?.tool_choice).toBe('auto');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalOpenRouterApiKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
      }
    }
  });

  it('captures native OpenRouter execute_command tool calls when direct command tooling is enabled', async () => {
    const originalFetch = globalThis.fetch;
    const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
    let capturedRequest: Record<string, unknown> | null = null;

    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedRequest =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : ({} as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-native-command-tool',
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call_execute_1',
                    function: {
                      name: 'execute_command',
                      arguments: JSON.stringify({
                        command: 'pwd',
                        cwd: process.cwd(),
                        reason: 'Need the current workspace path.'
                      })
                    }
                  }
                ]
              }
            }
          ],
          usage: {
            prompt_tokens: 13,
            completion_tokens: 8,
            total_tokens: 21
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'process',
        adapters: createDefaultAdapters({
          codex: { command: '', args: [] },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const response = await manager.execute({
        runtime: 'process',
        runId: 'run-openrouter-native-command-tool',
        sessionId: 'session-openrouter-native-command-tool',
        prompt: 'Run `pwd` and summarize the result.',
        workspacePath: process.cwd(),
        metadata: {
          provider: 'openrouter',
          model: 'openrouter/free',
          nativeCommandToolEnabled: true
        }
      });

      expect(response.finalStatus).toBe('completed');
      expect(response.toolSessionMode).toBe('native_tool_session');
      expect(response.toolEvents).toEqual([
        {
          type: 'tool_call',
          toolName: 'execute_command',
          callId: 'call_execute_1',
          payload: {
            command: 'pwd',
            cwd: process.cwd(),
            reason: 'Need the current workspace path.'
          },
          native: true
        }
      ]);
      const toolNames = Array.isArray(capturedRequest?.tools)
        ? capturedRequest!.tools
            .map((entry) =>
              typeof entry === 'object' && entry !== null && typeof (entry as { function?: { name?: string } }).function?.name === 'string'
                ? (entry as { function: { name: string } }).function.name
                : null
            )
            .filter((entry): entry is string => entry !== null)
        : [];
      expect(toolNames).toContain('execute_command');
      const executeCommandTool =
        Array.isArray(capturedRequest?.tools) &&
        capturedRequest!.tools.find(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { function?: { name?: string } }).function?.name === 'string' &&
            (entry as { function: { name: string } }).function.name === 'execute_command'
        );
      expect(
        (executeCommandTool as { function?: { parameters?: { properties?: Record<string, unknown> } } } | undefined)?.function
          ?.parameters?.properties
      ).toMatchObject({
        argv: expect.any(Object),
        command: expect.any(Object)
      });
      expect(capturedRequest?.tool_choice).toBe('auto');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalOpenRouterApiKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
      }
    }
  });

  it('captures native Gemini execute_command tool calls when direct command tooling is enabled', async () => {
    const originalFetch = globalThis.fetch;
    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    let capturedRequest: Record<string, unknown> | null = null;

    process.env.GOOGLE_API_KEY = 'test-google-key';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedRequest =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : ({} as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      id: 'gemini-execute-1',
                      name: 'execute_command',
                      args: {
                        command: 'pwd',
                        cwd: process.cwd(),
                        reason: 'Need the current workspace path.'
                      }
                    }
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 13,
            candidatesTokenCount: 8,
            totalTokenCount: 21
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'process',
        adapters: createDefaultAdapters({
          codex: { command: '', args: [] },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const response = await manager.execute({
        runtime: 'process',
        runId: 'run-gemini-native-command-tool',
        sessionId: 'session-gemini-native-command-tool',
        prompt: 'Run `pwd` and summarize the result.',
        workspacePath: process.cwd(),
        metadata: {
          provider: 'google',
          model: 'gemini-2.5-pro',
          nativeCommandToolEnabled: true
        }
      });

      expect(response.finalStatus).toBe('completed');
      expect(response.toolSessionMode).toBe('native_tool_session');
      expect(response.toolEvents).toEqual([
        {
          type: 'tool_call',
          toolName: 'execute_command',
          callId: 'gemini-execute-1',
          payload: {
            command: 'pwd',
            cwd: process.cwd(),
            reason: 'Need the current workspace path.'
          },
          native: true
        }
      ]);
      const tools = Array.isArray(capturedRequest?.tools) ? (capturedRequest!.tools as Array<Record<string, unknown>>) : [];
      const functionDeclarations = Array.isArray(tools[0]?.functionDeclarations)
        ? (tools[0]!.functionDeclarations as Array<Record<string, unknown>>)
        : [];
      const toolNames = functionDeclarations
        .map((entry) => (typeof entry.name === 'string' ? entry.name : null))
        .filter((entry): entry is string => entry !== null);
      expect(toolNames).toContain('execute_command');
      const executeCommandTool = functionDeclarations.find((entry) => entry.name === 'execute_command') ?? null;
      const parameters =
        executeCommandTool && typeof executeCommandTool.parameters === 'object'
          ? (executeCommandTool.parameters as Record<string, unknown>)
          : null;
      expect(parameters).not.toBeNull();
      expect(parameters?.additionalProperties).toBeUndefined();
      const properties =
        parameters && typeof parameters.properties === 'object'
          ? (parameters.properties as Record<string, unknown>)
          : {};
      const commandProperty =
        typeof properties.command === 'object' && properties.command !== null
          ? (properties.command as Record<string, unknown>)
          : null;
      expect(commandProperty?.additionalProperties).toBeUndefined();
      expect(
        (capturedRequest?.toolConfig as { functionCallingConfig?: { mode?: string } } | undefined)?.functionCallingConfig?.mode
      ).toBe('AUTO');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalGoogleApiKey === undefined) {
        delete process.env.GOOGLE_API_KEY;
      } else {
        process.env.GOOGLE_API_KEY = originalGoogleApiKey;
      }
    }
  });

  it('captures native Gemini skill_call tool sessions and strips unsupported schema keywords from tool parameters', async () => {
    const originalFetch = globalThis.fetch;
    const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
    let capturedRequest: Record<string, unknown> | null = null;

    process.env.GOOGLE_API_KEY = 'test-google-key';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedRequest =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : ({} as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      id: 'gemini-skill-1',
                      name: 'skill_call',
                      args: {
                        skill: 'polyx',
                        payload: {
                          query: 'xauusd'
                        },
                        reason: 'Need the skill runbook before choosing the command.'
                      }
                    }
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 14,
            candidatesTokenCount: 9,
            totalTokenCount: 23
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'process',
        adapters: createDefaultAdapters({
          codex: { command: '', args: [] },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const response = await manager.execute({
        runtime: 'process',
        runId: 'run-gemini-native-skill-tool',
        sessionId: 'session-gemini-native-skill-tool',
        prompt: 'Use polyx for xauusd trends.',
        workspacePath: process.cwd(),
        metadata: {
          provider: 'google',
          model: 'gemini-2.5-pro',
          nativeCommandToolEnabled: true,
          nativeSkillCallCatalog: [
            {
              name: 'polyx',
              description: 'X/Twitter intelligence gathering skill.'
            }
          ]
        }
      });

      expect(response.finalStatus).toBe('completed');
      expect(response.toolSessionMode).toBe('native_tool_session');
      expect(response.toolEvents).toEqual([
        {
          type: 'tool_call',
          toolName: 'skill_call',
          callId: 'gemini-skill-1',
          payload: {
            skill: 'polyx',
            payload: {
              query: 'xauusd'
            },
            reason: 'Need the skill runbook before choosing the command.'
          },
          native: true
        }
      ]);
      const tools = Array.isArray(capturedRequest?.tools) ? (capturedRequest!.tools as Array<Record<string, unknown>>) : [];
      const functionDeclarations = Array.isArray(tools[0]?.functionDeclarations)
        ? (tools[0]!.functionDeclarations as Array<Record<string, unknown>>)
        : [];
      const skillCallTool = functionDeclarations.find((entry) => entry.name === 'skill_call') ?? null;
      const parameters =
        skillCallTool && typeof skillCallTool.parameters === 'object'
          ? (skillCallTool.parameters as Record<string, unknown>)
          : null;
      expect(parameters).not.toBeNull();
      expect(parameters?.additionalProperties).toBeUndefined();
      const properties =
        parameters && typeof parameters.properties === 'object'
          ? (parameters.properties as Record<string, unknown>)
          : {};
      const payloadProperty =
        typeof properties.payload === 'object' && properties.payload !== null
          ? (properties.payload as Record<string, unknown>)
          : null;
      expect(payloadProperty?.additionalProperties).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalGoogleApiKey === undefined) {
        delete process.env.GOOGLE_API_KEY;
      } else {
        process.env.GOOGLE_API_KEY = originalGoogleApiKey;
      }
    }
  });

  it('suppresses native OpenRouter direct command tooling when a follow-up answer pass disables tools', async () => {
    const originalFetch = globalThis.fetch;
    const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
    let capturedRequest: Record<string, unknown> | null = null;

    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedRequest =
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : ({} as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-openrouter-followup-answer',
          choices: [
            {
              message: {
                content: 'Polybot is offline. Run `polybot start` to launch it.'
              }
            }
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 8,
            total_tokens: 20
          }
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'process',
        adapters: createDefaultAdapters({
          codex: { command: '', args: [] },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const response = await manager.execute({
        runtime: 'process',
        runId: 'run-openrouter-followup-answer',
        sessionId: 'session-openrouter-followup-answer',
        prompt: 'Answer directly from the verified command output.',
        workspacePath: process.cwd(),
        metadata: {
          provider: 'openrouter',
          model: 'openrouter/free',
          nativeCommandToolEnabled: false,
          nativeSkillCallCatalog: []
        }
      });

      expect(response.finalStatus).toBe('completed');
      expect(response.toolEvents).toBeUndefined();
      expect(response.summary).toContain('Polybot is offline');
      expect(capturedRequest?.tools).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalOpenRouterApiKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
      }
    }
  });

  it('reuses persisted native OpenRouter tool-session handles on resume', async () => {
    const originalFetch = globalThis.fetch;
    const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;

    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: 'chatcmpl-native-tool-resume',
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call_skill_resume_1',
                    function: {
                      name: 'skill_call',
                      arguments: JSON.stringify({
                        skill: 'polybot',
                        payload: {
                          action: 'start'
                        },
                        reason: 'Resume the same operator surface after pause.'
                      })
                    }
                  }
                ]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )) as typeof fetch;

    try {
      const manager = new RuntimeManager({
        defaultRuntime: 'process',
        adapters: createDefaultAdapters({
          codex: { command: '', args: [] },
          claude: { command: '', args: [] },
          gemini: { command: '', args: [] },
          process: { command: '', args: [] }
        })
      });

      const first = await manager.execute({
        runtime: 'process',
        runId: 'run-openrouter-native-tool-first',
        sessionId: 'session-openrouter-native-tool-first',
        prompt: 'Start Polybot using the operator skill.',
        workspacePath: process.cwd(),
        metadata: {
          provider: 'openrouter',
          model: 'openrouter/free',
          nativeSkillCallCatalog: [
            {
              name: 'polybot',
              description: 'Polybot operator skill'
            }
          ]
        }
      });
      expect(first.finalStatus).toBe('completed');
      expect(first.toolSessionHandle?.id).toBeTruthy();

      const resumed = await manager.resume({
        runtime: 'process',
        runId: 'run-openrouter-native-tool-second',
        sessionId: 'session-openrouter-native-tool-first',
        prompt: 'Resume Polybot operator action.',
        workspacePath: process.cwd(),
        metadata: {
          provider: 'openrouter',
          model: 'openrouter/free',
          nativeSkillCallCatalog: [
            {
              name: 'polybot',
              description: 'Polybot operator skill'
            }
          ],
          nativeToolSessionHandle: first.toolSessionHandle,
          nativeToolSessionResume: true
        }
      });

      expect(resumed.finalStatus).toBe('completed');
      expect(resumed.toolSessionHandle?.id).toBe(first.toolSessionHandle?.id);
      expect(resumed.toolSessionHandle?.version).toBe((first.toolSessionHandle?.version ?? 0) + 1);
      expect(resumed.toolEvents?.[0]).toMatchObject({
        type: 'session_resumed',
        toolName: 'skill_call',
        native: true
      });
      expect(resumed.toolEvents?.[1]).toMatchObject({
        type: 'tool_call',
        toolName: 'skill_call',
        native: true
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalOpenRouterApiKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
      }
    }
  });

  it('describes native tool-session support and explicit local-executor opt-in in runtime capabilities', () => {
    const document = defaultRuntimeCapabilities();
    const processCapability = document.runtimes.find((entry) => entry.runtimeId === 'process');
    expect(processCapability?.nativeToolSessions).toEqual({
      supported: true,
      transport: 'provider_bridge',
      resumable: true,
      notes:
        'Native tool sessions are available only on provider-backed process routes that expose tool calling; local shell execution stays a separate explicit fallback.'
    });
    expect(processCapability?.role).toEqual({
      defaultLane: 'hybrid',
      reasoningBackedByLlm: true,
      localExecutorRequiresExplicitOptIn: true
    });
  });
});
