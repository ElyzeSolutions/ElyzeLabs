#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const SOURCE_PATH = path.join(REPO_ROOT, 'docs/best-in-class-capability-matrix.json');
const GENERATED_JSON_PATH = path.join(REPO_ROOT, 'docs/generated/best-in-class-capability-matrix.json');
const GENERATED_MD_PATH = path.join(REPO_ROOT, 'docs/generated/best-in-class-capability-matrix.md');

const VALID_STATUSES = new Set(['ahead', 'parity', 'partial', 'missing', 'defer']);
const VALID_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const READY_STATUSES = new Set(['ahead', 'parity']);

const args = new Set(process.argv.slice(2));
const mode = args.has('--check') ? 'check' : 'write';
const validateExternalEvidence =
  process.env.OPS_BEST_IN_CLASS_VALIDATE_EXTERNAL_EVIDENCE === '1' || process.env.CI !== 'true';

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const readText = (filePath) => fs.readFileSync(filePath, 'utf8');

const readJson = (filePath) => {
  const raw = readText(filePath);
  return {
    raw,
    value: JSON.parse(raw)
  };
};

const stableStringify = (value) => `${JSON.stringify(value, null, 2)}\n`;

const resolveEvidencePath = (entry) => (path.isAbsolute(entry) ? entry : path.join(REPO_ROOT, entry));

const isExternalEvidencePath = (entry) => {
  if (!path.isAbsolute(entry)) {
    return false;
  }
  return path.relative(REPO_ROOT, entry).startsWith('..');
};

const shouldValidateEvidencePath = (entry) => validateExternalEvidence || !isExternalEvidencePath(entry);

const relativeDisplayPath = (entry) => {
  if (!path.isAbsolute(entry)) {
    return entry;
  }
  const relative = path.relative(REPO_ROOT, entry);
  return relative.startsWith('..') ? entry : relative;
};

const escapeMd = (value) =>
  String(value)
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>');

const stringList = (value) => (Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []);

const addError = (errors, message) => {
  errors.push(message);
};

const validateEvidencePaths = (errors, capabilityId, label, paths) => {
  for (const evidencePath of paths) {
    if (!shouldValidateEvidencePath(evidencePath)) {
      continue;
    }
    const resolved = resolveEvidencePath(evidencePath);
    if (!fs.existsSync(resolved)) {
      addError(errors, `${capabilityId}: ${label} path does not exist: ${evidencePath}`);
    }
  }
};

const validateMatrix = (matrix) => {
  const errors = [];
  if (!isRecord(matrix)) {
    return ['matrix root must be an object'];
  }
  if (matrix.schema !== 'ops.best-in-class-capability-matrix.v1') {
    addError(errors, 'schema must be ops.best-in-class-capability-matrix.v1');
  }
  if (typeof matrix.updatedAt !== 'string' || matrix.updatedAt.trim().length === 0) {
    addError(errors, 'updatedAt is required');
  }
  if (!Array.isArray(matrix.competitors) || matrix.competitors.length !== 3) {
    addError(errors, 'competitors must include exactly Hermes Agent, NemoClaw, and OpenClaw');
  } else {
    const competitorIds = new Set();
    for (const competitor of matrix.competitors) {
      if (!isRecord(competitor)) {
        addError(errors, 'competitor entry must be an object');
        continue;
      }
      const id = typeof competitor.id === 'string' ? competitor.id : '';
      const competitorPath = typeof competitor.path === 'string' ? competitor.path : '';
      competitorIds.add(id);
      if (!competitorPath) {
        addError(errors, `${id || 'unknown competitor'}: competitor path does not exist: ${competitorPath}`);
      } else if (shouldValidateEvidencePath(competitorPath) && !fs.existsSync(resolveEvidencePath(competitorPath))) {
        addError(errors, `${id || 'unknown competitor'}: competitor path does not exist: ${competitorPath}`);
      }
      if (stringList(competitor.focus).length === 0) {
        addError(errors, `${id || 'unknown competitor'}: focus list is required`);
      }
    }
    for (const requiredId of ['hermes-agent', 'NemoClaw', 'openclaw']) {
      if (!competitorIds.has(requiredId)) {
        addError(errors, `missing competitor ${requiredId}`);
      }
    }
  }

  if (!Array.isArray(matrix.capabilities) || matrix.capabilities.length === 0) {
    addError(errors, 'capabilities must be a non-empty array');
    return errors;
  }

  const seenIds = new Set();
  for (const capability of matrix.capabilities) {
    if (!isRecord(capability)) {
      addError(errors, 'capability entry must be an object');
      continue;
    }
    const id = typeof capability.id === 'string' ? capability.id : '';
    if (!/^[a-z0-9_]+$/.test(id)) {
      addError(errors, `${id || 'unknown capability'}: id must be snake_case`);
    }
    if (seenIds.has(id)) {
      addError(errors, `${id}: duplicate capability id`);
    }
    seenIds.add(id);

    const status = typeof capability.status === 'string' ? capability.status : '';
    const priority = typeof capability.priority === 'string' ? capability.priority : '';
    const requiredForBestInClass = capability.requiredForBestInClass === true;
    const requirement = typeof capability.requirement === 'string' ? capability.requirement.trim() : '';
    const elyzeEvidence = stringList(capability.elyzeEvidence);
    const referenceEvidence = stringList(capability.referenceEvidence);
    const referenceSignals = stringList(capability.referenceSignals);
    const remainingGaps = stringList(capability.remainingGaps);
    const verification = isRecord(capability.verification) ? capability.verification : {};
    const commands = stringList(verification.commands);
    const testPaths = stringList(verification.testPaths);

    if (!VALID_STATUSES.has(status)) {
      addError(errors, `${id}: invalid status ${status}`);
    }
    if (!VALID_PRIORITIES.has(priority)) {
      addError(errors, `${id}: invalid priority ${priority}`);
    }
    if (!requirement) {
      addError(errors, `${id}: requirement is required`);
    }
    if (referenceSignals.length === 0) {
      addError(errors, `${id}: referenceSignals are required`);
    }
    if (elyzeEvidence.length === 0) {
      addError(errors, `${id}: Elyze evidence paths are required`);
    }
    if (referenceEvidence.length === 0) {
      addError(errors, `${id}: reference evidence paths are required`);
    }
    validateEvidencePaths(errors, id, 'Elyze evidence', elyzeEvidence);
    validateEvidencePaths(errors, id, 'reference evidence', referenceEvidence);
    validateEvidencePaths(errors, id, 'verification test', testPaths);

    if (READY_STATUSES.has(status) && commands.length === 0 && testPaths.length === 0) {
      addError(errors, `${id}: ${status} claims need at least one verification command or test path`);
    }
    if ((status === 'partial' || status === 'missing') && remainingGaps.length === 0) {
      addError(errors, `${id}: ${status} capabilities must list remaining gaps`);
    }
    if (requiredForBestInClass && status === 'defer') {
      addError(errors, `${id}: deferred capabilities cannot be required for best-in-class`);
    }
  }

  return errors;
};

const summarize = (matrix, sourceHash) => {
  const statusCounts = Object.fromEntries(Array.from(VALID_STATUSES).map((status) => [status, 0]));
  const requiredGaps = [];
  const deferred = [];
  for (const capability of matrix.capabilities) {
    statusCounts[capability.status] = (statusCounts[capability.status] ?? 0) + 1;
    if (capability.requiredForBestInClass && !READY_STATUSES.has(capability.status)) {
      requiredGaps.push({
        id: capability.id,
        area: capability.area,
        priority: capability.priority,
        status: capability.status,
        remainingGaps: capability.remainingGaps
      });
    }
    if (capability.status === 'defer') {
      deferred.push({
        id: capability.id,
        area: capability.area,
        priority: capability.priority,
        remainingGaps: capability.remainingGaps
      });
    }
  }
  return {
    schema: 'ops.best-in-class-audit.v1',
    version: 1,
    sourceSchema: matrix.schema,
    sourceHash,
    updatedAt: matrix.updatedAt,
    scope: matrix.scope,
    readiness: requiredGaps.length === 0 ? 'ready' : 'not_ready',
    statusCounts,
    totals: {
      capabilities: matrix.capabilities.length,
      requiredForBestInClass: matrix.capabilities.filter((entry) => entry.requiredForBestInClass).length,
      requiredGaps: requiredGaps.length,
      deferred: deferred.length
    },
    competitors: matrix.competitors.map((entry) => ({
      id: entry.id,
      label: entry.label,
      path: entry.path,
      focus: entry.focus
    })),
    requiredGaps,
    deferred,
    capabilities: matrix.capabilities.map((entry) => ({
      id: entry.id,
      area: entry.area,
      priority: entry.priority,
      requiredForBestInClass: entry.requiredForBestInClass,
      status: entry.status,
      requirement: entry.requirement,
      elyzeEvidence: entry.elyzeEvidence,
      referenceEvidence: entry.referenceEvidence,
      verification: entry.verification,
      remainingGaps: entry.remainingGaps
    }))
  };
};

const renderMarkdown = (audit) => {
  const lines = [
    '# Best-In-Class Capability Matrix',
    '',
    'Generated from `docs/best-in-class-capability-matrix.json` by `pnpm best-in-class:matrix`.',
    '',
    '## Summary',
    '',
    `- Schema: \`${audit.schema}\``,
    `- Source hash: \`${audit.sourceHash}\``,
    `- Updated at: ${audit.updatedAt}`,
    `- Readiness: \`${audit.readiness}\``,
    `- Capabilities: ${audit.totals.capabilities}`,
    `- Required for best-in-class: ${audit.totals.requiredForBestInClass}`,
    `- Required gaps: ${audit.totals.requiredGaps}`,
    `- Deferred: ${audit.totals.deferred}`,
    '',
    '## Status Counts',
    '',
    '| Status | Count |',
    '| --- | ---: |'
  ];

  for (const status of VALID_STATUSES) {
    lines.push(`| ${status} | ${audit.statusCounts[status] ?? 0} |`);
  }

  lines.push('', '## Required Gaps', '');
  if (audit.requiredGaps.length === 0) {
    lines.push('No required gaps remain.');
  } else {
    lines.push('| Capability | Area | Priority | Status | Gaps |', '| --- | --- | --- | --- | --- |');
    for (const gap of audit.requiredGaps) {
      lines.push(
        `| ${escapeMd(gap.id)} | ${escapeMd(gap.area)} | ${escapeMd(gap.priority)} | ${escapeMd(gap.status)} | ${escapeMd(gap.remainingGaps.join('; '))} |`
      );
    }
  }

  lines.push('', '## Matrix', '');
  lines.push('| Capability | Area | Priority | Required | Status | Evidence | Verification |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const capability of audit.capabilities) {
    const evidence = capability.elyzeEvidence.map(relativeDisplayPath).join('<br>');
    const verification = [
      ...stringList(capability.verification.commands),
      ...stringList(capability.verification.testPaths).map((entry) => `test: ${entry}`)
    ].join('<br>');
    lines.push(
      `| ${escapeMd(capability.id)} | ${escapeMd(capability.area)} | ${escapeMd(capability.priority)} | ${capability.requiredForBestInClass ? 'yes' : 'no'} | ${escapeMd(capability.status)} | ${escapeMd(evidence)} | ${escapeMd(verification || 'not required for current status')} |`
    );
  }

  lines.push('', '## Competitors', '');
  lines.push('| Competitor | Path | Focus |');
  lines.push('| --- | --- | --- |');
  for (const competitor of audit.competitors) {
    lines.push(`| ${escapeMd(competitor.label)} | ${escapeMd(competitor.path)} | ${escapeMd(competitor.focus.join('; '))} |`);
  }

  return `${lines.join('\n')}\n`;
};

const compareFile = (filePath, expected) => {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return readText(filePath) === expected;
};

const main = () => {
  const { raw, value: matrix } = readJson(SOURCE_PATH);
  const validationErrors = validateMatrix(matrix);
  if (validationErrors.length > 0) {
    console.error('Best-in-class matrix validation failed:');
    for (const error of validationErrors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const sourceHash = crypto.createHash('sha256').update(raw).digest('hex');
  const audit = summarize(matrix, sourceHash);
  const generatedJson = stableStringify(audit);
  const generatedMarkdown = renderMarkdown(audit);

  if (mode === 'check') {
    const jsonCurrent = compareFile(GENERATED_JSON_PATH, generatedJson);
    const markdownCurrent = compareFile(GENERATED_MD_PATH, generatedMarkdown);
    if (!jsonCurrent || !markdownCurrent) {
      console.error('Best-in-class generated files are stale. Run pnpm best-in-class:matrix.');
      process.exit(1);
    }
    console.log(
      `Best-in-class matrix is current (${audit.totals.capabilities} capabilities, readiness=${audit.readiness}, required gaps=${audit.totals.requiredGaps}).`
    );
    return;
  }

  fs.mkdirSync(path.dirname(GENERATED_JSON_PATH), { recursive: true });
  fs.writeFileSync(GENERATED_JSON_PATH, generatedJson, 'utf8');
  fs.writeFileSync(GENERATED_MD_PATH, generatedMarkdown, 'utf8');
  console.log(
    `Best-in-class matrix updated (${audit.totals.capabilities} capabilities, readiness=${audit.readiness}, required gaps=${audit.totals.requiredGaps}).`
  );
};

main();
