import { displayCommand } from "@/runtime/commands/command-execution";
import {
  getAutonomousControlPlane,
  getEffectiveMemorySnapshot,
  getNativeOwnershipControlPlane,
  readEffectiveWorkspaceFile,
  searchEffectiveWorkspace,
  writeEffectiveWorkspaceFile,
} from "@/runtime/native/service-bridge/index";
import type {
  ChatTurnRequest,
  MemoryTarget,
  RunDepth,
  ToolProgressMode,
} from "@/types/runtime";
import { RUN_DEPTH_ITERATION_PRESETS } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import {
  formatExperienceSummary,
  formatMemorySummary,
  formatPersonalitySummary,
  formatRolodexSummary,
  formatRunPolicy,
  parseRunDepth,
  parseToolProgressMode,
} from "./runtime-status-formatters";

function getRunPolicy(context: AgentExecutionContext): {
  runDepth: RunDepth;
  maxIterations: number;
  toolProgressMode: ToolProgressMode;
} {
  const agent = context.services.settings.get().agent;
  return {
    runDepth: agent.runDepth,
    maxIterations: agent.maxIterations,
    toolProgressMode: agent.toolProgressMode,
  };
}

export async function handleRuntimeWorkspaceCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed.startsWith("/memory")) {
    const target: MemoryTarget =
      trimmed.includes(" user ") || trimmed.endsWith(" user")
        ? "user"
        : "memory";
    if (
      trimmed === "/memory summary" ||
      trimmed === `/memory summary ${target}`
    ) {
      return JSON.stringify(
        getEffectiveMemorySnapshot(context.runtime, context.services, target),
        null,
        2,
      );
    }
    if (
      trimmed === "/memory" ||
      trimmed === "/memory list" ||
      trimmed === `/memory list ${target}`
    ) {
      return [
        context.services.memory.renderSnapshot(target),
        "",
        `Summary: ${formatMemorySummary(
          getEffectiveMemorySnapshot(context.runtime, context.services, target),
        )}`,
      ].join("\n");
    }
  }

  if (trimmed.startsWith("/queue ")) {
    const objective = trimmed.replace("/queue ", "").trim();
    if (!objective) {
      return "Usage: /queue <prompt>";
    }
    return JSON.stringify(
      context.services.delegation.create({
        title: `Queued prompt ${new Date().toISOString()}`,
        objective,
        group: "queued-prompts",
        profile: "queued",
        priority: "normal",
        labels: ["queue", "prompt"],
        metadata: {
          source: input.source ?? "cli",
          userId: input.userId,
          roomId: input.roomId ?? `room:${input.userId}`,
        },
        executionMode: "local",
      }),
      null,
      2,
    );
  }

  if (trimmed === "/context" || trimmed === "/context files") {
    return context.services.contextFiles.render();
  }

  if (trimmed === "/workspace" || trimmed === "/workspace tree") {
    return context.services.workspace.summary(40);
  }

  if (trimmed.startsWith("/workspace read ")) {
    const path = trimmed.replace("/workspace read ", "").trim();
    return String(
      readEffectiveWorkspaceFile(context.runtime, context.services, path),
    );
  }

  if (trimmed.startsWith("/workspace search ")) {
    const query = trimmed.replace("/workspace search ", "").trim();
    const results = searchEffectiveWorkspace(
      context.runtime,
      context.services,
      query,
      20,
    ) as Array<{
      path: string;
      matches: string[];
    }>;
    return results.length
      ? results
          .map(
            (result) =>
              `${result.path}\n${result.matches.map((line) => `  ${line}`).join("\n")}`,
          )
          .join("\n\n")
      : "No workspace matches found.";
  }

  if (trimmed.startsWith("/workspace write ")) {
    const payload = trimmed.replace("/workspace write ", "");
    const [path, ...contentParts] = payload.split("::");
    const relativePath = path?.trim();
    const content = contentParts.join("::").trim();
    if (!relativePath || !content) {
      return "Usage: /workspace write <path> :: <content>";
    }
    const writtenPath = writeEffectiveWorkspaceFile(
      context.runtime,
      context.services,
      relativePath,
      content,
    );
    return `Wrote ${writtenPath}.`;
  }

  if (trimmed === "/status") {
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
    const controlPlane = ownership.transportControl;
    const memorySummary = getEffectiveMemorySnapshot(
      context.runtime,
      context.services,
      "memory",
    );
    if (!ownership.identity) {
      return [
        `Agent: ${context.config.agentName}`,
        `Personality: ${personality.name}`,
        `Personality summary: n/a`,
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
        `Transport inventory: ${controlPlane.totals.operationalTransports}/${controlPlane.transportInventory.length} operational`,
        `Gateway bridges: ${controlPlane.totals.liveServices}/${controlPlane.totals.gatewayEnabled} live`,
        `Memory summary: ${formatMemorySummary(memorySummary)}`,
        `Profiles summary: n/a`,
        `Experience summary: n/a`,
      ].join("\n");
    }
    const identity = ownership.identity;
    return [
      `Agent: ${context.config.agentName}`,
      `Personality: ${personality.name}`,
      `Personality summary: ${formatPersonalitySummary(identity.personality)}`,
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
      `Transport inventory: ${controlPlane.totals.operationalTransports}/${controlPlane.transportInventory.length} operational`,
      `Gateway bridges: ${controlPlane.totals.liveServices}/${controlPlane.totals.gatewayEnabled} live`,
      `Memory summary: ${formatMemorySummary(memorySummary)}`,
      `Profiles summary: ${formatRolodexSummary(identity.rolodex)}`,
      `Experience summary: ${formatExperienceSummary(identity.experience)}`,
      `Native ownership: services=${ownership.serviceResolution.length} plugins=${ownership.pluginManager?.summary.enabled ?? 0}`,
      `Skills: ${context.services.skills.list().length}`,
      `Cron jobs: ${context.services.cron.list().length}`,
      `Gateway sessions: ${context.services.gatewaySessions.list().length}`,
    ].join("\n");
  }

  if (trimmed === "/mode") {
    const policy = getRunPolicy(context);
    return formatRunPolicy(
      policy.runDepth,
      policy.maxIterations,
      policy.toolProgressMode,
    );
  }

  if (trimmed.startsWith("/mode set ")) {
    const nextDepth = parseRunDepth(trimmed.replace("/mode set ", "").trim());
    if (!nextDepth) {
      return `Usage: ${displayCommand("/mode set <quick|standard|deep|explore>")}`;
    }
    const nextCap = RUN_DEPTH_ITERATION_PRESETS[nextDepth];
    context.services.settings.set("agent.runDepth", nextDepth);
    context.services.settings.set("agent.maxIterations", nextCap);
    const policy = getRunPolicy(context);
    return [
      `Run depth updated to ${nextDepth}.`,
      formatRunPolicy(nextDepth, nextCap, policy.toolProgressMode),
    ].join("\n");
  }

  if (trimmed === "/progress") {
    const policy = getRunPolicy(context);
    return formatRunPolicy(
      policy.runDepth,
      policy.maxIterations,
      policy.toolProgressMode,
    );
  }

  if (trimmed.startsWith("/progress set ")) {
    const nextMode = parseToolProgressMode(
      trimmed.replace("/progress set ", "").trim(),
    );
    if (!nextMode) {
      return `Usage: ${displayCommand("/progress set <off|new|all|verbose>")}`;
    }
    context.services.settings.set("agent.toolProgressMode", nextMode);
    const policy = getRunPolicy(context);
    return [
      `Tool progress updated to ${nextMode}.`,
      formatRunPolicy(
        policy.runDepth,
        policy.maxIterations,
        policy.toolProgressMode,
      ),
    ].join("\n");
  }

  return undefined;
}
