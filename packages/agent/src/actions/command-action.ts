import type {
  Action,
  ActionResult,
  AgentRuntime,
  IAgentRuntime,
  Memory,
  ShortcutDefinition,
} from "@elizaos/core";
import { executeSlashCommand } from "@/runtime/chat";
import { getCommandCatalogEntries } from "@/runtime/command-catalog";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";

export const DOOLITTLE_COMMAND_ACTION = "DOOLITTLE_COMMAND";

const RUNTIME_COMMAND_ROOTS = [
  "/accounts",
  "/acp",
  "/agent",
  "/approvals",
  "/approve",
  "/benchmarks",
  "/browser",
  "/codegen",
  "/commands",
  "/compress",
  "/config",
  "/context",
  "/cron",
  "/delegate",
  "/deny",
  "/doctor",
  "/e2b",
  "/ecosystem",
  "/execution",
  "/experience",
  "/forms",
  "/gateway",
  "/github",
  "/hooks",
  "/insights",
  "/mcp",
  "/media",
  "/memory",
  "/migrate",
  "/migration",
  "/mode",
  "/model",
  "/modeling",
  "/models",
  "/now",
  "/pairing",
  "/pdf",
  "/personality",
  "/plans",
  "/platforms",
  "/plugins",
  "/profiles",
  "/progress",
  "/pulse",
  "/queue",
  "/responses",
  "/resume",
  "/retry",
  "/runtime",
  "/search",
  "/secrets",
  "/services",
  "/session",
  "/sessions",
  "/sethome",
  "/setup",
  "/skills",
  "/status",
  "/system",
  "/terminal",
  "/theme",
  "/title",
  "/todo",
  "/tools",
  "/trajectories",
  "/transport",
  "/undo",
  "/update",
  "/usage",
  "/user",
  "/voice",
  "/workspace",
] as const;

function messageText(message: Memory): string {
  return typeof message.content === "string"
    ? message.content
    : (message.content?.text ?? "");
}

function explicitAlias(command: string): string | undefined {
  const trimmed = command.trim();
  if (!trimmed.startsWith("/")) return undefined;
  const separator = trimmed.indexOf(" ");
  return separator === -1 ? trimmed : trimmed.slice(0, separator);
}

export function commandShortcutAliases(workspaceDir?: string): string[] {
  const aliases = new Set<string>(RUNTIME_COMMAND_ROOTS);
  for (const entry of getCommandCatalogEntries(workspaceDir)) {
    const candidates = [entry.command, ...(entry.aliases ?? [])];
    for (const candidate of candidates) {
      const alias = explicitAlias(candidate);
      if (alias && alias !== "/web") aliases.add(alias);
    }
  }
  return [...aliases].sort();
}

function matchesRegisteredCommandShortcut(
  runtime: IAgentRuntime,
  text: string,
): boolean {
  const shortcutRegistry = (
    runtime as IAgentRuntime & Pick<AgentRuntime, "shortcutRegistry">
  ).shortcutRegistry;
  const match = shortcutRegistry.match(text, {
    actions: runtime.actions.map((action) => action.name),
    allowNatural: false,
  });
  return (
    match?.shortcut.target.kind === "action" &&
    match.shortcut.target.name === DOOLITTLE_COMMAND_ACTION
  );
}

export function createCommandShortcut(
  workspaceDir?: string,
): ShortcutDefinition {
  return {
    id: "doolittle-command-catalog",
    kind: "explicit",
    aliases: commandShortcutAliases(workspaceDir),
    target: { kind: "action", name: DOOLITTLE_COMMAND_ACTION },
    requiresAction: DOOLITTLE_COMMAND_ACTION,
    priority: 50,
  };
}

export function createCommandAction(
  services: AppServices,
  config: EnvConfig,
): Action {
  return {
    name: DOOLITTLE_COMMAND_ACTION,
    description:
      "Executes an explicit Doolittle slash command through the Eliza shortcut and action lifecycle.",
    similes: [],
    validate: async (runtime, message) =>
      matchesRegisteredCommandShortcut(runtime, messageText(message)),
    handler: async (
      runtime,
      message,
      _state,
      _options,
      callback,
    ): Promise<ActionResult> => {
      const response = await executeSlashCommand(
        {
          message: messageText(message),
          userId: String(message.entityId),
          roomId: String(message.roomId),
          source: "api",
        },
        { config, services, runtime },
      );
      if (!response) {
        const text = "The explicit command was not recognized.";
        await callback?.({ text, source: "doolittle-command" });
        return {
          success: false,
          text,
          error: "COMMAND_NOT_FOUND",
        };
      }
      await callback?.({ text: response, source: "doolittle-command" });
      return {
        success: true,
        text: response,
        userFacingText: response,
        verifiedUserFacing: true,
        data: { command: messageText(message) },
      };
    },
  };
}
