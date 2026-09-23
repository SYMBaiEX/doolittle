import { terminalAction } from "@elizaos/agent/actions/terminal";
import type { Action, ActionResult } from "@elizaos/core";
import {
  getScopedTurnAbortSignal,
  recordScopedTurnActionResult,
} from "@/runtime/turn-runtime-scope";
import type { AppServices } from "@/services";

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

function resultWithAccurateExitStatus(
  result: ActionResult | undefined,
): ActionResult | undefined {
  if (!result?.data || typeof result.data !== "object") return result;
  const data = result.data as Record<string, unknown>;
  const exitCode = data.exitCode;
  if (typeof exitCode !== "number" || exitCode === 0) return result;
  return {
    ...result,
    success: false,
    error: "SHELL_COMMAND_FAILED",
    text: [
      result.text,
      `The command exited with status ${exitCode}. Review stderr and correct the cause before continuing.`,
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
    description: `${sdkAction.description} For project builds, stop any managed dev server in that workspace first. Run the build before asking Doolittle to start the managed application.`,
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
          data: { actionName: "SHELL", command },
        };
      } else {
        try {
          result = resultWithAccurateExitStatus(
            await sdkHandler(runtime, message, state, options),
          );
        } catch (error) {
          if (getScopedTurnAbortSignal(runtime)?.aborted) throw error;
          result = {
            success: false,
            error: "SHELL_COMMAND_FAILED",
            text: error instanceof Error ? error.message : String(error),
            data: { actionName: "SHELL", ...(command ? { command } : {}) },
          };
        }
      }
      if (result) recordScopedTurnActionResult(runtime, result);
      return result;
    },
  };
}
