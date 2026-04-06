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
  return `${agentName} cockpit online. Type /help for shortcuts, or stay in the plain shell for everyday paired work.`;
}

export function buildCockpitTipMessage(): string {
  return `Use ${macAwareKeyLabel("Ctrl-E")} for longform drafts, start a shell action with !, and use ${normalizeSlashCommandSyntax("/theme list")} to shift the operator palette.`;
}

export function buildCockpitWelcomeMessage(): string {
  return `You are live in the Doolittle cockpit.\n\nStay here when you want dialogue plus observability, task supervision, and transport state. Drop back to the plain shell when you want the fastest daily coding loop.\n\nTalk to me normally, run !git status, or check ${normalizeSlashCommandSyntax("/status")}, ${normalizeSlashCommandSyntax("/mode")}, ${normalizeSlashCommandSyntax("/progress")}, ${normalizeSlashCommandSyntax("/accounts")}, or ${normalizeSlashCommandSyntax("/gateway readiness")}.`;
}
