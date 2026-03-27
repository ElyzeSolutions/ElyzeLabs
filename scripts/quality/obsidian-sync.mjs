#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { utcNow } from '../../packages/shared/dist/index.js';

const outputDirectory = path.resolve('docs/obsidian-sync');
const outputPath = path.join(outputDirectory, 'control-plane-sync.md');

fs.mkdirSync(outputDirectory, { recursive: true });

const content = [
  '# Ops Control Plane Sync Snapshot',
  '',
  `- Updated: ${utcNow()}`,
  '- Scope: architecture snapshot, runbook pointers, quality lane status',
  '',
  '## Key References',
  '- docs/runbooks/startup.md',
  '- docs/runbooks/incident-triage.md',
  '- docs/release-checklist.md',
  '- .agents/PLAN.md',
  '',
  '## Notes',
  '- This markdown artifact is generated to keep project context synchronized for Obsidian ingestion workflows.',
  '- Re-running this command is idempotent and safely overwrites this snapshot file.'
].join('\n');

fs.writeFileSync(outputPath, `${content}\n`, 'utf8');
console.log(`obsidian sync snapshot written to ${outputPath}`);
