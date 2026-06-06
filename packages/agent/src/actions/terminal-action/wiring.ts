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
import { resolveCommandFromParams, resolveCommandFromText } from "./parsing";

const ACTION_NAME = "RUN_IN_TERMINAL";
const ACTION_SOURCE = "terminal-action";
const MISSING_COMMAND_RESPONSE =
  "I couldn't determine the terminal command to run. Try `!git status` or say `run `rg TODO` in the terminal`.";

const SHELL_TOOL_PATTERN =
  /\b(?:bunx|bun(?:\s+(?:add|install|i|run|x|create|init))?|npx|npm(?:\s+(?:install|i|run|create|init|ci|test|exec))?|pnpm(?:\s+(?:dlx|add|install|i|run|create|exec))?|yarn(?:\s+(?:add|install|create|dlx|run))?|deno(?:\s+(?:run|task|install))?|tsx|ts-node|node(?:\s+\S+)?|cargo(?:\s+(?:new|init|run|build|test|add|install))?|rustup|go(?:\s+(?:build|run|test|get|mod|install))?|pip(?:3)?(?:\s+install)?|poetry|uv(?:\s+(?:pip|venv|run))?|make|cmake|ninja|gradle|gradlew|mvn|docker|docker-compose|podman|kubectl|helm|terraform|ansible|git(?:\s+(?:clone|init|add|commit|push|pull|fetch|status|log|diff|checkout|switch|branch|stash|merge|rebase|reset|tag))?|gh\s+\S+|create-(?:react-app|next-app|vite|tauri-app|t3-app|expo-app|nuxt-app|svelte-app|astro)|vite|next|nuxt|astro|expo|sveltekit|hardhat|forge|anchor|solana(?:\s+\S+)?|spl-token|metaplex|firebase|supabase|vercel|netlify|wrangler|playwright|cypress|vitest|jest|mocha|rg|fd|fzf|jq|curl|wget|sh|bash|zsh|fish|pwsh)\b/iu;

const TERMINAL_VERB_PATTERN =
  /\b(?:run|execute|exec|start|launch|invoke|spawn|fire(?:\s+off)?)\b/iu;

const BUILD_OR_SCAFFOLD_VERB_PATTERN =
  /\b(?:scaffold|bootstrap|build|install|compile|setup|set\s+up|spin\s+up|stand\s+up|initialize|init|generate|deploy|publish|push|pull|test|lint|format)\b/iu;

const SHELL_PATH_PATTERN =
  /(?:\.\/[\w./-]+|~\/[\w./-]+|\$\(|\|\||&&|\bsudo\b)/u;

export function isTerminalIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("!") || trimmed.startsWith("/terminal")) {
    return true;
  }
  if (
    TERMINAL_VERB_PATTERN.test(trimmed) &&
    /\b(?:terminal|shell)\b/iu.test(trimmed)
  ) {
    return true;
  }
  if (/\b(?:run|execute|exec)\b\s+`[^`\n]+`/u.test(trimmed)) {
    return true;
  }
  if (SHELL_TOOL_PATTERN.test(trimmed)) {
    return true;
  }
  if (
    BUILD_OR_SCAFFOLD_VERB_PATTERN.test(trimmed) &&
    SHELL_TOOL_PATTERN.test(trimmed)
  ) {
    return true;
  }
  if (SHELL_PATH_PATTERN.test(trimmed)) {
    return true;
  }
  return false;
}

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
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      return Boolean(text && isTerminalIntent(text));
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
