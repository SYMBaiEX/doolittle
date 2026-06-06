import type {
  CodingIteration,
  CommandResult,
  FileOperation,
} from "@elizaos/autonomous/services/coding-agent-context";
import { validateCodingIteration } from "@elizaos/autonomous/services/coding-agent-context";
import type { ActionResult, ProviderDataRecord } from "@elizaos/core";
import type { LocalMutationInput } from "@/services/run-controller-service";

type RecordLike = Record<string, unknown>;
type CommandResultSource = RecordLike & { command: unknown; exitCode: unknown };

export interface ActionResultMetadata {
  mutation?: LocalMutationInput;
  fileOperation?: FileOperation;
  commandResult?: CommandResult;
}

export interface ActionResultSummary {
  actionResults: ActionResult[];
  observedActionCount: number;
  localMutations: LocalMutationInput[];
  fileOperations: FileOperation[];
  commandResults: CommandResult[];
}

export interface BuildCodingIterationOptions {
  index?: number;
  startedAt?: number;
  completedAt?: number;
  summary?: string;
}

function isRecord(value: unknown): value is RecordLike {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function buildActionResultData(
  metadata: ActionResultMetadata,
  extra: ProviderDataRecord = {},
): ProviderDataRecord {
  const data: ProviderDataRecord = {
    ...extra,
    ...(metadata.mutation
      ? {
          mutationKind: "local-file",
          mutationAction: metadata.mutation.action,
          mutation: metadata.mutation,
        }
      : {}),
    ...(metadata.fileOperation
      ? { fileOperation: metadata.fileOperation }
      : {}),
    ...(metadata.commandResult
      ? { commandResult: metadata.commandResult }
      : {}),
  };
  return data;
}

export function extractLocalMutationFromActionResult(
  actionResult: ActionResult | undefined,
): LocalMutationInput | undefined {
  const data = actionResult?.data;
  if (!isRecord(data) || data.mutationKind !== "local-file") {
    return undefined;
  }
  const mutation = data.mutation;
  if (!isRecord(mutation)) {
    return undefined;
  }

  const action =
    stringValue(mutation.action) ??
    stringValue(data.mutationAction) ??
    stringValue(data.actionName);
  const success = booleanValue(mutation.success) ?? actionResult?.success;
  if (!action || typeof success !== "boolean") {
    return undefined;
  }

  return {
    action,
    requestedPath: stringValue(mutation.requestedPath),
    resolvedPath: stringValue(mutation.resolvedPath),
    success,
    message: stringValue(mutation.message) ?? actionResult?.text,
    bytes: numberValue(mutation.bytes),
    replacements: numberValue(mutation.replacements),
  };
}

export function extractFileOperationFromActionResult(
  actionResult: ActionResult | undefined,
): FileOperation | undefined {
  const data = actionResult?.data;
  const operation = isRecord(data) ? data.fileOperation : undefined;
  if (!isRecord(operation)) {
    return undefined;
  }
  const type = stringValue(operation.type);
  const target = stringValue(operation.target);
  if (
    !target ||
    (type !== "read" &&
      type !== "write" &&
      type !== "edit" &&
      type !== "list" &&
      type !== "search")
  ) {
    return undefined;
  }
  return {
    type,
    target,
    size: numberValue(operation.size),
  };
}

export function extractCommandResultFromActionResult(
  actionResult: ActionResult | undefined,
): CommandResult | undefined {
  const data = actionResult?.data;
  const commandResult = resolveCommandResultSource(data);
  if (!commandResult) {
    return undefined;
  }
  const command = stringValue(commandResult.command);
  const exitCode = numberValue(commandResult.exitCode);
  const executedIn =
    stringValue(commandResult.executedIn) ??
    stringValue(commandResult.cwd) ??
    stringValue(commandResult.workingDirectory) ??
    stringValue(commandResult.workdir);
  const success = booleanValue(commandResult.success);
  if (!command || typeof exitCode !== "number" || !executedIn) {
    return undefined;
  }
  return {
    command,
    exitCode,
    stdout: stringValue(commandResult.stdout) ?? "",
    stderr: stringValue(commandResult.stderr) ?? "",
    executedIn,
    durationMs: numberValue(commandResult.durationMs),
    success: success ?? actionResult?.success !== false,
  };
}

function resolveCommandResultSource(
  data: ActionResult["data"] | undefined,
): CommandResultSource | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  if (isRecord(data.commandResult)) {
    return data.commandResult as CommandResultSource;
  }

  const actionName = stringValue(data.actionName)?.toUpperCase();
  const looksLikeSdkTerminalResult =
    (actionName === "SHELL_COMMAND" || actionName === "RUN_IN_TERMINAL") &&
    stringValue(data.command) &&
    typeof numberValue(data.exitCode) === "number";
  return looksLikeSdkTerminalResult ? (data as CommandResultSource) : undefined;
}

export function summarizeActionResults(
  actionResults: ActionResult[] | undefined,
): ActionResultSummary {
  const results = actionResults ?? [];
  return {
    actionResults: results,
    observedActionCount: results.length,
    localMutations: results.flatMap((result) => {
      const mutation = extractLocalMutationFromActionResult(result);
      return mutation ? [mutation] : [];
    }),
    fileOperations: results.flatMap((result) => {
      const operation = extractFileOperationFromActionResult(result);
      return operation ? [operation] : [];
    }),
    commandResults: results.flatMap((result) => {
      const commandResult = extractCommandResultFromActionResult(result);
      return commandResult ? [commandResult] : [];
    }),
  };
}

export function buildCodingIterationFromActionResults(
  actionResults: ActionResult[] | undefined,
  options: BuildCodingIterationOptions = {},
): CodingIteration | undefined {
  const summary = summarizeActionResults(actionResults);
  if (
    summary.actionResults.length === 0 &&
    summary.fileOperations.length === 0 &&
    summary.commandResults.length === 0
  ) {
    return undefined;
  }

  const now = Date.now();
  const iteration: CodingIteration = {
    index: options.index ?? 0,
    startedAt: options.startedAt ?? now,
    completedAt: options.completedAt ?? now,
    fileOperations: summary.fileOperations,
    commandResults: summary.commandResults,
    errors: summary.actionResults
      .filter((result) => result.success === false)
      .map((result) => ({
        category: "other",
        message:
          typeof result.error === "string"
            ? result.error
            : result.error instanceof Error
              ? result.error.message
              : result.text || "Action failed",
        raw: result.text,
      })),
    feedback: [],
    selfCorrected: false,
    summary:
      options.summary ??
      `Observed ${summary.actionResults.length} action result(s), ${summary.fileOperations.length} file operation(s), and ${summary.commandResults.length} command result(s).`,
  };
  const validation = validateCodingIteration(
    iteration as unknown as Record<string, unknown>,
  );
  return validation.ok ? validation.data : iteration;
}
