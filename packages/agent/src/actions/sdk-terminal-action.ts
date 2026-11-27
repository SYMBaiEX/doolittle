import type { TerminalCommandRecord } from "@doolittle/contracts/execution";
import { terminalAction } from "@elizaos/agent/actions/terminal";
import type { Action, ActionResult } from "@elizaos/core";
import { rememberProjectVerification } from "../runtime/prompt-cache/project-verification";
import { leaseTerminalActionScope } from "../runtime/terminal-action-scope";
import {
  getScopedTurnAbortSignal,
  recordScopedTurnActionResult,
} from "../runtime/turn-runtime-scope";
import { isDesktopWorkspaceRuntime } from "../runtime/workspace-scope";
import type { AppServices } from "../services/index";
import { isRecord } from "../utils/records";

function commandParameter(options: unknown): string | undefined {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return undefined;
  }
  const parameters = (options as { parameters?: unknown }).parameters;
  if (
    !parameters ||
    typeof parameters !== "object" ||
    Array.isArray(parameters)
  ) {
    return undefined;
  }
  const command = (parameters as Record<string, unknown>).command;
  return typeof command === "string" ? command : undefined;
}

/** Resolve SDK results against the matching local host receipt. */
function verifiedLocalRecord(
  result: ActionResult | undefined,
  services: AppServices,
) {
  if (!isRecord(result?.data)) return undefined;
  const data = result.data;
  if (
    typeof data.runId !== "string" ||
    typeof data.command !== "string" ||
    typeof data.exitCode !== "number"
  )
    return undefined;
  return services.terminal
    .recent(100)
    .find(
      (entry) =>
        entry.id === data.runId &&
        entry.command === data.command &&
        entry.exitCode === data.exitCode &&
        entry.backend === "local" &&
        entry.backendMode !== "remote" &&
        entry.backendMode !== "container" &&
        entry.timedOut !== true,
    );
}

function resultWithAccurateExitStatus(
  result: ActionResult | undefined,
): ActionResult | undefined {
  if (!result?.data || typeof result.data !== "object") return result;
  const data = result.data as Record<string, unknown>;
  const exitCode = data.exitCode;
  const timedOut = data.timedOut === true;
  if (!timedOut && (typeof exitCode !== "number" || exitCode === 0))
    return result;
  return {
    ...result,
    success: false,
    error: "SHELL_COMMAND_FAILED",
    text: [
      result.text,
      timedOut
        ? "The command timed out. Its install/build verification is incomplete; inspect the process and output before continuing."
        : `The command exited with status ${exitCode}. Review stderr and correct the cause before continuing.`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Keep Eliza's official terminal action, while adding Doolittle's workspace
 * safety checks and retaining its result for same-turn build/start decisions.
 */
export function createSdkTerminalAction(
  services: AppServices,
  sdkAction: Action = terminalAction,
): Action {
  const sdkHandler = sdkAction.handler;
  return {
    ...sdkAction,
    similes: [...new Set([...(sdkAction.similes ?? []), "SHELL"])],
    description: `${sdkAction.description} Doolittle's parent may also use ${sdkAction.name} for requested install/build verification after a coding delegation, including recovery from a failed worker; keep implementation work delegated. For project builds, stop any managed dev server in that workspace first. Run the build before asking Doolittle to start the managed application.`,
    descriptionCompressed:
      "Run explicit commands or parent install/build verification after coding. Delegate implementation; stop managed dev servers before building.",
    handler: async (runtime, message, state, options) => {
      const command = commandParameter(options);
      const buildConflict = command
        ? services.terminal.preflightProductionBuild(command)
        : undefined;
      let result: ActionResult | undefined;
      if (buildConflict) {
        result = {
          success: false,
          error: "WORKSPACE_BUILD_CONFLICT",
          text: buildConflict,
          data: { actionName: sdkAction.name, command },
        };
      } else {
        let releaseScope: (() => void) | undefined;
        let verifiedTest: TerminalCommandRecord | undefined;
        try {
          if (command && isDesktopWorkspaceRuntime())
            releaseScope = leaseTerminalActionScope(
              command,
              getScopedTurnAbortSignal(runtime),
            );
          result = resultWithAccurateExitStatus(
            await sdkHandler(runtime, message, state, options),
          );
          const record = verifiedLocalRecord(result, services);
          if (result && record) {
            result = {
              ...result,
              data: {
                ...result.data,
                executedIn: record.cwd,
                durationMs: record.durationMs,
              },
            };
            if (result.success && command?.trim() === record.command)
              verifiedTest = record;
          }
        } catch (error) {
          if (getScopedTurnAbortSignal(runtime)?.aborted) throw error;
          result = {
            success: false,
            error: "SHELL_COMMAND_FAILED",
            text: error instanceof Error ? error.message : String(error),
            data: {
              actionName: sdkAction.name,
              ...(command ? { command } : {}),
            },
          };
        } finally {
          releaseScope?.();
        }
        if (verifiedTest)
          await rememberProjectVerification(
            services,
            runtime,
            message,
            verifiedTest,
          );
      }
      if (result) recordScopedTurnActionResult(runtime, result);
      return (
        result ?? {
          success: false,
          error: "SHELL_RESULT_MISSING",
          text: "The shell action returned no result.",
        }
      );
    },
  };
}
