import type { CommandCatalogEntry } from "@doolittle/agent/runtime/command-catalog";
import { suggestCommands } from "@doolittle/agent/runtime/command-catalog";
import type { TuiThemeProfile } from "@doolittle/agent/runtime/theme-catalog";
import {
  clipControlDeckText,
  escapeControlDeckBlessed,
  normalizeControlDeckWidth,
  renderControlDeckHeading,
} from "./width";

function renderSuggestionRow(
  entry: CommandCatalogEntry,
  width: number,
): string {
  const compactWidth = width - 2;
  if (width < 32) {
    const command = clipControlDeckText(entry.command, compactWidth);
    return `- {bold}${escapeControlDeckBlessed(command)}{/bold}`;
  }

  const category = ` [${entry.category}]`;
  const bodyWidth = width - 2 - category.length;
  if (bodyWidth < 4) {
    const command = clipControlDeckText(entry.command, compactWidth);
    return `- {bold}${escapeControlDeckBlessed(command)}{/bold}`;
  }

  const preferredCommandWidth = Math.max(6, Math.floor(bodyWidth * 0.5));
  const descriptionIsUseful =
    width >= 44 && bodyWidth - preferredCommandWidth - 1 >= 8;
  const commandWidth = Math.min(
    entry.command.length,
    descriptionIsUseful ? preferredCommandWidth : bodyWidth,
  );
  const command = clipControlDeckText(entry.command, commandWidth);
  const base = `- {bold}${escapeControlDeckBlessed(command)}{/bold}{gray-fg}${category}{/}`;
  if (!descriptionIsUseful) {
    return base;
  }

  const descriptionWidth = bodyWidth - command.length - 1;
  const description = clipControlDeckText(entry.description, descriptionWidth);
  return description
    ? `${base} ${escapeControlDeckBlessed(description)}`
    : base;
}

export function renderSuggestionsContent(
  workspaceDir: string,
  value: string,
  theme: TuiThemeProfile,
  width = 80,
): string {
  const contentWidth = normalizeControlDeckWidth(width);
  const suggestions = suggestCommands(value, 8, workspaceDir);
  const query = clipControlDeckText(
    value || "all",
    contentWidth - "Query: ".length,
  );
  const emptyHint = clipControlDeckText(
    `Try commands like ${theme.sigil} or /help.`,
    contentWidth,
  );

  return [
    renderControlDeckHeading("Commands", "Commands", contentWidth),
    suggestions.length
      ? `Query: {cyan-fg}${escapeControlDeckBlessed(query)}{/}`
      : "{gray-fg}No matching commands yet.{/}",
    "",
    ...(suggestions.length
      ? suggestions.map((entry) => renderSuggestionRow(entry, contentWidth))
      : [`{gray-fg}${escapeControlDeckBlessed(emptyHint)}{/}`]),
  ].join("\n");
}
