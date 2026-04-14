import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types";
import {
  buildDiagnosticsAutonomyChecks,
  buildDiagnosticsExecutionChecks,
} from "./runtime-checks";

const config = {
  remoteSyncMode: "mirror",
  remoteSyncInclude: ["src/**"],
  remoteSyncExclude: [".git"],
  remoteWorkspaceLabel: "workspace",
  remoteArtifactPaths: [".doolittle/remote-artifacts"],
  remoteArtifactPolicy: "metadata-only",
  mcpServerCommand: undefined,
  acpServerCommand: "acp-server",
  executionBackend: "daytona",
  executionCommandTimeoutMs: 30000,
  executionHealthTimeoutMs: 5000,
  daytonaTarget: undefined,
  daytonaCommand: undefined,
  daytonaShell: "/bin/sh",
  daytonaWorkspacePath: "/workspace",
  daytonaSnapshot: undefined,
  daytonaInspectCommand: undefined,
  modalTarget: undefined,
  modalCommand: undefined,
  modalShell: "/bin/bash",
  modalWorkspacePath: "/workspace",
  modalEnvironment: undefined,
  modalInspectCommand: undefined,
  browserProvider: "lightpanda",
  browserCommand: undefined,
  offlineBootstrapMode: true,
} as unknown as EnvConfig;

describe("buildDiagnosticsExecutionChecks", () => {
  it("adds integration checks only when integration control is present", () => {
    const withoutIntegration = buildDiagnosticsExecutionChecks({
      config,
      agentEventBridgeAttached: false,
    });
    expect(
      withoutIntegration.some(
        (check) => check.id === "integration.browser.native",
      ),
    ).toBe(false);

    const withIntegration = buildDiagnosticsExecutionChecks({
      config,
      agentEventBridgeAttached: true,
      integrationControl: {
        browser: { source: "native" },
        mcp: { source: "product", cachedTools: [1, 2] },
      },
    });
    expect(
      withIntegration.find((check) => check.id === "integration.browser.native")
        ?.status,
    ).toBe("pass");
    expect(
      withIntegration.find((check) => check.id === "integration.mcp.native")
        ?.status,
    ).toBe("warn");
  });

  it("preserves backend and runtime bridge status handling", () => {
    const checks = buildDiagnosticsExecutionChecks({
      config,
      agentEventBridgeAttached: true,
      runtimeExecutionControl: {
        approvals: {
          available: true,
          asyncRequest: true,
          selectionHandling: false,
        },
        agentEvents: {
          available: true,
          heartbeat: true,
          lastHeartbeatStatus: "ok",
        },
        toolPolicy: {
          available: false,
          actions: 3,
          codingAllowed: 2,
          messagingAllowed: 1,
          fullAllowed: 0,
        },
      },
    });

    expect(
      checks.find((check) => check.id === "daytona.readiness")?.status,
    ).toBe("fail");
    expect(checks.find((check) => check.id === "browser.backend")?.status).toBe(
      "fail",
    );
    expect(
      checks.find((check) => check.id === "runtime.approvals")?.status,
    ).toBe("pass");
    expect(
      checks.find((check) => check.id === "runtime.tool-policy")?.status,
    ).toBe("warn");
  });
});

describe("buildDiagnosticsAutonomyChecks", () => {
  it("keeps startup hydration warn until both phases are ready", () => {
    const missing = buildDiagnosticsAutonomyChecks({
      runDepth: "standard",
      maxIterations: 10,
      toolProgressMode: "new",
      runtimeBridgeAttached: false,
      agentEventBridgeAttached: false,
      awarenessInitialized: false,
      awarenessContributorCount: 0,
      autonomousConnection: {
        configured: false,
        kind: "socket",
        source: "none",
        detail: "inactive",
      },
    });
    expect(
      missing.find((check) => check.id === "runtime.startup-hydration")?.status,
    ).toBe("warn");

    const ready = buildDiagnosticsAutonomyChecks({
      runDepth: "deep",
      maxIterations: 20,
      toolProgressMode: "compact",
      runtimeBridgeAttached: true,
      agentEventBridgeAttached: true,
      awarenessInitialized: true,
      awarenessContributorCount: 3,
      startupSnapshot: {
        hotPathReady: true,
        deferredReady: true,
        phases: {
          runtime: { status: "ready" },
          gateway: { status: "ready" },
          cron: { status: "ready" },
          diagnostics: { status: "ready" },
          operator: { status: "ready" },
          ecosystem: { status: "ready" },
          skills: { status: "ready" },
        },
      },
      autonomousConnection: {
        configured: true,
        kind: "socket",
        source: "native",
        detail: "connected",
      },
    });
    expect(
      ready.find((check) => check.id === "runtime.startup-hydration")?.status,
    ).toBe("pass");
    expect(
      ready.find((check) => check.id === "autonomous.connection")?.status,
    ).toBe("pass");
  });
});
