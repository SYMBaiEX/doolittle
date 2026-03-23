import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { runEffectiveShellCommand } from "@/runtime/native/service-bridge";
import type { AppServices } from "@/services";

type ActionParams = Record<string, unknown>;

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveCommandFromObject(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as ActionParams;

  const direct =
    nonEmptyString(record.command) ??
    nonEmptyString(record.cmd) ??
    nonEmptyString(record.commandLine) ??
    nonEmptyString(record.shellCommand);
  if (direct) {
    return direct;
  }

  const args = record.args;
  if (Array.isArray(args) && args.every((entry) => typeof entry === "string")) {
    const joined = args.join(" ").trim();
    if (joined) {
      return joined;
    }
  }

  return (
    resolveCommandFromObject(record.arguments) ??
    resolveCommandFromObject(record.input) ??
    resolveCommandFromObject(record.parameters)
  );
}

export function resolveCommandFromArguments(
  value: unknown,
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return resolveCommandFromObject(parsed) ?? trimmed;
    } catch {
      return trimmed;
    }
  }
  return resolveCommandFromObject(value);
}

export function resolveCommandFromParams(params: unknown): string | undefined {
  const record = params as ActionParams | undefined;
  if (!record || typeof record !== "object") {
    return undefined;
  }

  return (
    nonEmptyString(record.command) ??
    nonEmptyString(record.cmd) ??
    nonEmptyString(record.commandLine) ??
    nonEmptyString(record.shellCommand) ??
    resolveCommandFromArguments(record.arguments) ??
    resolveCommandFromArguments(record.input) ??
    resolveCommandFromObject(record.parameters)
  );
}

export function resolveCommandFromText(text: unknown): string | undefined {
  const source = nonEmptyString(text);
  if (!source) {
    return undefined;
  }

  const directShell = source.match(/^!(.+)$/u)?.[1]?.trim();
  if (directShell) {
    return directShell;
  }

  const fenced = source.match(/```(?:bash|sh|zsh|shell)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const inline = source.match(/`([^`\n]+)`/u)?.[1]?.trim();
  if (inline) {
    return inline;
  }

  const slashTerminal = source.match(/^\/terminal(?:\s+run)?\s+(.+)$/iu)?.[1];
  if (slashTerminal?.trim()) {
    return slashTerminal.trim();
  }

  const explicitRun = source.match(
    /\b(?:run|execute|exec|search|check|inspect|list|show)\b\s+(?:(?:the|this)\s+)?(?:(?:command|shell command|terminal command)\s+)?["'`]?([^"'`\n]+?)["'`]?(?:\s+(?:in|on)\s+(?:the\s+)?(?:terminal|shell))?$/iu,
  )?.[1];
  if (explicitRun?.trim()) {
    return explicitRun.trim().replace(/[.?!,:;]+$/u, "");
  }

  return undefined;
}

export async function executeTerminalCommand(
  runtime: IAgentRuntime,
  services: AppServices,
  command: string,
): Promise<{
  response: string;
  exitCode: number | undefined;
  command: string;
}> {
  const result = (await runEffectiveShellCommand(
    runtime,
    services,
    command,
  )) as {
    command: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
  };
  const response = [
    `Ran: ${result.command}`,
    `Exit: ${result.exitCode}`,
    result.stdout?.trim() ? `STDOUT:\n${result.stdout.trim()}` : undefined,
    result.stderr?.trim() ? `STDERR:\n${result.stderr.trim()}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    response,
    exitCode: result.exitCode,
    command: result.command,
  };
}

export function createTerminalAction(services: AppServices): Action {
  return {
    name: "RUN_IN_TERMINAL",
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
      "Runs a shell command in the local Eliza Agent terminal. Use this when the user asks to run, search, inspect, list, or execute something in the terminal.",
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
        const response =
          "I couldn't determine the terminal command to run. Try `!git status` or say `run `rg TODO` in the terminal`.";
        await callback?.({ text: response, source: "terminal-action" });
        return { success: false, text: response };
      }

      const result = await executeTerminalCommand(runtime, services, command);
      const response = result.response;

      await callback?.({ text: response, source: "terminal-action" });
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
