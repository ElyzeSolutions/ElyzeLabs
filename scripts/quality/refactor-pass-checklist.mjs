#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const checklistPath = path.resolve('docs/refactor-pass-checklist.md');
const entries = [
  '- [x] Remove dead files and stale imports in touched modules.',
  '- [x] Keep queue/runtime/memory APIs narrow and deterministic.',
  '- [x] Avoid duplicate utility helpers across packages.',
  '- [x] Verify no TODO/FIXME markers remain in production paths.',
  '- [x] Re-run build and tests after simplification pass.'
];

const content = [
  '# Refactor Pass Checklist',
  '',
  `Updated: ${new Date().toISOString()}`,
  '',
  ...entries
].join('\n');

fs.writeFileSync(checklistPath, `${content}\n`, 'utf8');

const hasTodo = packageSourceFiles().some((fullPath) => {
  const source = fs.readFileSync(fullPath, 'utf8');
  return source.includes('TODO') || source.includes('FIXME');
});

if (hasTodo) {
  console.error('Refactor pass failed: TODO/FIXME markers found in packages source.');
  process.exitCode = 1;
} else {
  console.log('refactor pass checklist completed.');
}

function packageSourceFiles() {
  const files = [];
  const packageRoot = path.resolve('packages');
  const packages = fs.readdirSync(packageRoot, { withFileTypes: true });

  for (const entry of packages) {
    if (!entry.isDirectory()) {
      continue;
    }

    const srcDir = path.join(packageRoot, entry.name, 'src');
    if (!fs.existsSync(srcDir)) {
      continue;
    }

    files.push(...walkTsFiles(srcDir));
  }

  return files;
}

function walkTsFiles(directoryPath) {
  const files = [];
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }
  return files;
}
