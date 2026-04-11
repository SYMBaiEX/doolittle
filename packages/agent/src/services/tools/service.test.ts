import { describe, expect, it } from "bun:test";
import { ToolsService } from "./service";

describe("ToolsService", () => {
  it("summarizes the registry and exposes lookup helpers", () => {
    const service = new ToolsService(() => ({
      mcpEnabled: true,
      discoveredMcpTools: 2,
      discoveredMcpToolNames: ["sum", "echo"],
      nativePluginManagerTotal: 10,
      nativePluginManagerEnabled: 8,
      nativePluginManagerOfficial: 4,
      nativePluginManagerVendored: 5,
      nativePluginManagerCategories: 3,
      nativeLaggingLatestPackages: 2,
      agentSdkCompatibilityFailures: 1,
      nativeOwnershipControlPlane: {
        serviceResolution: [{ source: "native" }] as never,
        transportControl: {
          totals: {
            configured: 1,
            enabledPlugins: 1,
            gatewayEnabled: 1,
            availableServices: 1,
            liveServices: 1,
            officialPlugins: 1,
            vendoredPlugins: 0,
            operationalTransports: 1,
            customTransports: 0,
            productTransports: 0,
          },
          transportInventory: [],
          messagingBridge: [],
          messagingPlugins: [],
        } as never,
        pluginManager: {
          plugins: [],
          categories: [],
          summary: {
            total: 2,
            enabled: 2,
            official: 1,
            vendored: 1,
            categories: 1,
          },
        } as never,
        identity: undefined,
      } as never,
      nativeOwnershipSnapshot: {
        controlPlane: {} as never,
        integration: {} as never,
        autonomous: {} as never,
        skillHub: {
          workspaceTotal: 10,
          generatedTotal: 4,
          catalogTotal: 3,
          installedTotal: 2,
          installable: 1,
          exportedManifests: 6,
          familyTotal: 2,
          curatedFamilyTotal: 1,
          generatedFamilyTotal: 1,
          manifestsDir: "/tmp/manifests",
          summary: "ok",
          distribution: {
            sources: [],
            categories: [],
            roots: [],
            tags: [],
          },
          families: [],
          recentWorkspace: [],
          recentCatalog: [],
          recentInstalled: [],
        },
      } as never,
      nativeCatalog: [
        {
          id: "messaging.telegram",
          category: "messaging",
          source: "official",
          enabled: true,
          notes: "Official Telegram transport plugin.",
        },
      ],
    }));

    const summary = service.summary();
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.enabled).toBeGreaterThan(0);
    expect(summary.mcp.enabled).toBe(true);
    expect(summary.mcp.discoveredToolNames).toContain("sum");
    expect(summary.native.total).toBe(2);
    expect(summary.native.categories).toBe(1);
    expect(summary.native.official).toBe(1);
    expect(summary.native.vendored).toBe(1);
    expect(summary.ecosystem.compatibilityFailures).toBe(1);
    expect(summary.ecosystem.skillsHubTotal).toBe(10);
    expect(summary.ecosystem.skillsHubInstalledTotal).toBe(2);
    expect(summary.ecosystem.skillsHubFamilyTotal).toBe(2);
    expect(summary.ecosystem.laggingLatestPackages).toBe(2);

    const browserTools = service.byCategory("documents");
    expect(browserTools.some((tool) => tool.id === "browser.status")).toBe(
      true,
    );
    expect(browserTools.some((tool) => tool.id === "browser.capture")).toBe(
      true,
    );
    expect(browserTools.some((tool) => tool.id === "browser.analyze")).toBe(
      true,
    );
    expect(
      browserTools.some((tool) => tool.id === "browser.compare.analyze"),
    ).toBe(true);
    expect(browserTools.some((tool) => tool.id === "browser.compare")).toBe(
      true,
    );
    expect(
      service.search("browser").some((tool) => tool.id === "browser.snapshot"),
    ).toBe(true);
    expect(browserTools.some((tool) => tool.id === "media.bundle")).toBe(true);
    expect(browserTools.some((tool) => tool.id === "media.analyze")).toBe(true);
    expect(browserTools.some((tool) => tool.id === "media.voice")).toBe(true);
    expect(browserTools.some((tool) => tool.id === "media.transcribe")).toBe(
      true,
    );
    expect(browserTools.some((tool) => tool.id === "media.speak")).toBe(true);
    expect(browserTools.some((tool) => tool.id === "media.vision")).toBe(true);
    expect(browserTools.some((tool) => tool.id === "media.generate")).toBe(
      true,
    );
    expect(service.get("skills.families")?.description).toContain("families");
    expect(service.get("skills.family")?.description).toContain("family");
    expect(
      service
        .byCategory("automation")
        .some((tool) => tool.id === "automation.trajectory.analyze"),
    ).toBe(true);
    expect(
      service
        .byCategory("automation")
        .some((tool) => tool.id === "automation.trajectory.evaluate"),
    ).toBe(true);
    expect(
      service
        .byCategory("automation")
        .some((tool) => tool.id === "automation.trajectory.package"),
    ).toBe(true);
    expect(
      service
        .summary()
        .transports.some((entry) => entry.transport === "native"),
    ).toBe(true);

    const bridge = service.get("mcp.bridge");
    expect(bridge?.enabled).toBe(true);
    expect(bridge?.description).toContain("2 discovered tool(s)");
    expect(service.get("runtime.compatibility")?.description).toContain("1");
    expect(service.get("plugins.native")?.description).toContain("2/2");
    expect(service.get("skills.hub")?.description).toContain("installed=2");
    expect(service.get("runtime.ownership")?.description).toContain(
      "Shared ownership snapshot",
    );
    expect(service.get("plugins.native.messaging.telegram")?.transport).toBe(
      "native",
    );
  });
});
