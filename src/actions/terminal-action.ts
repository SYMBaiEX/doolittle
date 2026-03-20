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

export function createTerminalAction(services: AppServices): Action {
  return {
    name: "ELIZA_AGENT_TERMINAL",
    similes: ["RUN_COMMAND", "EXECUTE_SHELL", "TERMINAL_HISTORY"],
    description:
      "Runs local shell commands and shows recent command history with `/terminal run` and `/terminal recent`.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      return Boolean(text && text.trim().startsWith("/terminal"));
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      const trimmed = text?.trim() ?? "";
      let response = "";

      if (trimmed === "/terminal" || trimmed === "/terminal recent") {
        const commands = services.terminal.recent(10);
        response = commands.length
          ? commands
              .map(
                (entry) =>
                  `- [${entry.exitCode}] ${entry.command}\n  stdout=${entry.stdout.slice(0, 160) || "(empty)"}\n  stderr=${entry.stderr.slice(0, 160) || "(empty)"}`,
              )
              .join("\n")
          : "No terminal commands recorded.";
      } else if (trimmed.startsWith("/terminal run ")) {
        const command = trimmed.replace("/terminal run ", "").trim();
        if (!command) {
          response = "Usage: /terminal run <command>";
        } else {
          const result = await services.terminal.run(command);
          response = [
            `Command: ${result.command}`,
            `Exit: ${result.exitCode}`,
            `STDOUT:\n${result.stdout || "(empty)"}`,
            `STDERR:\n${result.stderr || "(empty)"}`,
          ].join("\n");
        }
      } else {
        response = "Usage: /terminal recent | /terminal run <command>";
      }

      await callback?.({ text: response, source: "terminal-action" });
      return { success: true, text: response };
    },
  };
}
