#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file.length > 0);
const presentTrackedFiles = trackedFiles.filter((file) => existsSync(file));

const trackedPathRules = [
  {
    description: 'Local env files must stay out of git.',
    regex: /(^|\/)\.env(\..+)?$/,
    allow: /^\.env\.example$/
  },
  {
    description: 'Runtime state under .ops must stay out of git.',
    regex: /(^|\/)\.ops\//
  },
  {
    description: 'Installed dependencies must stay out of git.',
    regex: /(^|\/)node_modules\//
  },
  {
    description: 'Build output must stay out of git.',
    regex: /(^|\/)dist\//
  },
  {
    description: 'Database files must stay out of git.',
    regex: /\.(db|db-wal|db-shm|sqlite|sqlite3)$/i
  },
  {
    description: 'TypeScript incremental build artifacts must stay out of git.',
    regex: /\.tsbuildinfo$/i
  },
  {
    description: 'package-lock.json should not be tracked in this pnpm workspace.',
    regex: /(^|\/)package-lock\.json$/i
  }
];

const contentRules = [
  {
    description: 'GitHub token pattern detected.',
    regex: /ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}/
  },
  {
    description: 'OpenAI or OpenRouter style key pattern detected.',
    regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/
  },
  {
    description: 'Google API key pattern detected.',
    regex: /AIza[0-9A-Za-z_-]{20,}/
  },
  {
    description: 'AWS access key pattern detected.',
    regex: /AKIA[0-9A-Z]{16}/
  },
  {
    description: 'Slack token pattern detected.',
    regex: /xox[baprs]-[A-Za-z0-9-]{10,}/
  },
  {
    description: 'Private key material detected.',
    regex: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|PGP|PRIVATE) KEY-----/
  }
];

const failures = [];

if (!existsSync('README.md')) {
  failures.push('README.md is required before publishing.');
}

for (const file of presentTrackedFiles) {
  for (const rule of trackedPathRules) {
    if (!rule.regex.test(file)) {
      continue;
    }
    if (rule.allow && rule.allow.test(file)) {
      continue;
    }
    failures.push(`${file}: ${rule.description}`);
  }
}

for (const file of presentTrackedFiles) {
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    continue;
  }

  const sampleLength = Math.min(buffer.length, 1024);
  let binary = false;
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      binary = true;
      break;
    }
  }
  if (binary) {
    continue;
  }

  const content = buffer.toString('utf8');
  for (const rule of contentRules) {
    if (rule.regex.test(content)) {
      failures.push(`${file}: ${rule.description}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Publish readiness checks failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Publish readiness checks passed.');
}
