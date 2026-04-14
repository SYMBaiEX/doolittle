import { getAutonomousControlPlane } from "@/runtime/native/service-bridge/autonomous";
import {
  getEffectiveMemorySnapshot,
  getNativeOwnershipControlPlane,
} from "@/runtime/native/service-bridge/ownership";
import type { ChatTurnRequest } from "@/types/runtime";

import type { AgentExecutionContext } from "../../chat";
import {
  formatExperienceSummary,
  formatMemorySummary,
  formatPersonalitySummary,
  formatRolodexSummary,
} from "../runtime-status-formatters";
import type { RuntimeWorkspaceCommandHandler } from "./types";

function buildCommonStatusLines(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
) {
  const personality = context.services.personalities.getActive();
  const settings = context.services.settings.get();
  const startup = context.services.startupState.getSnapshot();
  const activeRun = context.services.runController.getActive(
    input.roomId ?? `room:${input.userId}`,
  );
  const autonomous = getAutonomousControlPlane(
    context.runtime,
    context.services,
    context.config,
  );
  const ownership =
    context.services.nativeOwnership.controlPlane() ??
    getNativeOwnershipControlPlane(
      context.runtime,
      context.services,
      context.config,
      context.services.gatewayConfig,
    );
  const memorySummary = getEffectiveMemorySnapshot(
    context.runtime,
    context.services,
    "memory",
  );

  return {
    personality,
    settings,
    startup,
    activeRun,
    autonomous,
    ownership,
    memorySummary,
    baseLines: [
      `Agent: ${context.config.agentName}`,
      `Personality: ${personality.name}`,
      `Provider: ${settings.model.provider}`,
      `Model: ${settings.model.model}`,
      `Connection: ${autonomous.alignment.connection.kind}${autonomous.alignment.connection.provider ? ` via ${autonomous.alignment.connection.provider}` : ""}`,
      `Run depth: ${settings.agent.runDepth}`,
      `Run cap: ${settings.agent.maxIterations}`,
      `Tool progress: ${settings.agent.toolProgressMode}`,
      `Startup: hotPath=${startup.hotPathReady ? "ready" : "warming"} deferred=${startup.deferredReady ? "ready" : "warming"}`,
      `Hydration: gateway=${startup.phases.gateway.status} cron=${startup.phases.cron.status} diagnostics=${startup.phases.diagnostics.status} operator=${startup.phases.operator.status} skills=${startup.phases.skills.status}`,
      `Fallback: ${context.config.offlineBootstrapMode ? "offline-bootstrap" : "disabled"}`,
      activeRun
        ? `Observed run: ${activeRun.status} steps=${activeRun.observedActionCount}${activeRun.activeAction ? ` active=${activeRun.activeAction}` : ""}`
        : "Observed run: idle",
      `Transport inventory: ${ownership.transportControl.totals.operationalTransports}/${ownership.transportControl.transportInventory.length} operational`,
      `Gateway bridges: ${ownership.transportControl.totals.liveServices}/${ownership.transportControl.totals.gatewayEnabled} live`,
      `Memory summary: ${formatMemorySummary(memorySummary)}`,
    ],
  };
}

export const handleRuntimeStatusCommand: RuntimeWorkspaceCommandHandler =
  async (input, trimmed, context) => {
    if (trimmed !== "/status") {
      return undefined;
    }

    const status = buildCommonStatusLines(input, context);
    if (!status.ownership.identity) {
      return [
        ...status.baseLines.slice(0, 1),
        `Personality summary: n/a`,
        ...status.baseLines.slice(1),
        `Profiles summary: n/a`,
        `Experience summary: n/a`,
      ].join("\n");
    }

    return [
      ...status.baseLines.slice(0, 1),
      `Personality summary: ${formatPersonalitySummary(status.ownership.identity.personality)}`,
      ...status.baseLines.slice(1),
      `Profiles summary: ${formatRolodexSummary(status.ownership.identity.rolodex)}`,
      `Experience summary: ${formatExperienceSummary(status.ownership.identity.experience)}`,
      `Native ownership: services=${status.ownership.serviceResolution.length} plugins=${status.ownership.pluginManager?.summary.enabled ?? 0}`,
      `Skills: ${context.services.skills.list().length}`,
      `Cron jobs: ${context.services.cron.list().length}`,
      `Gateway sessions: ${context.services.gatewaySessions.list().length}`,
    ].join("\n");
  };
