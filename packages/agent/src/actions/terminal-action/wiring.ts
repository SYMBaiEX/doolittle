import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AppServices } from "@/services";
import { executeTerminalCommand } from "./execution";
import { resolveCommandFromParams, resolveCommandFromText } from "./parsing";

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
      "Runs a shell command in the local Doolittle terminal. Use this when the user asks to run, search, inspect, list, or execute something in the terminal.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      return Boolean(
        text &&
          (text.trim().startsWith("!") ||
            text.trim().startsWith("/terminal") ||
            /\b(?:run|execute|exec)\b.+\b(?:terminal|shell)\b/iu.test(text) ||
            /\b(?:run|execute|exec)\b\s+`[^`\n]+`/u.test(text)),
      );
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      const command =
        resolveCommandFromParams(options?.parameters) ??
        resolveCommandFromText(text);

      if (!command) {
        await callback?.({
          text: MISSING_COMMAND_RESPONSE,
          source: ACTION_SOURCE,
        });
        return { success: false, text: MISSING_COMMAND_RESPONSE };
      }

      const result = await executeTerminalCommand(runtime, services, command);
      const response = result.response;

      await callback?.({ text: response, source: ACTION_SOURCE });
      return {
        success: result.exitCode === 0,
        text: response,
        data: { command: result.command, exitCode: result.exitCode },
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
