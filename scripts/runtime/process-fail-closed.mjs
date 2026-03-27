#!/usr/bin/env node

let flushed = false;

function flush() {
  if (flushed) {
    return;
  }
  flushed = true;
  const lines = [
    'Process runtime fallback is not bound to a real local executor in this config.',
    'This placeholder exists only to fail closed when provider-backed process execution is unavailable.',
    'Configure runtime.adapters.process to a real non-interactive executor, or keep process runs on a provider-backed model route.'
  ];
  process.stderr.write(`${lines.join('\n')}\n`);
  process.exitCode = 64;
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', () => {
  // Prompt content is not used by the placeholder. We only consume stdin so the adapter can close cleanly.
});
process.stdin.on('end', flush);
process.stdin.on('error', flush);
process.stdin.resume();
setTimeout(flush, 25);
