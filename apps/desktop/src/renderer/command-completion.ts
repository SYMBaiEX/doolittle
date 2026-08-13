import {
  filterCommands,
  parseSlashDraft,
  type SlashCommandCatalogItem,
} from "@elizaos/ui/chat/slash-menu";
import type { CommandCatalogItem } from "../shared/contracts";

const MAX_COMMAND_COMPLETIONS = 8;

export function commandCompletionQuery(draft: string): string | null {
  const trimmed = draft.trimStart();
  return trimmed.startsWith("/") ? trimmed : null;
}

export function commandCompletions(
  commands: readonly CommandCatalogItem[],
  draft: string,
  limit = MAX_COMMAND_COMPLETIONS,
): CommandCatalogItem[] {
  const query = commandCompletionQuery(draft);
  if (!query) return [];

  const parsed = parseSlashDraft(query);
  if (!parsed.isSlash) return [];

  // Reuse Eliza's ranked matcher while keeping Doolittle's richer catalog and
  // desktop transport. The upstream React controller talks to /api/commands,
  // so only its pure catalog functions belong in this adapter.
  const entries = commands.map(toSlashCommandCatalogItem);
  const ranked = filterCommands(entries, parsed.commandToken).slice(0, limit);
  const byKey = new Map(commands.map((command) => [command.command, command]));
  return ranked
    .map((entry) => byKey.get(entry.key))
    .filter((entry): entry is CommandCatalogItem => Boolean(entry));
}

/** The canonical text inserted when a catalog item is selected. */
export function commandCompletionText(command: CommandCatalogItem): string {
  const canonical = command.command.trim();
  const placeholder = canonical.search(/\s+[<[]/u);
  if (placeholder >= 0) return `${canonical.slice(0, placeholder)} `;
  return canonical;
}

function withoutArgumentPlaceholders(value: string): string {
  return value.replace(/\s+[<[][^>\]]*[>\]]/gu, "").trim();
}

function argumentNames(value: string): string[] {
  return [...value.matchAll(/(?:<([^>]+)>|\[([^\]]+)\])/gu)].map(
    (match) => match[1] ?? match[2] ?? "argument",
  );
}

function toSlashCommandCatalogItem(
  command: CommandCatalogItem,
): SlashCommandCatalogItem {
  const canonical = withoutArgumentPlaceholders(command.command);
  const aliases = (command.aliases ?? []).map(withoutArgumentPlaceholders);
  const names = [canonical, ...aliases].filter(Boolean);
  const nativeName = canonical.replace(/^\//u, "");
  const args = argumentNames(command.command).map((name) => ({
    name,
    description: `${name} for ${nativeName}`,
  }));
  return {
    key: command.command,
    nativeName,
    description: command.description,
    textAliases: names,
    scope: "text",
    category: command.category,
    acceptsArgs: args.length > 0,
    args,
    requiresAuth: false,
    requiresElevated: false,
    target: { kind: "agent" },
  };
}
