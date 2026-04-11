import { escapeBlessed } from "@/cli/render-utils";
import { truncate } from "@/cli/text-utils";
import { suggestCommands } from "@/runtime/command-catalog";
import type { TuiThemeProfile } from "@/runtime/theme-catalog";

export function renderSuggestionsContent(
  workspaceDir: string,
  value: string,
  theme: TuiThemeProfile,
): string {
  const suggestions = suggestCommands(value, 8, workspaceDir);

  return [
    "{bold}Command Suggestions{/}",
    suggestions.length
      ? `Query: {cyan-fg}${escapeBlessed(value || "all")}{/}`
      : "{gray-fg}No matching commands yet.{/}",
    "",
    ...(suggestions.length
      ? suggestions.map(
          (entry) =>
            `- {bold}${escapeBlessed(entry.command)}{/bold} {gray-fg}[${entry.category}]{/} ${escapeBlessed(truncate(entry.description, 64))}`,
        )
      : [
          `{gray-fg}Try commands like{/} {cyan-fg}${escapeBlessed(theme.sigil)}{/} {gray-fg}or{/} {cyan-fg}/help{/}.`,
        ]),
  ].join("\n");
}
