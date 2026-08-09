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

const registryPlugin = {
  name: "@elizaos/plugin-browser",
  description: "Browser",
  stars: 1,
  repository: "https://github.com/elizaos-plugins/plugin-browser",
  gitRepo: "elizaos-plugins/plugin-browser",
  gitUrl: "https://github.com/elizaos-plugins/plugin-browser.git",
  homepage: null,
  language: "TypeScript",
  topics: [],
  latestVersion: "2.0.3-beta.7",
  supports: { v0: false, v1: false, v2: true },
  npm: {
    package: "@elizaos/plugin-browser",
    v0Version: null,
    v1Version: null,
    v2Version: "2.0.3-beta.7",
  },
  git: { v0Branch: null, v1Branch: null, v2Branch: "main" },
  support: "first-party",
  firstParty: true,
};

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
    searchNonAppPlugins: () => [registryPlugin],
    getPluginInfo: (name: string) =>
      name === registryPlugin.name ? registryPlugin : null,
  }));
  vi.doMock("@elizaos/agent/services/plugin-installer", () => ({
    assertValidPackageName: () => undefined,
    listInstalledPlugins: () => [],
    installPlugin: async (
      name: string,
      _progress: unknown,
      version: string,
    ) => ({
      success: true,
      pluginName: name,
      version,
      installPath: "/private/plugin",
      requiresRestart: true,
    }),
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
    expect(report.compatibility.length).toBeGreaterThanOrEqual(5);
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

  it("enriches registry results with explicit trust policy", async () => {
    installAgentSdkMocks({});
    const mod = await loadAgentSdkModule();

    const result = await mod.searchAgentRegistry("browser");

    expect(result.results[0]).toMatchObject({
      name: "@elizaos/plugin-browser",
      policy: {
        installable: false,
        trust: "first-party",
        provenance: { integrity: null, integrityVerified: false },
      },
    });
  });

  it("installs an approved exact registry version through Eliza", async () => {
    installAgentSdkMocks({});
    const mod = await loadAgentSdkModule();

    const result = await mod.installAgentRegistryExtension({
      name: "@elizaos/plugin-browser",
      packageName: "@elizaos/plugin-browser",
      version: "2.0.3-beta.7",
      approved: true,
      allowlist: ["@elizaos/plugin-browser"],
    });

    expect(result).toMatchObject({
      ok: true,
      installed: {
        name: "@elizaos/plugin-browser",
        version: "2.0.3-beta.7",
        requiresRestart: true,
      },
      provenance: {
        installer: "@elizaos/agent",
        integrity: null,
        sourceVerification: "not-reported-by-installed-sdk",
      },
    });
    expect(result).not.toHaveProperty("installed.installPath");
  });

  it("requires explicit approval before resolving or installing", async () => {
    installAgentSdkMocks({});
    const mod = await loadAgentSdkModule();

    await expect(
      mod.installAgentRegistryExtension({
        name: "@elizaos/plugin-browser",
        packageName: "@elizaos/plugin-browser",
        version: "2.0.3-beta.7",
        approved: false,
      }),
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it("rejects registry drift after the operator reviewed a package version", async () => {
    installAgentSdkMocks({});
    const mod = await loadAgentSdkModule();

    await expect(
      mod.installAgentRegistryExtension({
        name: "@elizaos/plugin-browser",
        packageName: "@elizaos/plugin-browser",
        version: "2.0.3-beta.6",
        approved: true,
        allowlist: ["@elizaos/plugin-browser"],
      }),
    ).resolves.toMatchObject({ ok: false, status: 409 });
  });
});
