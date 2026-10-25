import { suggestCommands } from "@doolittle/agent/runtime/command-catalog";
import type { TuiThemeProfile } from "@doolittle/agent/runtime/theme-catalog";
import { escapeBlessed } from "../render-utils";
import { truncate } from "../text-utils";

export function renderSuggestionsContent(
  workspaceDir: string,
  value: string,
  theme: TuiThemeProfile,
): string {
  const suggestions = suggestCommands(value, 8, workspaceDir);

  return [
    "{bold}Commands{/}",
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
