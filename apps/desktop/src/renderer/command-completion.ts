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

  const token = query.slice(1).split(/\s/u, 1)[0].toLowerCase();
  return commands
    .map((command, index) => {
      const names = [command.command, ...(command.aliases ?? [])].map((name) =>
        withoutArgumentPlaceholders(name).replace(/^\//u, "").toLowerCase(),
      );
      const score = token
        ? Math.min(
            ...names.map((name) =>
              name === token
                ? 0
                : name.startsWith(token)
                  ? 1
                  : name.includes(token)
                    ? 2
                    : 3,
            ),
          )
        : 0;
      return { command, index, score };
    })
    .filter((entry) => entry.score < 3)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(
      0,
      Math.max(
        0,
        Math.floor(Number.isFinite(limit) ? limit : MAX_COMMAND_COMPLETIONS),
      ),
    )
    .map((entry) => entry.command);
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
