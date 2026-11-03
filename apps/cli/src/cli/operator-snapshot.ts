import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { normalizeSlashCommandSyntax } from "@doolittle/agent/runtime/command-catalog";
import { getNativePluginCatalog } from "@doolittle/agent/runtime/native/plugin-catalog";
import { getNativeTransportControlPlane } from "@doolittle/agent/runtime/native/service-bridge/control-planes";
import {
  currentProjectLabel,
  currentWorkspaceLabel,
  macAwareKeyLabel,
  shortModelId,
  shortSessionLabel,
} from "./terminal-labels";

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
    .filter(
      ([name, phase]) =>
        name !== "runtime" &&
        phase.status !== "ready" &&
        phase.status !== "deferred",
    )
    .map(([name, phase]) => `${name}:${phase.status}`);
  return lagging.length > 0 ? ` · ${lagging.join(" · ")}` : "";
}

function summarizeBackgroundStartup(
  startup: ReturnType<AppContext["services"]["startupState"]["getSnapshot"]>,
): string {
  const backgroundPhases = Object.entries(startup.phases).filter(
    ([name]) => name !== "runtime",
  );
  if (backgroundPhases.some(([, phase]) => phase.status === "error")) {
    return "attention";
  }
  if (startup.deferredReady) {
    return "ready";
  }
  if (backgroundPhases.some(([, phase]) => phase.status === "warming")) {
    return "warming";
  }
  if (backgroundPhases.some(([, phase]) => phase.status === "deferred")) {
    return "queued";
  }
  return "ready";
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

export type ShellChromeDependencies = {
  getNativePluginCatalog: typeof getNativePluginCatalog;
  getNativeTransportControlPlane: typeof getNativeTransportControlPlane;
};

const defaultShellChromeDependencies: ShellChromeDependencies = {
  getNativePluginCatalog,
  getNativeTransportControlPlane,
};

export function buildCliOperatorSnapshot(
  context: AppContext,
  state: { activeSessionId: string },
  dependencies: ShellChromeDependencies = defaultShellChromeDependencies,
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
  const transportControl = dependencies.getNativeTransportControlPlane(
    context.runtime,
    context.config,
    context.services.gatewayConfig,
  );
  const plugins = dependencies.getNativePluginCatalog(context.config);
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
    `${startup.hotPathReady ? "hot-ready" : "warming"} · background ${summarizeBackgroundStartup(startup)}` +
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

  const nextHints = buildNextHints({
    activeRun: Boolean(activeRun),
    hydrating: !startup.deferredReady || !startup.hotPathReady,
    gatewayUnavailable:
      transportControl.totals.gatewayEnabled > 0 &&
      transportControl.totals.operationalTransports === 0,
  });

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
    ...nextHints,
  };
}

function buildNextHints(state: {
  activeRun: boolean;
  hydrating: boolean;
  gatewayUnavailable: boolean;
}): Pick<CliOperatorSnapshot, "nextPlainHint" | "nextCockpitHint"> {
  if (state.activeRun) {
    return {
      nextPlainHint: `Live turn in progress. Check ${normalizeSlashCommandSyntax("/progress")} or let the run finish before starting another deep task.`,
      nextCockpitHint: `${macAwareKeyLabel("Ctrl-S")} focuses the live response. ${normalizeSlashCommandSyntax("/progress")} gives the structured run view.`,
    };
  }
  if (state.hydrating) {
    return {
      nextPlainHint: `Background services are hydrating. Use ${normalizeSlashCommandSyntax("/status")} if you want a readiness check before heavier work.`,
      nextCockpitHint: `Background services are hydrating. Check Status or run ${normalizeSlashCommandSyntax("/status")}.`,
    };
  }
  if (state.gatewayUnavailable) {
    return {
      nextPlainHint: `Gateway is configured but not live yet. Use ${normalizeSlashCommandSyntax("/gateway readiness")} before relying on transports.`,
      nextCockpitHint: `${macAwareKeyLabel("Ctrl-G")} opens gateway detail. ${normalizeSlashCommandSyntax("/gateway readiness")} explains what is missing.`,
    };
  }
  return {
    nextPlainHint: `Daily checks: ${normalizeSlashCommandSyntax("/status")}, ${normalizeSlashCommandSyntax("/commands")}, ${normalizeSlashCommandSyntax("/jobs")}, ${normalizeSlashCommandSyntax("/accounts doctor")}.`,
    nextCockpitHint: `${macAwareKeyLabel("Ctrl-P")} opens the command palette. ${normalizeSlashCommandSyntax("/commands")} shows the full operator catalog.`,
  };
}
