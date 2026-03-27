#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(sourcePath) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  return JSON.parse(raw);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

export function generateUgothereRetroReport(input) {
  const summary = input.summary ?? {};
  const delegatedRunCount = Number(summary.delegatedRunCount ?? 0);
  const receiptCount = Number(summary.receiptCount ?? 0);
  const delegatedAgentCount = Number(summary.delegatedAgentCount ?? 0);
  const uniqueReceiptRunCount = Number(summary.uniqueReceiptRunCount ?? 0);
  const statuses = toArray(summary.runTerminalStatuses);
  const completedRuns = statuses.filter((entry) => entry?.status === 'completed').length;
  const failedRuns = statuses.filter((entry) => entry?.status === 'failed').length;
  const abortedRuns = statuses.filter((entry) => entry?.status === 'aborted').length;
  const timeoutGuardedRuns = toArray(summary.timeoutGuardedRuns).length;

  const intake = isRecord(summary.intake) ? summary.intake : {};
  const intakeParsedTasks = Number(intake.parsedTasks ?? 0);
  const intakePlanPath = typeof intake.planPath === 'string' ? intake.planPath : null;
  const usesRepositoryPlan =
    intake.ignoredRepositoryPlanFile === false ||
    (typeof intakePlanPath === 'string' && /[\\/]\.agents[\\/]PLAN\.md$/i.test(intakePlanPath));

  const receiptExpectation = isRecord(summary.receiptExpectation) ? summary.receiptExpectation : {};
  const receiptExpected = receiptExpectation.expected === true;
  const subagentActivityCount = Number(summary.subagentActivityCount ?? 0);

  const worked = [];
  const didNotWork = [];
  const improvements = [];
  const priorityFixes = [];

  if (summary.executed === true) {
    worked.push({
      area: 'fixture_reproducibility',
      detail: 'Scenario fixture produced deterministic artifact paths and stable run metadata.',
      evidence: summary.artifactPaths ?? {}
    });

    if (intakeParsedTasks > 0) {
      worked.push({
        area: 'project_intake_parsing',
        detail: `Backlog intake parsed ${intakeParsedTasks} PLAN task(s) via project-intake endpoint.`,
        evidence: {
          endpoint: intake.endpoint ?? '/api/backlog/project-intake',
          requestedMode: intake.requestedMode ?? null,
          usedMode: intake.usedMode ?? null,
          planPath: intakePlanPath,
          prdPath: intake.prdPath ?? null
        }
      });
    } else {
      didNotWork.push({
        area: 'project_intake_parsing',
        detail: 'Simulation did not parse any intake tasks into backlog.',
        evidence: {
          parsedTasks: intakeParsedTasks,
          endpoint: intake.endpoint ?? null,
          planPath: intakePlanPath
        }
      });
      priorityFixes.push({
        severity: 'high',
        title: 'Restore plan-intake parsing coverage',
        owner: 'orchestration',
        action: 'Ensure /api/backlog/project-intake returns parsedTasks > 0 before dispatch loop begins.',
        metric: 'intake.parsedTasks >= 1',
        confidence: 0.92,
        risk: 'Dispatch may proceed without a validated dependency graph.'
      });
    }

    if (usesRepositoryPlan) {
      didNotWork.push({
        area: 'plan_source_isolation',
        detail: 'Simulation used repository .agents/PLAN.md instead of scenario-local intake plan artifacts.',
        evidence: {
          planPath: intakePlanPath
        }
      });
      priorityFixes.push({
        severity: 'high',
        title: 'Isolate simulation intake plan source',
        owner: 'simulation',
        action: 'Write intake PLAN/PRD into runDir artifacts and pass those absolute paths to project-intake.',
        metric: 'intake.planPath does not end with .agents/PLAN.md',
        confidence: 0.95,
        risk: 'Simulation can be contaminated by unrelated workspace planning state.'
      });
    } else if (intakePlanPath) {
      worked.push({
        area: 'plan_source_isolation',
        detail: 'Simulation used scenario-local PLAN/PRD artifacts rather than repository planning files.',
        evidence: {
          planPath: intakePlanPath
        }
      });
    }

    if (delegatedRunCount > 0) {
      worked.push({
        area: 'delegation_pipeline',
        detail: `Delegated ${delegatedRunCount} backlog run(s) across ${delegatedAgentCount} agent(s).`,
        evidence: {
          delegatedRunCount,
          delegatedAgentCount,
          delegatedAgentIds: toArray(summary.delegatedAgentIds)
        }
      });
    }
    if (completedRuns > 0) {
      worked.push({
        area: 'runtime_delivery',
        detail: `${completedRuns} delegated run(s) reached completed state.`,
        evidence: {
          runTerminalStatuses: statuses
        }
      });
    }
    if (subagentActivityCount > 0) {
      worked.push({
        area: 'subagent_observability',
        detail: `Captured ${subagentActivityCount} delegated subagent activity artifact(s).`,
        evidence: {
          subagentActivityCount,
          delegatedRunCount
        }
      });
    }
  } else {
    didNotWork.push({
      area: 'simulation_execution',
      detail: 'Live simulation was not executed end-to-end.',
      evidence: {
        reason: summary.reason ?? 'unknown'
      }
    });
    priorityFixes.push({
      severity: 'high',
      title: 'Restore simulation API/token connectivity',
      owner: 'platform',
      action: 'Provide SIM_API_BASE and SIM_API_TOKEN (or OPS_API_TOKEN) and re-run simulation.',
      metric: 'summary.executed must be true',
      confidence: 0.96,
      risk: 'Without this, cross-surface orchestration evidence is incomplete.'
    });
  }

  if (summary.executed === true && receiptExpected && uniqueReceiptRunCount < delegatedRunCount) {
    didNotWork.push({
      area: 'receipt_coverage',
      detail: 'Some delegated runs did not produce unique completion receipts.',
      evidence: {
        delegatedRunCount,
        uniqueReceiptRunCount,
        receiptCount
      }
    });
    priorityFixes.push({
      severity: 'high',
      title: 'Close delegated receipt gaps',
      owner: 'messaging',
      action: 'Audit missing delegatedRunId receipt mappings and harden retry+dedupe linkage.',
      metric: 'uniqueReceiptRunCount == delegatedRunCount',
      confidence: 0.82,
      risk: 'Operators may miss completion notifications for internal delegated work.'
    });
  }
  if (summary.executed === true && !receiptExpected) {
    worked.push({
      area: 'receipt_policy_alignment',
      detail: 'Receipt coverage check skipped because the delivery target session is not receipt-eligible.',
      evidence: {
        receiptExpected,
        reason: receiptExpectation.reason ?? null,
        delegatedRunCount
      }
    });
  }

  if (summary.executed === true && (failedRuns > 0 || abortedRuns > 0)) {
    didNotWork.push({
      area: 'run_stability',
      detail: `${failedRuns} delegated run(s) failed and ${abortedRuns} aborted.`,
      evidence: {
        runTerminalStatuses: statuses,
        timeoutGuardedRuns
      }
    });
    priorityFixes.push({
      severity: 'medium',
      title: 'Reduce delegated run failure rate',
      owner: 'runtime',
      action: 'Inspect failure signatures and add targeted retry/remediation policies for top recurring error classes.',
      metric: 'failed + aborted delegated runs <= 5% per simulation',
      confidence: 0.71,
      risk: 'Frequent run failures reduce backlog throughput and operator trust.'
    });
  }

  improvements.push({
    title: 'Add fairness stress scenario across multiple repo scopes',
    action: 'Run simulation with at least two projectIds and assert round-robin dispatch behavior under shared maxParallel limits.',
    linkedTaskIds: ['T-127', 'T-128'],
    metric: 'No project receives >2 consecutive dispatch slots when peers are eligible',
    confidence: 0.78,
    risk: 'Low fairness observability can hide starvation in multi-repo workloads.'
  });

  improvements.push({
    title: 'Track per-step continuity diagnostics in simulation bundle',
    action: 'Capture prompt assembly + continuity signals for each delegated run and include in summary timeline.',
    linkedTaskIds: ['T-147', 'T-150'],
    metric: '100% of delegated runs include prompt assembly snapshot id and continuity signal counts',
    confidence: 0.8,
    risk: 'Without this, continuity regressions are harder to root-cause after long simulations.'
  });

  if (priorityFixes.length === 0) {
    priorityFixes.push({
      severity: 'low',
      title: 'No blocking issues detected in this run',
      owner: 'ops',
      action: 'Keep nightly simulation cadence and monitor drift in dispatch/receipt stability.',
      metric: 'Maintain zero high-severity retro findings for 7 consecutive runs',
      confidence: 0.64,
      risk: 'Latent regressions can appear without sustained replay coverage.'
    });
  }

  return {
    schema: 'ops.ugothere.retro.v2',
    generatedAt: new Date().toISOString(),
    sourceSummary: {
      executed: summary.executed === true,
      runDir: summary.runDir ?? null,
      delegatedRunCount,
      delegatedAgentCount,
      receiptCount,
      uniqueReceiptRunCount,
      receiptExpected,
      intakePlanPath
    },
    worked,
    did_not_work: didNotWork,
    improvements,
    priority_fixes: priorityFixes
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  const summaryPath = typeof args.summary === 'string' ? path.resolve(args.summary) : null;
  const outputPath = typeof args.output === 'string' ? path.resolve(args.output) : null;
  if (!summaryPath || !outputPath) {
    process.stderr.write('Usage: generate-ugothere-retro.mjs --summary <summary.json> --output <retro.json>\n');
    process.exitCode = 1;
  } else {
    const summary = readJson(summaryPath);
    const retro = generateUgothereRetroReport({ summary });
    writeJson(outputPath, retro);
    process.stdout.write(`${JSON.stringify({ ok: true, output: outputPath }, null, 2)}\n`);
  }
}
