import { describe, expect, it } from "bun:test";
import { resolveOwnership } from "./ownership";

function createVersionSummary() {
  return {
    name: "doolittle",
    version: "0.1.0",
    bun: "1.3.12",
    dependencies: {},
    nativePlugins: {
      total: 0,
      enabled: 0,
      official: 0,
      vendored: 0,
    },
    nativePackages: {
      runtimeLatest: "2.0.0",
      runtimeAlpha: "2.0.0-alpha.85",
      aligned: 0,
      vendored: 0,
      alphaOnly: 0,
      workspaceOnly: 0,
    },
  };
}

describe("resolveOwnership", () => {
  it("prefers the injected native ownership cache when present", () => {
    const controlPlane = {
      serviceResolution: [
        {
          capability: "browser",
          nativeService: "browser",
          source: "native",
          ownership: "plugin",
          fallback: "web",
          available: true,
        },
      ],
      pluginManager: null,
      transportControl: {
        messagingBridge: [],
        messagingPlugins: [],
        transportInventory: [],
        totals: {
          configured: 0,
          enabledPlugins: 0,
          gatewayEnabled: 0,
          availableServices: 0,
          liveServices: 0,
          officialPlugins: 0,
          vendoredPlugins: 0,
          operationalTransports: 0,
          customTransports: 0,
          productTransports: 0,
        },
      },
    };

    const resolved = resolveOwnership({
      config: {} as never,
      diagnostics: {
        currentGatewayConfig() {
          return {} as never;
        },
        setupChecklist: async () => [],
      },
      repository: {
        isRepository: () => true,
        status: async () => "clean",
        recentCommits: async () => "abc123",
      },
      version: createVersionSummary,
      nativeOwnership: {
        controlPlane() {
          return controlPlane as never;
        },
      },
    });

    expect(resolved?.serviceResolution[0]?.capability).toBe("browser");
    expect(resolved?.transportControl.totals.configured).toBe(0);
  });

  it("returns undefined when neither injected ownership nor runtime is available", () => {
    const resolved = resolveOwnership({
      config: {} as never,
      diagnostics: {
        currentGatewayConfig() {
          return {} as never;
        },
        setupChecklist: async () => [],
      },
      repository: {
        isRepository: () => true,
        status: async () => "clean",
        recentCommits: async () => "abc123",
      },
      version: createVersionSummary,
    });

    expect(resolved).toBeUndefined();
  });
});
