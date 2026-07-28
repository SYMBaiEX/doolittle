import type {
  Action,
  ActionResult,
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

function matchesExplicitAlias(
  text: string,
  aliases: readonly string[],
): boolean {
  const normalized = text.trim().toLowerCase();
  return aliases.some((alias) => {
    const candidate = alias.toLowerCase();
    return (
      normalized === candidate ||
      normalized.startsWith(`${candidate} `) ||
      normalized.startsWith(`${candidate}:`)
    );
  });
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
  const aliases = commandShortcutAliases(config.workspaceDir);
  return {
    name: DOOLITTLE_COMMAND_ACTION,
    description:
      "Executes an explicit Doolittle slash command through the Eliza shortcut and action lifecycle.",
    similes: [],
    validate: async (_runtime, message) =>
      matchesExplicitAlias(messageText(message), aliases),
    handler: async (runtime, message): Promise<ActionResult> => {
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
        return {
          success: false,
          text: "The explicit command was not recognized.",
          error: "COMMAND_NOT_FOUND",
        };
      }
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
