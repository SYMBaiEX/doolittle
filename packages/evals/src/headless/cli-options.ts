export interface HeadlessEvalCliOptions {
  suiteId: string;
  reportDir?: string;
  routeLabel?: string;
  taskIds: string[];
  showResponses: boolean;
  captureSyntheticResponses: boolean;
  showActionLabels: boolean;
  enableConfiguredCloudResearch: boolean;
  recordActionDiagnostics: boolean;
  recordModelInputs: boolean;
  deduplicatePlannerAliasTools: boolean;
}

export function parseHeadlessEvalCliOptions(
  args: string[],
): HeadlessEvalCliOptions | undefined {
  const options: HeadlessEvalCliOptions = {
    suiteId: "headless-workflows-v2",
    taskIds: [],
    showResponses: false,
    captureSyntheticResponses: false,
    showActionLabels: false,
    enableConfiguredCloudResearch: false,
    recordActionDiagnostics: false,
    recordModelInputs: false,
    deduplicatePlannerAliasTools: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--") continue;
    if (value === "--help" || value === "-h") return undefined;
    if (value === "--show-responses") {
      options.showResponses = true;
      continue;
    }
    if (value === "--capture-synthetic-responses") {
      options.captureSyntheticResponses = true;
      continue;
    }
    if (value === "--show-action-labels") {
      options.showActionLabels = true;
      continue;
    }
    if (value === "--record-action-diagnostics") {
      options.recordActionDiagnostics = true;
      continue;
    }
    if (value === "--record-model-inputs") {
      options.recordModelInputs = true;
      continue;
    }
    if (value === "--enable-configured-cloud-research") {
      options.enableConfiguredCloudResearch = true;
      continue;
    }
    if (value === "--deduplicate-planner-alias-tools") {
      options.deduplicatePlannerAliasTools = true;
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
  if (options.captureSyntheticResponses && options.showResponses) {
    throw new Error(
      "--capture-synthetic-responses cannot be combined with --show-responses.",
    );
  }
  return options;
}
