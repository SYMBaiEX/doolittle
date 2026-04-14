import type { DiagnosticCheck, EnvConfig } from "@/types";

export interface DiagnosticsExecutionControlLike {
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

export interface DiagnosticsIntegrationControlLike {
  browser: {
    source: string;
  };
  mcp: {
    source: string;
    cachedTools: unknown[];
  };
}

export interface DiagnosticsAutonomousConnectionLike {
  configured: boolean;
  kind: string;
  source: string;
  detail: string;
}

export interface DiagnosticsStartupSnapshotLike {
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

export interface DiagnosticsExecutionChecksInput {
  config: EnvConfig;
  runtimeExecutionControl?: DiagnosticsExecutionControlLike;
  integrationControl?: DiagnosticsIntegrationControlLike;
  agentEventBridgeAttached: boolean;
}

export interface DiagnosticsAutonomyChecksInput {
  runDepth: string;
  maxIterations: number;
  toolProgressMode: string;
  runtimeBridgeAttached: boolean;
  agentEventBridgeAttached: boolean;
  awarenessInitialized: boolean;
  awarenessContributorCount: number;
  startupSnapshot?: DiagnosticsStartupSnapshotLike;
  autonomousConnection: DiagnosticsAutonomousConnectionLike;
}

export type DiagnosticsCheckBuilder<TInput> = (
  input: TInput,
) => DiagnosticCheck[];
