import { runStatusFace } from "@/cli/activity-chrome";
import type { CliState } from "@/cli/execution";
import { escapeBlessed } from "@/cli/render-utils";
import { macAwareKeyLabel, shortModelId } from "@/cli/shell-chrome";
import { truncate } from "@/cli/text-utils";
import type { AppContext } from "@/runtime/bootstrap";
import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog/index";
import {
  getAutonomousControlPlane,
  getNativeTransportControlPlane,
} from "@/runtime/native/service-bridge/index";
import { formatElapsedMs, getRunElapsedMs } from "@/runtime/run-progress";
import { getTuiTheme } from "@/runtime/theme-catalog";

export function renderStatusContent(
  context: AppContext,
  state: CliState,
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  const activeRun = context.services.runController.getActive(
    state.activeSessionId,
  );
  const plugins = getNativePluginCatalog(context.config);
  const audit = getNativePackageAudit(context.config);
  const sessions = context.services.sessions.listSessions(6);
  const delegation = context.services.delegation.overview();
  const gatewaySessions = context.services.gatewaySessions.list();
  const transportControl = getNativeTransportControlPlane(
    context.runtime,
    context.config,
    context.services.gatewayConfig,
  );
  const autonomousControl = getAutonomousControlPlane(
    context.runtime,
    context.services,
    context.config,
  );
  const startup = context.services.startupState.getSnapshot();
  const active = sessions.find(
    (entry) => entry.sessionId === state.activeSessionId,
  );

  return [
    "{bold}Signal Rail{/}",
    `{gray-fg}${escapeBlessed(theme.sigil)} ${escapeBlessed(theme.label)} ${escapeBlessed(runStatusFace(theme, activeRun?.status))}{/}`,
    `{cyan-fg}${settings.model.provider}{/} · {cyan-fg}${escapeBlessed(settings.model.model)}{/}`,
    `${escapeBlessed(autonomousControl.alignment.connection.kind)}${autonomousControl.alignment.connection.provider ? ` via ${escapeBlessed(autonomousControl.alignment.connection.provider)}` : ""}`,
    `startup ${startup.hotPathReady ? "hot-ready" : "warming"} · deferred ${startup.deferredReady ? "ready" : "warming"}`,
    `run ${settings.agent.runDepth} · cap ${settings.agent.maxIterations} · progress ${settings.agent.toolProgressMode}`,
    activeRun
      ? (() => {
          const elapsed = formatElapsedMs(getRunElapsedMs(activeRun));
          const tail = activeRun.activeAction
            ? ` · ${escapeBlessed(truncate(activeRun.activeAction, 26))}`
            : activeRun.statusDetail
              ? ` · ${escapeBlessed(truncate(activeRun.statusDetail, 26))}`
              : "";
          return `live ${activeRun.status}${elapsed ? ` · ${escapeBlessed(elapsed)}` : ""} · ${activeRun.observedActionCount} steps${tail}`;
        })()
      : "{gray-fg}live idle{/}",
    `hydration gw:${startup.phases.gateway.status} cron:${startup.phases.cron.status} diag:${startup.phases.diagnostics.status} skills:${startup.phases.skills.status}`,
    `channels live=${transportControl.totals.liveServices} configured=${transportControl.totals.gatewayEnabled} ready=${transportControl.totals.operationalTransports}`,
    `delegation ${delegation.running}/${delegation.pending}/${delegation.completed} · workers ${delegation.activeWorkers}`,
    `gateway sessions ${gatewaySessions.length} · voice ${gatewaySessions.filter((entry) => entry.voiceMode).length}`,
    active?.title
      ? `session ${truncate(active.title, 28)}`
      : `session ${state.activeSessionId}`,
    "",
    "{bold}Live Notices{/}",
    ...(state.notices.length
      ? state.notices.slice(0, 3).map((entry) => {
          const accent =
            entry.kind === "context"
              ? "{yellow-fg}CTX{/}"
              : entry.kind === "skills"
                ? "{magenta-fg}SKL{/}"
                : "{cyan-fg}SYS{/}";
          return `${accent} {gray-fg}${escapeBlessed(entry.at)}{/} ${escapeBlessed(truncate(entry.message, 84))}`;
        })
      : ["{gray-fg}No active notices.{/}"]),
    "",
    "{gray-fg}plugins{/}: enabled=" +
      `${plugins.filter((entry) => entry.enabled).length}/${plugins.length}` +
      ` · alpha=${audit.runtime.alpha}`,
    "",
    "{bold}Recent Sessions{/}",
    ...sessions.slice(0, 4).map((entry) => {
      const marker = entry.sessionId === state.activeSessionId ? "*" : "-";
      return `${marker} ${truncate(entry.title ?? entry.sessionId, 26)}`;
    }),
  ].join("\n");
}

export function renderFooter(
  context: AppContext,
  busy: boolean,
  queueDepth: number,
  hint = "Esc input",
  busyFrame = "•",
): string {
  const settings = context.services.settings.get();
  const theme = getTuiTheme(settings.ui.theme);
  return [
    `${theme.sigil} ${context.config.agentName} // cockpit`,
    busy
      ? `{yellow-fg}${escapeBlessed(busyFrame)} processing{/}`
      : `{green-fg}${escapeBlessed(theme.idleFace)} ready{/}`,
    queueDepth > 0 ? `{cyan-fg}queue:${queueDepth}{/}` : "{gray-fg}queue:0{/}",
    `{cyan-fg}${escapeBlessed(shortModelId(settings.model.model))}{/}`,
    `{yellow-fg}${escapeBlessed(String(settings.agent.runDepth))}{/}`,
    `cap:${settings.agent.maxIterations}`,
    `prog:${escapeBlessed(settings.agent.toolProgressMode)}`,
    "{magenta-fg}Tab{/} cycle",
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-P"))}{/} commands`,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-E"))}{/} draft`,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-O"))}{/} activity`,
    "{cyan-fg}!cmd{/} shell",
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-T"))}{/} theme`,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Alt-1..4"))}{/} decks`,
    hint,
    `{cyan-fg}${escapeBlessed(macAwareKeyLabel("Ctrl-Q"))}{/} quit`,
  ].join("  |  ");
}
