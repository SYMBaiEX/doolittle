import type {
  CodingIteration,
  CommandResult,
  FileOperation,
} from "@doolittle/contracts";
import { validateCodingIteration } from "@doolittle/contracts";
import type { ActionResult, ProviderDataRecord } from "@elizaos/core";
import { asNonEmptyString } from "@elizaos/shared/type-guards";
import type { LocalMutationInput } from "@/services/run-controller-service";
import { isRecord } from "@/utils/records";

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

export function actionResultActionName(
  actionResult: ActionResult | undefined,
): string | undefined {
  const data = actionResult?.data;
  if (!isRecord(data)) {
    return undefined;
  }
  return (
    asNonEmptyString(data.actionName) ?? asNonEmptyString(data.mutationAction)
  );
}

/**
 * Receipt-grade action name: only `mutationAction`, which `buildActionResultData`
 * writes alongside the full `mutation` envelope.
 *
 * Deliberately does NOT fall back to `data.actionName`. That field is synthesized
 * from the tool-call name when an ActionResult is reconstructed from a stream
 * envelope (see chat-turn/provider-streaming.ts), so it can be present on a result
 * that carries no mutation receipt at all. Arming the execution contract from it
 * would create an obligation that is structurally impossible to discharge.
 */
export function actionResultMutationActionName(
  actionResult: ActionResult | undefined,
): string | undefined {
  const data = actionResult?.data;
  return isRecord(data) ? asNonEmptyString(data.mutationAction) : undefined;
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
    asNonEmptyString(mutation.action) ?? actionResultActionName(actionResult);
  const success = booleanValue(mutation.success) ?? actionResult?.success;
  if (!action || typeof success !== "boolean") {
    return undefined;
  }

  return {
    action,
    requestedPath: asNonEmptyString(mutation.requestedPath),
    resolvedPath: asNonEmptyString(mutation.resolvedPath),
    success,
    message: asNonEmptyString(mutation.message) ?? actionResult?.text,
    bytes: numberValue(mutation.bytes),
    replacements: numberValue(mutation.replacements),
  };
}

export function extractVerifiedLocalMutationFromActionResult(
  actionResult: ActionResult | undefined,
): LocalMutationInput | undefined {
  const mutation = extractLocalMutationFromActionResult(actionResult);
  return actionResult?.success === true && mutation?.success === true
    ? mutation
    : undefined;
}

export function extractFileOperationFromActionResult(
  actionResult: ActionResult | undefined,
): FileOperation | undefined {
  const data = actionResult?.data;
  const operation = isRecord(data) ? data.fileOperation : undefined;
  if (!isRecord(operation)) {
    return undefined;
  }
  const type = asNonEmptyString(operation.type);
  const target = asNonEmptyString(operation.target);
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
  const command = asNonEmptyString(commandResult.command);
  const exitCode = numberValue(commandResult.exitCode);
  const executedIn =
    asNonEmptyString(commandResult.executedIn) ??
    asNonEmptyString(commandResult.cwd) ??
    asNonEmptyString(commandResult.workingDirectory) ??
    asNonEmptyString(commandResult.workdir);
  const success = booleanValue(commandResult.success);
  if (!command || typeof exitCode !== "number") {
    return undefined;
  }
  return {
    command,
    exitCode,
    stdout: asNonEmptyString(commandResult.stdout) ?? "",
    stderr: asNonEmptyString(commandResult.stderr) ?? "",
    ...(executedIn ? { executedIn } : {}),
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

  const actionName = asNonEmptyString(data.actionName)?.toUpperCase();
  const looksLikeSdkTerminalResult =
    (actionName === "SHELL" ||
      actionName === "SHELL_COMMAND" ||
      actionName === "RUN_IN_TERMINAL") &&
    asNonEmptyString(data.command) &&
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
  const validation = validateCodingIteration({ ...iteration });
  return validation.ok ? validation.data : iteration;
}
