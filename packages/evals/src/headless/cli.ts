import { formatActionCounts } from "./action-counts-format";
import { findHeadlessEvalSuite } from "./cases";
import { parseHeadlessEvalCliOptions } from "./cli-options";
import {
  createOperationalFailureTracker,
  emitOperationalFailure,
  formatOperationalFailure,
  type HeadlessOperationalFailure,
  isHeadlessOperationalFailure,
} from "./operational-failure";
import { runHeadlessEvalSuite } from "./runner";

function printHelp(): void {
  console.log(
    [
      "Usage: nub run eval:headless -- [options]",
      "  --suite ID          Versioned suite (default: headless-workflows-v2)",
      "  --task ID           Run one task; repeat to select several",
      "  --route-label NAME  Label this run for comparison",
      "  --report-dir PATH   Private output directory (defaults under local state)",
      "  --show-responses    Print raw responses locally; reports never contain them",
      "  --show-action-labels  Print bounded action labels locally; non-allowlisted labels are redacted and reports never contain labels",
      "  --record-action-diagnostics  Write an opt-in private content-free action-event category receipt; not distinct commands or causal failure evidence",
      "  --record-model-inputs  Retain private content-free first-creating-runtime input observations; phase/worker/wire-byte/full-overhead coverage unavailable",
      "  --enable-configured-cloud-research  Enable configured Eliza Cloud only for research tasks",
      "  --deduplicate-planner-alias-tools  Remove duplicate planner alias advertisements for this evaluation",
    ].join("\n"),
  );
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const failure = createOperationalFailureTracker("cli-preflight");
  let runnerFailure: HeadlessOperationalFailure | undefined;
  try {
    const options = parseHeadlessEvalCliOptions(args);
    if (!options) {
      printHelp();
      return 0;
    }
    const suite = findHeadlessEvalSuite(options.suiteId);
    if (!suite) {
      throw new Error(`Unknown headless evaluation suite: ${options.suiteId}`);
    }
    failure.enter("runner-preflight");
    // CLI does not observe inner child lifecycle or time the runner as a child.
    failure.unavailableChild();
    const {
      report,
      reportPath,
      exitCode,
      measurementReceiptStatus,
      actionDiagnosticsReceiptStatus,
      modelInputReceiptStatus,
    } = await runHeadlessEvalSuite(suite, {
      onOperationalFailure: (receipt) => {
        if (!runnerFailure && isHeadlessOperationalFailure(receipt))
          runnerFailure = receipt;
      },
      reportDir: options.reportDir,
      routeLabel: options.routeLabel,
      enableConfiguredCloudResearch: options.enableConfiguredCloudResearch,
      taskIds: options.taskIds,
      showResponses: options.showResponses,
      recordActionDiagnostics: options.recordActionDiagnostics,
      recordModelInputs: options.recordModelInputs,
      deduplicatePlannerAliasTools: options.deduplicatePlannerAliasTools,
      onActionLabels: options.showActionLabels
        ? (taskId, diagnostic) => {
            const omitted = diagnostic.omitted
              ? `; ${diagnostic.omitted} additional label(s) omitted`
              : "";
            console.log(
              `  ${taskId} local action-label diagnostic: ${diagnostic.labels.join(", ") || "none"}${omitted}`,
            );
          }
        : undefined,
      onResponse: (taskId, response, turnNumber, turnTotal) => {
        const turnLabel =
          turnTotal > 1 ? ` · turn ${turnNumber}/${turnTotal}` : "";
        console.log(`\n--- ${taskId}${turnLabel} response ---\n${response}\n`);
      },
    });
    failure.enter("cli-output");
    failure.setPersistence("written");
    console.log(
      `${report.suite.id} v${report.suite.version} · schema v${report.schemaVersion} · evaluator ${report.evaluatorVersion} · route label ${report.routeLabel} · advertised product default ${report.route.provider ?? "unknown"}/sha256:${report.route.modelSha256} (${report.route.reasoningEffort ?? "unknown"}); expected fresh Settings configuration, not effective-route attestation`,
    );
    console.log(
      `Source ${report.source.revision?.slice(0, 12) ?? "unavailable"} · working tree ${report.source.workingTreeClean === null ? "unknown" : report.source.workingTreeClean ? "clean" : "dirty"}.`,
    );
    for (const run of report.runs) {
      console.log(
        `  ${run.taskId} route evidence: ${run.routeEvidence.status}; accepted ${run.routeEvidence.accepted}, rejected ${run.routeEvidence.rejected}, truncated ${run.routeEvidence.truncated}; parent requested model digests only; effective route/effort and worker route unavailable.`,
      );
      console.log(
        `  Direct harness phases: setup ${run.harnessTiming.setupMs}ms; response processing ${run.harnessTiming.responseProcessingMs}ms; grading ${run.harnessTiming.gradingMs}ms; task cleanup ${run.harnessTiming.cleanupMs}ms. Partial coverage, not wall-minus-provider overhead.`,
      );
      const checks = run.checks.filter((check) => check.passed).length;
      const researchProviderFailure = run.diagnosticFlags.find((flag) =>
        flag.startsWith("research-provider-"),
      );
      const objectiveSummary = researchProviderFailure
        ? `quality unavailable (${researchProviderFailure}); operational check ${checks}/${run.checks.length}`
        : `objective ${checks}/${run.checks.length}`;
      const diagnostic = run.diagnosticFlags.length
        ? ` · diagnostics ${run.diagnosticFlags.join(",")}`
        : "";
      const execToFirstAssistantText =
        run.timing.execToFirstAssistantTextMs === null
          ? "unavailable"
          : `${run.timing.execToFirstAssistantTextMs}ms`;
      const execToFirstModelRequest =
        run.timing.execToFirstModelRequestMs === null
          ? "unavailable"
          : `${run.timing.execToFirstModelRequestMs}ms`;
      console.log(
        `${run.taskId}: ${run.status} · ${objectiveSummary} · setup ${run.timing.taskSetupMs}ms · doolittle exec sum ${run.timing.execDurationMs}ms across ${run.timing.execInvocations} invocation(s) · exec to first model request ${execToFirstModelRequest} · exec to first assistant text ${execToFirstAssistantText} · grading ${run.timing.gradingMs}ms${diagnostic}`,
      );
      if (run.modelUsage) {
        const usage = run.modelUsage;
        const tokens =
          usage.inputTokens === null
            ? "unavailable"
            : `${usage.inputTokens}/${usage.outputTokens}/${usage.totalTokens}`;
        const firstText =
          usage.meanFirstTextMs === null
            ? "unavailable"
            : `${usage.meanFirstTextMs}ms`;
        console.log(
          `  Codex calls ${usage.completedCalls}/${usage.providerCalls} complete · provider time sum ${usage.providerDurationMs}ms · mean provider-call first text ${firstText} · input/output/total tokens ${tokens} (${usage.tokenUsageSamples}/${usage.providerCalls} calls reported); USD cost unavailable.`,
        );
      } else {
        console.log("  Codex provider metrics: not recorded.");
      }
      const trace = run.traceSummary;
      const promptChars = trace.promptChars
        ? `${trace.promptChars.min}/${trace.promptChars.mean}/${trace.promptChars.max} chars min/mean/max`
        : "unavailable";
      console.log(
        `  Trace requests ${trace.modelRequests} · responses ${trace.modelResponses} · errors ${trace.modelErrors} · mutation continuations ${trace.mutationContinuations} (max attempt ${trace.maxContinuationAttempt ?? "none"}) · prompt size ${promptChars}.`,
      );
      console.log(formatActionCounts(trace));
    }
    console.log(
      `Objective checks: ${report.summary.objectiveChecksPassed}/${report.summary.objectiveChecksTotal}; human review required for ${report.summary.humanReviewRequired} task(s); suite eval wall time ${report.summary.suiteWallTimeMs}ms (setup + doolittle exec + grading; excludes report I/O).`,
    );
    console.log(`Private report: ${reportPath}`);
    if (options.recordActionDiagnostics)
      console.log(
        `Content-free action diagnostics receipt: ${actionDiagnosticsReceiptStatus}; event counts only, not failure causes or worker-command attribution.`,
      );
    if (options.recordModelInputs)
      console.log(
        `Content-free model inputs receipt: ${modelInputReceiptStatus}; first-creating-runtime only, not later shared-data CLI invocations. Null/partial fields are unavailable. Phase unknown; character counts are not wire bytes/tokens, effective routes, cache/billing/worker evidence or full overhead. Projection/prior-sink clocks are partial.`,
      );
    console.log(
      `Completed report serialization/persistence timing receipt: ${measurementReceiptStatus}; not self-described in the report. Harness phase coverage is partial; child exec/startup/model/tool time is a separate composite.`,
    );
    return exitCode;
  } catch {
    // Emit once, even if the trusted output sink itself throws. Never inspect
    // caught exceptions or print arguments, paths, messages, names or causes.
    emitOperationalFailure(
      (receipt) => console.error(formatOperationalFailure(receipt)),
      runnerFailure ?? failure.receipt(),
    );
    return 1;
  }
}

if (import.meta.main)
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
