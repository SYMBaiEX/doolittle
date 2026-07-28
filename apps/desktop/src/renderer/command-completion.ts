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
  const query = commandCompletionQuery(draft)?.toLowerCase();
  if (!query) return [];

  return commands
    .filter((entry) => {
      const aliases = entry.aliases ?? [];
      return [entry.command, ...aliases].some((command) =>
        command.toLowerCase().startsWith(query),
      );
    })
    .slice(0, limit);
}
