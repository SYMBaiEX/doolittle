import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coreVersion = "1.2.3";
const compatibilityRows = [
  {
    package: "@doolittle/plugin-autocoder",
    coreVersion: "1.2.3",
    compatible: false,
    reason: "api mismatch",
  },
];

function installAgentSdkMocks({
  registryShouldFail = false,
}: {
  registryShouldFail?: boolean;
}) {
  vi.doMock("@elizaos/agent/services/registry-client", () => ({
    getConfiguredEndpoints: () => ["https://agent-registry.test"],
    getRegistryPlugins: () => {
      if (registryShouldFail) {
        throw new Error("registry offline");
      }
      return new Map([
        ["@doolittle/core-plugin", { name: "core-plugin" }],
        ["@doolittle/utility-plugin", { name: "utility-plugin" }],
      ]);
    },
    listNonAppPlugins: () => [{ name: "plugin-a" }, { name: "plugin-b" }],
    searchNonAppPlugins: () => [
      {
        name: "plugin-a",
      },
      {
        name: "plugin-b",
      },
    ],
  }));
  vi.doMock("@elizaos/agent/services/update-checker", () => ({
    CHANNEL_DIST_TAGS: ["dev", "staging", "prod"],
  }));
  vi.doMock("@elizaos/agent/services/version-compat", () => ({
    AI_PROVIDER_PLUGINS: ["openai", "anthropic", "vertex-ai"],
    getInstalledVersion: (packageName: string) => {
      if (packageName === "@elizaos/core") {
        return coreVersion;
      }
      return "0.0.0";
    },
    validatePluginCompat: (plugin: string, providedCoreVersion: string) => ({
      package: plugin,
      installedVersion: providedCoreVersion,
      compatible: compatibilityRows.some((row) => row.package === plugin),
      reason: compatibilityRows.find((row) => row.package === plugin)?.reason,
    }),
  }));
}

async function loadAgentSdkModule() {
  return import("./agent-sdk");
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("agent-sdk helper facade", () => {
  it("returns a complete audit report when dependencies are healthy", async () => {
    installAgentSdkMocks({});
    const mod = await loadAgentSdkModule();

    const report = await mod.getAgentSdkAudit();
    expect(report.coreVersion).toBe(coreVersion);
    expect(report.channels).toEqual(["dev", "staging", "prod"]);
    expect(report).not.toHaveProperty("skillCatalog");
    expect(report.compatibility.length).toBeGreaterThan(5);
    expect(report.compatibility[0]?.compatible).toBeDefined();
  });

  it("reports unavailable registry snapshot on registry lookup failure", async () => {
    installAgentSdkMocks({ registryShouldFail: true });
    const mod = await loadAgentSdkModule();

    const snapshot = await mod.getAgentRegistrySnapshot();
    expect(snapshot.available).toBe(false);
    expect(snapshot.total).toBe(0);
    expect(snapshot.nonAppPlugins).toBe(0);
    expect(snapshot.error).toBe("registry offline");
  });
});
