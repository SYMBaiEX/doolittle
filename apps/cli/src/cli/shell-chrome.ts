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

const ANSI = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
};

function paint(text: string, color: string, enabled: boolean): string {
  return enabled ? `${color}${text}${ANSI.reset}` : text;
}

export function renderPlainBanner(
  context: AppContext,
  state: { activeSessionId: string },
  dependencies?: ShellChromeDependencies,
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const snapshot = buildCliOperatorSnapshot(context, state, dependencies);

  const lines = [
    `┌─ ${theme.sigil} ${context.config.agentName.toUpperCase()} // conversation shell`,
    `│ project   ${snapshot.project}`,
    `│ workspace ${snapshot.workspace}`,
    `│ provider  ${snapshot.providerSummary}`,
    `│ signal    ${theme.label} ${theme.idleFace}   run ${settings.agent.runDepth} cap ${settings.agent.maxIterations}   progress ${settings.agent.toolProgressMode}`,
    `│ startup   ${snapshot.startupSummary}`,
    `│ channels  ${snapshot.transportSummary}`,
    `│ plugins   ${snapshot.pluginSummary}`,
    `│ live      ${snapshot.liveSummary}`,
    `│ session   ${snapshot.sessionLabel}`,
    `└─ ${theme.shellGlyph} terminal-first · cockpit optional · !shell · /help`,
  ];

  if (!output.isTTY) {
    return lines.join("\n");
  }

  return [
    paint(lines[0] ?? "", ANSI.bold + ANSI.magenta, true),
    paint(lines[1] ?? "", ANSI.cyan, true),
    paint(lines[2] ?? "", ANSI.gray, true),
    paint(lines[3] ?? "", ANSI.green, true),
    paint(lines[4] ?? "", ANSI.yellow, true),
    paint(lines[5] ?? "", ANSI.yellow, true),
    paint(lines[6] ?? "", ANSI.cyan, true),
    paint(lines[7] ?? "", ANSI.green, true),
    paint(lines[8] ?? "", ANSI.magenta, true),
    paint(lines[9] ?? "", ANSI.gray, true),
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
  return `${paint(context.config.agentName.toLowerCase(), ANSI.magenta, output.isTTY)}@${paint(currentProjectLabel(), ANSI.cyan, output.isTTY)} ${paint(`${settings.agent.runDepth}/${settings.agent.maxIterations}`, ANSI.gray, output.isTTY)} ${paint(theme.shellGlyph, ANSI.yellow, output.isTTY)} `;
}

export function renderPlainRunLine(detail: string, badge: string): string {
  return `${paint("  •", ANSI.gray, output.isTTY)} ${paint(badge, ANSI.cyan, output.isTTY)} ${sanitizeSingleLineTerminalText(detail)}`;
}

export function currentSessionElapsed(
  context: AppContext,
  sessionId: string,
): string | undefined {
  const run = context.services.runController.getActive(sessionId);
  return run ? formatElapsedMs(getRunElapsedMs(run)) : undefined;
}
