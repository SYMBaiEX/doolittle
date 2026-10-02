import { findHeadlessEvalSuite } from "./cases";
import { runHeadlessEvalSuite } from "./runner";

interface CliOptions {
  suiteId: string;
  reportDir?: string;
  routeLabel?: string;
  taskIds: string[];
  showResponses: boolean;
  enableConfiguredCloudResearch: boolean;
}

function parseArgs(args: string[]): CliOptions | undefined {
  const options: CliOptions = {
    suiteId: "headless-workflows-v2",
    taskIds: [],
    showResponses: false,
    enableConfiguredCloudResearch: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (value === "--help" || value === "-h") return undefined;
    if (value === "--show-responses") {
      options.showResponses = true;
      continue;
    }
    if (value === "--enable-configured-cloud-research") {
      options.enableConfiguredCloudResearch = true;
      continue;
    }
    if (
      value === "--suite" ||
      value === "--task" ||
      value === "--report-dir" ||
      value === "--route-label"
    ) {
      const argument = args[index + 1]?.trim();
      if (!argument || argument.startsWith("--")) {
        throw new Error(`${value} requires a value.`);
      }
      index += 1;
      if (value === "--suite") options.suiteId = argument;
      else if (value === "--task") options.taskIds.push(argument);
      else if (value === "--report-dir") options.reportDir = argument;
      else options.routeLabel = argument;
      continue;
    }
    throw new Error(`Unknown headless evaluation option: ${value}`);
  }
  return options;
}

function printHelp(): void {
  console.log(
    [
      "Usage: nub run eval:headless -- [options]",
      "  --suite ID          Versioned suite (default: headless-workflows-v2)",
      "  --task ID           Run one task; repeat to select several",
      "  --route-label NAME  Label this run for comparison",
      "  --report-dir PATH   Private output directory (defaults under local state)",
      "  --show-responses    Print raw responses locally; reports never contain them",
      "  --enable-configured-cloud-research  Enable configured Eliza Cloud only for research tasks",
    ].join("\n"),
  );
}

async function main(): Promise<number> {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options) {
      printHelp();
      return 0;
    }
    const suite = findHeadlessEvalSuite(options.suiteId);
    if (!suite) {
      throw new Error(`Unknown headless evaluation suite: ${options.suiteId}`);
    }
    const { report, reportPath, exitCode } = await runHeadlessEvalSuite(suite, {
      reportDir: options.reportDir,
      routeLabel: options.routeLabel,
      enableConfiguredCloudResearch: options.enableConfiguredCloudResearch,
      taskIds: options.taskIds,
      showResponses: options.showResponses,
      onResponse: (taskId, response, turnNumber, turnTotal) => {
        const turnLabel =
          turnTotal > 1 ? ` · turn ${turnNumber}/${turnTotal}` : "";
        console.log(`\n--- ${taskId}${turnLabel} response ---\n${response}\n`);
      },
    });
    console.log(
      `${report.suite.id} v${report.suite.version} · schema v${report.schemaVersion} · evaluator ${report.evaluatorVersion} · route label ${report.routeLabel} · actual ${report.route.provider}/${report.route.model} (${report.route.reasoningEffort})`,
    );
    console.log(
      `Source ${report.source.revision?.slice(0, 12) ?? "unavailable"} · working tree ${report.source.workingTreeClean === null ? "unknown" : report.source.workingTreeClean ? "clean" : "dirty"}.`,
    );
    for (const run of report.runs) {
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
      console.log(
        `${run.taskId}: ${run.status} · ${objectiveSummary} · setup ${run.timing.taskSetupMs}ms · doolittle exec sum ${run.timing.execDurationMs}ms across ${run.timing.execInvocations} invocation(s) · exec to first assistant text ${execToFirstAssistantText} · grading ${run.timing.gradingMs}ms${diagnostic}`,
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
    }
    console.log(
      `Objective checks: ${report.summary.objectiveChecksPassed}/${report.summary.objectiveChecksTotal}; human review required for ${report.summary.humanReviewRequired} task(s); suite eval wall time ${report.summary.suiteWallTimeMs}ms (setup + doolittle exec + grading; excludes report I/O).`,
    );
    console.log(`Private report: ${reportPath}`);
    return exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printHelp();
    return 1;
  }
}

void main().then((exitCode) => {
  process.exitCode = exitCode;
});
