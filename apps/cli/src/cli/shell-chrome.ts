import { stdout as output } from "node:process";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import {
  formatElapsedMs,
  getRunElapsedMs,
} from "@doolittle/agent/runtime/run-progress";
import { getTuiTheme } from "@doolittle/agent/runtime/theme-catalog";
import {
  buildCliOperatorSnapshot,
  type ShellChromeDependencies,
} from "./operator-snapshot";
import { sanitizeSingleLineTerminalText } from "./render-utils";
import { paintText, resolveTerminalColorPolicy } from "./terminal-color";
import { supportsTerminalUnicode, terminalGlyph } from "./terminal-glyphs";
import { currentProjectLabel } from "./terminal-labels";

export {
  buildCliOperatorSnapshot,
  type CliOperatorSnapshot,
} from "./operator-snapshot";
export {
  currentProjectLabel,
  currentWorkspaceLabel,
  macAwareKeyLabel,
  shortModelId,
  shortSessionLabel,
} from "./terminal-labels";

export function renderPlainBanner(
  context: AppContext,
  state: { activeSessionId: string },
  dependencies?: ShellChromeDependencies,
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const snapshot = buildCliOperatorSnapshot(context, state, dependencies);

  const unicodeOk = supportsTerminalUnicode();
  const vertical = terminalGlyph("│", "|", unicodeOk);
  const horizontal = terminalGlyph("─", "-", unicodeOk);
  const separator = terminalGlyph("·", "|", unicodeOk);
  const lines = [
    `${terminalGlyph("┌", "+", unicodeOk)}${horizontal} ${theme.sigil} ${context.config.agentName.toUpperCase()} // conversation shell`,
    `${vertical} project   ${snapshot.project}`,
    `${vertical} workspace ${snapshot.workspace}`,
    `${vertical} provider  ${snapshot.providerSummary}`,
    `${vertical} signal    ${theme.label} ${theme.idleFace}   run ${settings.agent.runDepth} cap ${settings.agent.maxIterations}   progress ${settings.agent.toolProgressMode}`,
    `${vertical} startup   ${snapshot.startupSummary}`,
    `${vertical} channels  ${snapshot.transportSummary}`,
    `${vertical} plugins   ${snapshot.pluginSummary}`,
    `${vertical} live      ${snapshot.liveSummary}`,
    `${vertical} session   ${snapshot.sessionLabel}`,
    `${terminalGlyph("└", "+", unicodeOk)}${horizontal} ${theme.shellGlyph} terminal-first ${separator} cockpit optional ${separator} !shell ${separator} /help`,
  ];

  const policy = resolveTerminalColorPolicy(output);
  if (!policy.enabled) {
    return lines.join("\n");
  }

  return [
    paintText(lines[0] ?? "", "accent", policy, { bold: true }),
    paintText(lines[1] ?? "", "info", policy),
    paintText(lines[2] ?? "", "muted", policy),
    paintText(lines[3] ?? "", "success", policy),
    paintText(lines[4] ?? "", "emphasis", policy),
    paintText(lines[5] ?? "", "emphasis", policy),
    paintText(lines[6] ?? "", "info", policy),
    paintText(lines[7] ?? "", "success", policy),
    paintText(lines[8] ?? "", "accent", policy),
    paintText(lines[9] ?? "", "muted", policy),
    paintText(lines[10] ?? "", "accent", policy, { bold: true }),
  ].join("\n");
}

export function renderPlainShellHints(
  context: AppContext,
  state: { activeSessionId: string },
  dependencies?: ShellChromeDependencies,
): string {
  const snapshot = buildCliOperatorSnapshot(context, state, dependencies);
  return [
    "Talk naturally for paired work, use !cmd for shell execution, or use /slash commands for control-plane actions.",
    snapshot.nextPlainHint,
    "Quick checks outside the shell: doolittle status, doolittle progress, doolittle tools.",
    'Use "doolittle cockpit" when you want the fullscreen operator deck.',
  ].join("\n");
}

export function renderPlainPrompt(
  context: AppContext,
  _state: { activeSessionId: string },
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const policy = resolveTerminalColorPolicy(output);
  return `${paintText(context.config.agentName.toLowerCase(), "accent", policy)}@${paintText(currentProjectLabel(), "info", policy)} ${paintText(`${settings.agent.runDepth}/${settings.agent.maxIterations}`, "muted", policy)} ${paintText(theme.shellGlyph, "emphasis", policy)} `;
}

export function renderPlainRunLine(detail: string, badge: string): string {
  const policy = resolveTerminalColorPolicy(output);
  return `${paintText(`  ${terminalGlyph("•", "-")}`, "muted", policy)} ${paintText(badge, "info", policy)} ${sanitizeSingleLineTerminalText(detail)}`;
}

export function currentSessionElapsed(
  context: AppContext,
  sessionId: string,
): string | undefined {
  const run = context.services.runController.getActive(sessionId);
  return run ? formatElapsedMs(getRunElapsedMs(run)) : undefined;
}
