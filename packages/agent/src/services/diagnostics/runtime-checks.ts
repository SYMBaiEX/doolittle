import type { DiagnosticCheck, EnvConfig } from "@/types";

interface DiagnosticsExecutionControlLike {
  approvals: {
    available: boolean;
    asyncRequest: boolean;
    selectionHandling: boolean;
  };
  agentEvents: {
    available: boolean;
    heartbeat: boolean;
    lastHeartbeatStatus?: string | null;
  };
  toolPolicy: {
    available: boolean;
    actions: number;
    codingAllowed: number;
    messagingAllowed: number;
    fullAllowed: number;
  };
}

interface DiagnosticsIntegrationControlLike {
  browser: {
    source: string;
  };
  mcp: {
    source: string;
    cachedTools: unknown[];
  };
}

interface DiagnosticsAutonomousConnectionLike {
  configured: boolean;
  kind: string;
  source: string;
  detail: string;
}

interface DiagnosticsStartupSnapshotLike {
  hotPathReady: boolean;
  deferredReady: boolean;
  phases: {
    runtime: { status: string };
    gateway: { status: string };
    cron: { status: string };
    diagnostics: { status: string };
    operator: { status: string };
    ecosystem: { status: string };
    skills: { status: string };
  };
}

export function buildDiagnosticsExecutionChecks(input: {
  config: EnvConfig;
  runtimeExecutionControl?: DiagnosticsExecutionControlLike;
  integrationControl?: DiagnosticsIntegrationControlLike;
  agentEventBridgeAttached: boolean;
}): DiagnosticCheck[] {
  const {
    config,
    runtimeExecutionControl,
    integrationControl,
    agentEventBridgeAttached,
  } = input;
  const checks: DiagnosticCheck[] = [
    {
      id: "execution.remote.sync",
      status: config.remoteSyncInclude.length > 0 ? "pass" : "warn",
      summary: "Remote workspace sync planning",
      detail: `Mode=${config.remoteSyncMode}; include=${config.remoteSyncInclude.join(", ") || "none"}; exclude=${config.remoteSyncExclude.join(", ") || "none"}; workspace label=${config.remoteWorkspaceLabel}.`,
    },
    {
      id: "execution.remote.artifacts",
      status: config.remoteArtifactPaths.length > 0 ? "pass" : "warn",
      summary: "Remote artifact policy",
      detail: `Policy=${config.remoteArtifactPolicy}; artifact paths=${config.remoteArtifactPaths.join(", ") || "none"}; snapshots persist metadata only.`,
    },
    {
      id: "mcp.bridge",
      status: config.mcpServerCommand ? "pass" : "warn",
      summary: "MCP bridge configuration",
      detail: config.mcpServerCommand
        ? `MCP bridge command configured: ${config.mcpServerCommand}`
        : "MCP_SERVER_COMMAND is not configured.",
    },
    {
      id: "acp.bridge",
      status: config.acpServerCommand ? "pass" : "warn",
      summary: "ACP bridge configuration",
      detail: config.acpServerCommand
        ? `ACP bridge command configured: ${config.acpServerCommand}`
        : "ACP_SERVER_COMMAND is not configured.",
    },
    {
      id: "execution.backends",
      status: "pass",
      summary: "Execution backend model",
      detail: `Execution layer supports ${config.executionBackend} as the active backend with timeout=${config.executionCommandTimeoutMs}ms and health timeout=${config.executionHealthTimeoutMs}ms.`,
    },
    {
      id: "daytona.readiness",
      status:
        config.executionBackend === "daytona" && !config.daytonaTarget
          ? "fail"
          : config.daytonaTarget
            ? "pass"
            : "warn",
      summary: "Daytona execution readiness",
      detail: config.daytonaTarget
        ? `Daytona sandbox target configured: ${config.daytonaTarget}. Shell=${config.daytonaCommand || "daytona"} ${config.daytonaShell || "/bin/sh"} workspace=${config.daytonaWorkspacePath || "/workspace"}${config.daytonaSnapshot ? ` snapshot=${config.daytonaSnapshot}` : ""}.`
        : "DOOLITTLE_DAYTONA_TARGET is not configured.",
    },
    {
      id: "daytona.shell",
      status: config.daytonaShell ? "pass" : "warn",
      summary: "Daytona shell strategy",
      detail: config.daytonaShell
        ? `Daytona commands execute through ${config.daytonaShell} with an info probe and exec path.`
        : "Daytona shell strategy is not configured.",
    },
    {
      id: "daytona.snapshot",
      status: config.daytonaSnapshot ? "pass" : "warn",
      summary: "Daytona snapshot reference",
      detail: config.daytonaSnapshot
        ? `Daytona snapshot configured: ${config.daytonaSnapshot}.`
        : "No Daytona snapshot reference configured; the backend will use the live sandbox target.",
    },
    {
      id: "daytona.inspect",
      status: config.daytonaInspectCommand ? "pass" : "warn",
      summary: "Daytona inspect command",
      detail: config.daytonaInspectCommand
        ? `Daytona inspect command configured: ${config.daytonaInspectCommand}.`
        : "Daytona inspect command will be synthesized from the configured target.",
    },
    {
      id: "modal.readiness",
      status:
        config.executionBackend === "modal" && !config.modalTarget
          ? "fail"
          : config.modalTarget
            ? "pass"
            : "warn",
      summary: "Modal execution readiness",
      detail: config.modalTarget
        ? `Modal shell target configured: ${config.modalTarget}. Shell=${config.modalCommand || "modal"} ${config.modalShell || "/bin/bash"} workspace=${config.modalWorkspacePath || "/workspace"}${config.modalEnvironment ? ` env=${config.modalEnvironment}` : ""}.`
        : "DOOLITTLE_MODAL_TARGET is not configured.",
    },
    {
      id: "modal.shell",
      status: config.modalShell ? "pass" : "warn",
      summary: "Modal shell strategy",
      detail: config.modalShell
        ? `Modal shell runs commands through ${config.modalShell} and can be bound to ${config.modalEnvironment || "the active profile"}.`
        : "Modal shell strategy is not configured.",
    },
    {
      id: "modal.environment",
      status: config.modalEnvironment ? "pass" : "warn",
      summary: "Modal environment selection",
      detail: config.modalEnvironment
        ? `Modal environment configured: ${config.modalEnvironment}.`
        : "No explicit Modal environment configured; the active profile will be used.",
    },
    {
      id: "modal.inspect",
      status: config.modalInspectCommand ? "pass" : "warn",
      summary: "Modal inspect command",
      detail: config.modalInspectCommand
        ? `Modal inspect command configured: ${config.modalInspectCommand}.`
        : "Modal inspect command will be synthesized from the configured target.",
    },
    {
      id: "browser.backend",
      status:
        config.browserProvider === "lightpanda" && !config.browserCommand
          ? "fail"
          : "pass",
      summary: "Browser backend configuration",
      detail:
        config.browserProvider === "lightpanda"
          ? `Lightpanda is configured as the default browser backend via ${config.browserCommand}.`
          : "Basic HTTP fetch mode is configured as the browser fallback.",
    },
    {
      id: "provider.offline-bootstrap",
      status: config.offlineBootstrapMode ? "warn" : "pass",
      summary: "Explicit offline bootstrap fallback",
      detail: config.offlineBootstrapMode
        ? "Offline bootstrap mode is enabled; product fallback models may answer when no official provider is configured."
        : "Offline bootstrap mode is disabled; a real provider is required for model-backed answers.",
    },
    {
      id: "runtime.approvals",
      status: runtimeExecutionControl?.approvals.available ? "pass" : "warn",
      summary: "Native approval service bridge",
      detail: runtimeExecutionControl
        ? `native=${runtimeExecutionControl.approvals.available} asyncRequest=${runtimeExecutionControl.approvals.asyncRequest} selectionHandling=${runtimeExecutionControl.approvals.selectionHandling}`
        : "Runtime not attached; approval bridge cannot be inspected.",
    },
    {
      id: "runtime.agent-events",
      status:
        runtimeExecutionControl?.agentEvents.available &&
        agentEventBridgeAttached
          ? "pass"
          : "warn",
      summary: "Native agent-event progress stream",
      detail: runtimeExecutionControl
        ? `native=${runtimeExecutionControl.agentEvents.available} heartbeat=${runtimeExecutionControl.agentEvents.heartbeat} lastHeartbeat=${runtimeExecutionControl.agentEvents.lastHeartbeatStatus ?? "none"} bridge=${agentEventBridgeAttached}`
        : "Runtime not attached; agent-event bridge cannot be inspected.",
    },
    {
      id: "runtime.tool-policy",
      status: runtimeExecutionControl?.toolPolicy.available ? "pass" : "warn",
      summary: "Native tool policy service",
      detail: runtimeExecutionControl
        ? `native=${runtimeExecutionControl.toolPolicy.available} actions=${runtimeExecutionControl.toolPolicy.actions} codingAllowed=${runtimeExecutionControl.toolPolicy.codingAllowed} messagingAllowed=${runtimeExecutionControl.toolPolicy.messagingAllowed} fullAllowed=${runtimeExecutionControl.toolPolicy.fullAllowed}`
        : "Runtime not attached; tool policy bridge cannot be inspected.",
    },
  ];

  if (integrationControl) {
    checks.push(
      {
        id: "integration.browser.native",
        status:
          integrationControl.browser.source === "native" ? "pass" : "warn",
        summary: "Native browser integration",
        detail:
          integrationControl.browser.source === "native"
            ? "Browser status is resolved through the native Eliza service bridge."
            : "Browser status is still resolved through the product fallback service.",
      },
      {
        id: "integration.mcp.native",
        status: integrationControl.mcp.source === "native" ? "pass" : "warn",
        summary: "Native MCP integration",
        detail:
          integrationControl.mcp.source === "native"
            ? `MCP status is resolved through the native Eliza service bridge with ${integrationControl.mcp.cachedTools.length} cached tool(s).`
            : "MCP status is still resolved through the product fallback service.",
      },
    );
  }

  return checks;
}

export function buildDiagnosticsAutonomyChecks(input: {
  runDepth: string;
  maxIterations: number;
  toolProgressMode: string;
  runtimeBridgeAttached: boolean;
  agentEventBridgeAttached: boolean;
  awarenessInitialized: boolean;
  awarenessContributorCount: number;
  startupSnapshot?: DiagnosticsStartupSnapshotLike;
  autonomousConnection: DiagnosticsAutonomousConnectionLike;
}): DiagnosticCheck[] {
  const {
    runDepth,
    maxIterations,
    toolProgressMode,
    runtimeBridgeAttached,
    agentEventBridgeAttached,
    awarenessInitialized,
    awarenessContributorCount,
    startupSnapshot,
    autonomousConnection,
  } = input;

  return [
    {
      id: "agentic.loop",
      status: runtimeBridgeAttached ? "pass" : "warn",
      summary: "Observed multi-step runtime bridge",
      detail: `multiStep=true runtimeBridge=${runtimeBridgeAttached ? "attached" : "missing"} runDepth=${runDepth} maxIterations=${maxIterations} toolProgress=${toolProgressMode}`,
    },
    {
      id: "runtime.awareness",
      status: awarenessInitialized ? "pass" : "warn",
      summary: "Native autonomous awareness registry",
      detail: awarenessInitialized
        ? `registry=initialized contributors=${awarenessContributorCount} runtimeBridge=${runtimeBridgeAttached} agentEvents=${agentEventBridgeAttached} runDepth=${runDepth} toolProgress=${toolProgressMode}`
        : "Awareness registry is not initialized; autonomous self-status injection is inactive.",
    },
    {
      id: "runtime.startup-hydration",
      status:
        startupSnapshot?.hotPathReady && startupSnapshot?.deferredReady
          ? "pass"
          : startupSnapshot?.hotPathReady
            ? "warn"
            : "warn",
      summary: "Startup hydration state",
      detail: startupSnapshot
        ? `hotPath=${startupSnapshot.hotPathReady ? "ready" : "warming"} runtime=${startupSnapshot.phases.runtime.status} gateway=${startupSnapshot.phases.gateway.status} cron=${startupSnapshot.phases.cron.status} diagnostics=${startupSnapshot.phases.diagnostics.status} operator=${startupSnapshot.phases.operator.status} ecosystem=${startupSnapshot.phases.ecosystem.status} skills=${startupSnapshot.phases.skills.status}`
        : "Startup hydration state is unavailable.",
    },
    {
      id: "autonomous.connection",
      status: autonomousConnection.configured ? "pass" : "warn",
      summary: "Native autonomous connection view",
      detail: `${autonomousConnection.kind} source=${autonomousConnection.source} ${autonomousConnection.detail}`,
    },
  ];
}
