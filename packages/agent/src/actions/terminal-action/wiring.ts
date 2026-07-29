import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { buildActionResultData } from "@/runtime/action-result-metadata";
import type { AppServices } from "@/services";
import { executeTerminalCommand } from "./execution";
import { resolveCommandFromParams } from "./parsing";

const ACTION_NAME = "RUN_IN_TERMINAL";
const ACTION_SOURCE = "terminal-action";
const MISSING_COMMAND_RESPONSE =
  "I couldn't determine the terminal command to run. Try `!git status` or say `run `rg TODO` in the terminal`.";

export function createTerminalAction(services: AppServices): Action {
  return {
    name: ACTION_NAME,
    similes: [
      "RUN_COMMAND",
      "EXECUTE_COMMAND",
      "TERMINAL",
      "SHELL",
      "RUN_SHELL",
      "EXEC",
      "CALL_TOOL",
      "CALL_MCP_TOOL",
    ],
    description:
      "Runs a shell command in the local Doolittle terminal. Reserve this for builds, tests, git, package managers, scripts, processes, network checks, and commands that truly need a shell. Use READ_FILE/WRITE_FILE/PATCH_FILE/SEARCH_FILES/CREATE_DIRECTORY for file IO instead of cat, echo heredocs, sed, grep, find, or ls.",
    descriptionCompressed:
      "Run a local shell command for builds, tests, git, scripts, or processes.",
    routingHint:
      "explicit shell, build, test, package-manager, or process request -> RUN_IN_TERMINAL",
    contexts: ["terminal", "code"],
    cacheStable: true,
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const command = resolveCommandFromParams(options?.parameters);

      if (!command) {
        await callback?.({
          text: MISSING_COMMAND_RESPONSE,
          source: ACTION_SOURCE,
        });
        return {
          success: false,
          text: MISSING_COMMAND_RESPONSE,
          userFacingText: MISSING_COMMAND_RESPONSE,
        };
      }

      const result = await executeTerminalCommand(runtime, services, command);
      const response = result.response;

      await callback?.({ text: response, source: ACTION_SOURCE });
      return {
        success: result.exitCode === 0,
        text: response,
        userFacingText: response,
        verifiedUserFacing: true,
        data: buildActionResultData(
          {
            commandResult: {
              command: result.command,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
              executedIn: result.cwd,
              durationMs: result.durationMs,
              success: result.exitCode === 0,
            },
          },
          { command: result.command, exitCode: result.exitCode },
        ),
      };
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: { text: "Run `git status` in the terminal." },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "Ran: git status",
            actions: ["RUN_IN_TERMINAL"],
          },
        },
      ],
    ],
    parameters: [
      {
        name: "command",
        description: "The shell command to run locally.",
        required: true,
        schema: { type: "string" as const },
      },
    ],
  };
}
