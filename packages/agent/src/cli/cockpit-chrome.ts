import { escapeBlessed } from "@/cli/render-utils";
import { currentProjectLabel, macAwareKeyLabel } from "@/cli/shell-chrome";
import { normalizeSlashCommandSyntax } from "@/runtime/command-catalog";
import type { TuiThemeProfile } from "@/runtime/theme-catalog";

export function buildHeaderContent(
  agentName: string,
  theme: TuiThemeProfile,
): string {
  return [
    `{bold}${escapeBlessed(theme.sigil)} ${agentName}{/bold}  {black-fg}${escapeBlessed(theme.shellGlyph)} conversation shell{/}  {white-fg}${escapeBlessed(currentProjectLabel())}{/}`,
    `{white-fg}${theme.label}{/} ${escapeBlessed(theme.idleFace)} · {gray-fg}${escapeBlessed(theme.tagline)}{/} · {cyan-fg}cockpit for observability{/} · {green-fg}shell for everyday work{/}`,
  ].join("\n");
}

export function buildCockpitBootMessage(agentName: string): string {
  return `${agentName} is ready. Type /help for shortcuts, or stay in the plain shell for everyday paired work.`;
}

export function buildCockpitTipMessage(): string {
  return `Use ${macAwareKeyLabel("Ctrl-E")} for multiline input, start a shell action with !, and use ${normalizeSlashCommandSyntax("/theme list")} to change the theme.`;
}

export function buildCockpitWelcomeMessage(): string {
  return `Doolittle is ready.\n\nUse this view for conversation, task progress, and transport status. Use the plain shell for the fastest daily coding loop.\n\nTalk to me normally, run !git status, or check ${normalizeSlashCommandSyntax("/status")}, ${normalizeSlashCommandSyntax("/mode")}, ${normalizeSlashCommandSyntax("/progress")}, ${normalizeSlashCommandSyntax("/accounts")}, or ${normalizeSlashCommandSyntax("/gateway readiness")}.`;
}
