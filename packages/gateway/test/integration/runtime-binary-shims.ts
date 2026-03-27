import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SHIM_SCRIPT = String.raw`#!/usr/bin/env node
const runtime = process.argv[2] || 'runtime';
let prompt = '';
const extract = (input) => {
  const currentTaskIndex = input.lastIndexOf('CURRENT_TASK:\n');
  if (currentTaskIndex >= 0) {
    return input.slice(currentTaskIndex + 'CURRENT_TASK:\n'.length).trim();
  }
  const taskIndex = input.lastIndexOf('TASK:');
  if (taskIndex >= 0) {
    return input.slice(taskIndex + 'TASK:'.length).trim();
  }
  return input.trim();
};
const finish = () => {
  const output = extract(prompt) || runtime;
  process.stdout.write(output);
  process.exit(0);
};
process.stdin.on('data', (chunk) => {
  prompt += chunk;
});
process.stdin.on('end', finish);
process.stdin.resume();
`;

export function installPortableRuntimeBinaryShims(prefix: string): () => void {
  const originalPath = process.env.PATH ?? '';
  const binRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-runtime-bin-`));
  for (const runtime of ['codex', 'claude', 'gemini'] as const) {
    const shimPath = path.join(binRoot, runtime);
    fs.writeFileSync(shimPath, `${SHIM_SCRIPT}\n`, { encoding: 'utf8', mode: 0o755 });
    fs.chmodSync(shimPath, 0o755);
  }
  process.env.PATH = `${binRoot}${path.delimiter}${originalPath}`;
  return () => {
    process.env.PATH = originalPath;
    fs.rmSync(binRoot, { recursive: true, force: true });
  };
}
