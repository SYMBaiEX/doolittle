import { normalizeSlashCommandSyntax } from "@doolittle/agent/runtime/command-catalog";
import type { TuiThemeProfile } from "@doolittle/agent/runtime/theme-catalog";
import { escapeBlessed } from "./render-utils";
import { currentProjectLabel, macAwareKeyLabel } from "./terminal-labels";

export function buildHeaderContent(
  agentName: string,
  theme: TuiThemeProfile,
): string {
  // The header renders on the theme.primary surface. Every span inherits the
  // contrast-derived base foreground (see applyTuiTheme/createHeader); adding
  // hardcoded color tags here would bypass the WCAG ladder, since the catalog
  // spans near-black to near-white primaries. Hierarchy comes from bold, not
  // from chromatic accents that cannot survive every theme.
  return [
    `{bold}${escapeBlessed(theme.sigil)} ${agentName}{/bold}  ${escapeBlessed(theme.shellGlyph)} conversation shell  ${escapeBlessed(currentProjectLabel())}`,
    `{bold}${theme.label}{/bold} ${escapeBlessed(theme.idleFace)} · ${escapeBlessed(theme.tagline)} · cockpit for observability · shell for everyday work`,
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
