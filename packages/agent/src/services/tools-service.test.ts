import { describe, expect, it } from "bun:test";
import { ToolsService } from "./tools-service";

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
      agentSdkCompatibilityFailures: 1,
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
    expect(summary.native.total).toBe(10);
    expect(summary.native.categories).toBe(3);
    expect(summary.native.official).toBe(4);
    expect(summary.native.vendored).toBe(5);
    expect(summary.ecosystem.compatibilityFailures).toBe(1);

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
    expect(service.get("plugins.native")?.description).toContain("8/10");
    expect(service.get("plugins.native.messaging.telegram")?.transport).toBe(
      "native",
    );
  });
});
