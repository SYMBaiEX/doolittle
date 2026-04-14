import { platform } from "node:os";
import { basename, relative } from "node:path";
import { stdout as output } from "node:process";
import { sanitizeSingleLineTerminalText } from "@/cli/render-utils";
import type { AppContext } from "@/runtime/bootstrap";
import { normalizeSlashCommandSyntax } from "@/runtime/command-catalog";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/control-planes";
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

function truncateInline(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function summarizeLaggingStartupPhases(
  startup: ReturnType<AppContext["services"]["startupState"]["getSnapshot"]>,
): string {
  const lagging = Object.entries(startup.phases)
    .filter(([, phase]) => phase.status !== "ready")
    .map(([name, phase]) => `${name}:${phase.status}`);
  return lagging.length > 0 ? ` · ${lagging.join(" · ")}` : "";
}

export interface CliOperatorSnapshot {
  project: string;
  workspace: string;
  sessionLabel: string;
  providerSummary: string;
  startupSummary: string;
  transportSummary: string;
  pluginSummary: string;
  liveSummary: string;
  nextPlainHint: string;
  nextCockpitHint: string;
}

export function buildCliOperatorSnapshot(
  context: AppContext,
  state: { activeSessionId: string },
): CliOperatorSnapshot {
  const settings = context.services.settings.get();
  const startup = context.services.startupState.getSnapshot();
  const activeRun = context.services.runController.getActive(
    state.activeSessionId,
  );
  const sessions = context.services.sessions.listSessions(20);
  const sessionSummary = sessions.find(
    (entry) => entry.sessionId === state.activeSessionId,
  );
  const transportControl = getNativeTransportControlPlane(
    context.runtime,
    context.config,
    context.services.gatewayConfig,
  );
  const plugins = getNativePluginCatalog(context.config);
  const enabledPlugins = plugins.filter((entry) => entry.enabled);
  const productionPlugins = enabledPlugins.filter(
    (entry) => entry.maturity === "production",
  ).length;
  const alphaPlugins = enabledPlugins.filter(
    (entry) => entry.maturity === "alpha",
  ).length;
  const experimentalPlugins = enabledPlugins.filter(
    (entry) => entry.maturity === "experimental",
  ).length;

  const project = currentProjectLabel();
  const workspace = currentWorkspaceLabel();
  const smallModel =
    settings.model.provider === "elizacloud"
      ? context.config.elizaCloudSmallModel
      : settings.model.model;

  const liveSummary = activeRun
    ? [
        activeRun.status,
        `${activeRun.observedActionCount} steps`,
        activeRun.activeAction
          ? truncateInline(activeRun.activeAction, 28)
          : activeRun.statusDetail
            ? truncateInline(activeRun.statusDetail, 28)
            : null,
      ]
        .filter((entry) => Boolean(entry))
        .join(" · ")
    : "idle";

  const startupSummary =
    `${startup.hotPathReady ? "hot-ready" : "warming"} · deferred ${startup.deferredReady ? "ready" : "warming"}` +
    summarizeLaggingStartupPhases(startup);
  const transportSummary = `live ${transportControl.totals.liveServices} · ready ${transportControl.totals.operationalTransports} · configured ${transportControl.totals.gatewayEnabled}`;
  const pluginSummary = [
    `enabled ${enabledPlugins.length}/${plugins.length}`,
    productionPlugins > 0 ? `prod ${productionPlugins}` : null,
    alphaPlugins > 0 ? `alpha ${alphaPlugins}` : null,
    experimentalPlugins > 0 ? `exp ${experimentalPlugins}` : null,
  ]
    .filter((entry) => Boolean(entry))
    .join(" · ");

  const nextPlainHint = activeRun
    ? `Live turn in progress. Check ${normalizeSlashCommandSyntax("/progress")} or let the run finish before starting another deep task.`
    : !startup.deferredReady || !startup.hotPathReady
      ? `Startup is still warming. Use ${normalizeSlashCommandSyntax("/status")} if you want a readiness check before heavier work.`
      : transportControl.totals.gatewayEnabled > 0 &&
          transportControl.totals.operationalTransports === 0
        ? `Gateway is configured but not live yet. Use ${normalizeSlashCommandSyntax("/gateway readiness")} before relying on transports.`
        : `Daily checks: ${normalizeSlashCommandSyntax("/status")}, ${normalizeSlashCommandSyntax("/commands")}, ${normalizeSlashCommandSyntax("/jobs")}, ${normalizeSlashCommandSyntax("/accounts doctor")}.`;
  const nextCockpitHint = activeRun
    ? `${macAwareKeyLabel("Ctrl-S")} focuses the live response. ${normalizeSlashCommandSyntax("/progress")} gives the structured run view.`
    : !startup.deferredReady || !startup.hotPathReady
      ? `Hydration is still warming. Stay on the signal rail or run ${normalizeSlashCommandSyntax("/status")}.`
      : transportControl.totals.gatewayEnabled > 0 &&
          transportControl.totals.operationalTransports === 0
        ? `${macAwareKeyLabel("Ctrl-G")} opens gateway detail. ${normalizeSlashCommandSyntax("/gateway readiness")} explains what is missing.`
        : `${macAwareKeyLabel("Ctrl-P")} opens the command palette. ${normalizeSlashCommandSyntax("/commands")} shows the full operator catalog.`;

  return {
    project,
    workspace,
    sessionLabel:
      sessionSummary?.title ?? shortSessionLabel(state.activeSessionId),
    providerSummary: `${settings.model.provider}   fast ${shortModelId(smallModel)}   deep ${shortModelId(settings.model.model)}`,
    startupSummary,
    transportSummary,
    pluginSummary,
    liveSummary,
    nextPlainHint,
    nextCockpitHint,
  };
}

export function renderPlainBanner(
  context: AppContext,
  state: { activeSessionId: string },
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const snapshot = buildCliOperatorSnapshot(context, state);

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
): string {
  const snapshot = buildCliOperatorSnapshot(context, state);
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
