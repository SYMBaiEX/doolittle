import { platform } from "node:os";
import { basename, relative } from "node:path";
import { stdout as output } from "node:process";
import type { AppContext } from "@/runtime/bootstrap";
import { canonicalizeSlashCommandSyntax } from "@/runtime/command-catalog";
import { formatElapsedMs, getRunElapsedMs } from "@/runtime/run-progress";
import { getTuiTheme } from "@/runtime/theme-catalog";

const IS_MACOS = platform() === "darwin";

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

export function shortModelId(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    return "unconfigured";
  }
  const segments = normalized.split("/");
  return segments.at(-1) ?? normalized;
}

export function macAwareKeyLabel(label: string): string {
  if (!IS_MACOS) {
    return label;
  }
  return label
    .replaceAll("Alt-", "Option-")
    .replaceAll("Alt", "Option")
    .replaceAll("PageUp/PageDown", "Fn-↑/Fn-↓ or PageUp/PageDown")
    .replaceAll("PgUp/PgDn", "Fn-↑/Fn-↓ or PgUp/PgDn");
}

export function currentWorkspaceLabel(): string {
  const cwd = process.cwd();
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) {
    const rel = relative(home, cwd);
    return rel ? `~/${rel}` : "~";
  }
  return cwd;
}

export function currentProjectLabel(): string {
  return basename(process.cwd()) || currentWorkspaceLabel();
}

export function shortSessionLabel(sessionId: string): string {
  return sessionId.startsWith("cli:")
    ? sessionId.slice(4, 12)
    : sessionId.slice(0, 12);
}

export function renderPlainBanner(
  context: AppContext,
  state: { activeSessionId: string },
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const cwd = currentWorkspaceLabel();
  const project = currentProjectLabel();
  const smallModel =
    settings.model.provider === "elizacloud"
      ? context.config.elizaCloudSmallModel
      : settings.model.model;
  const sessionSummary = context.services.sessions
    .listSessions(20)
    .find((entry) => entry.sessionId === state.activeSessionId);
  const session =
    sessionSummary?.title ?? shortSessionLabel(state.activeSessionId);

  const lines = [
    `┌─ ${theme.sigil} ${context.config.agentName.toUpperCase()} // conversation shell`,
    `│ project   ${project}`,
    `│ workspace ${cwd}`,
    `│ provider  ${settings.model.provider}   fast ${shortModelId(smallModel)}   deep ${shortModelId(settings.model.model)}`,
    `│ signal    ${theme.label} ${theme.idleFace}   run ${settings.agent.runDepth} cap ${settings.agent.maxIterations}   progress ${settings.agent.toolProgressMode}`,
    `│ session   ${session}`,
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
    paint(lines[5] ?? "", ANSI.gray, true),
  ].join("\n");
}

export function renderPlainShellHints(): string {
  return [
    "Talk naturally for paired work, use !cmd for shell execution, or use /slash commands for control-plane actions.",
    `Good first moves: ${canonicalizeSlashCommandSyntax("/status")}, ${canonicalizeSlashCommandSyntax("/mode")}, ${canonicalizeSlashCommandSyntax("/progress")}, ${canonicalizeSlashCommandSyntax("/accounts doctor")}, ${canonicalizeSlashCommandSyntax("/sessions list")}.`,
    'Use "eliza-agent cockpit" when you want the fullscreen operator deck.',
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
  return `${paint("  •", ANSI.gray, output.isTTY)} ${paint(badge, ANSI.cyan, output.isTTY)} ${detail}`;
}

export function currentSessionElapsed(
  context: AppContext,
  sessionId: string,
): string | undefined {
  const run = context.services.runController.getActive(sessionId);
  return run ? formatElapsedMs(getRunElapsedMs(run)) : undefined;
}
