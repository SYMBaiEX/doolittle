import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const coreVersion = "1.2.3";
const compatibilityRows = [
  {
    package: "@elizaos/plugin-autocoder",
    coreVersion: "1.2.3",
    compatible: false,
    reason: "api mismatch",
  },
];

function installAgentSdkMocks({
  catalogShouldFail = false,
  registryShouldFail = false,
  catalogSearchShouldFail = false,
}: {
  catalogShouldFail?: boolean;
  registryShouldFail?: boolean;
  catalogSearchShouldFail?: boolean;
}) {
  mock.module("@elizaos/agent/services/registry-client", () => ({
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
  mock.module("@elizaos/agent/services/skill-catalog-client", () => ({
    getCatalogSkill: (slug: string) => ({
      slug,
      displayName: "Skill",
      stats: { installsCurrent: 1, stars: 2 },
    }),
    getCatalogSkills: () => {
      if (catalogShouldFail) {
        throw new Error("catalog timeout");
      }
      return [
        {
          slug: "planner",
          displayName: "Planner",
          stats: { installsCurrent: 101, stars: 999 },
        },
        {
          slug: "browser",
          displayName: "Browser",
          stats: { installsCurrent: 15, stars: 77 },
        },
      ];
    },
    getTrendingSkills: () => [
      {
        slug: "planner",
        displayName: "Planner",
        stats: { installsCurrent: 100, stars: 20 },
      },
    ],
    searchCatalogSkills: () => {
      if (catalogSearchShouldFail) {
        throw new Error("search timeout");
      }
      return [
        {
          slug: "planner",
          displayName: "Planner",
          stats: { installsCurrent: 100, stars: 20 },
        },
      ];
    },
  }));
  mock.module("@elizaos/agent/services/update-checker", () => ({
    CHANNEL_DIST_TAGS: ["dev", "staging", "prod"],
  }));
  mock.module("@elizaos/agent/services/version-compat", () => ({
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
  return import(`./agent-sdk?test=${Date.now()}-${Math.random()}`);
}

beforeEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

describe("agent-sdk helper facade", () => {
  it("returns a complete audit report when dependencies are healthy", async () => {
    installAgentSdkMocks({});
    const mod = await loadAgentSdkModule();

    const report = await mod.getAgentSdkAudit();
    expect(report.coreVersion).toBe(coreVersion);
    expect(report.channels).toEqual(["dev", "staging", "prod"]);
    expect(report.skillCatalog.available).toBe(true);
    expect(report.skillCatalog.cachedSkills).toBe(2);
    expect(report.compatibility.length).toBeGreaterThan(5);
    expect(report.compatibility[0]?.compatible).toBeDefined();
  });

  it("handles catalog failures as degraded skill catalog availability", async () => {
    installAgentSdkMocks({ catalogShouldFail: true });
    const mod = await loadAgentSdkModule();

    const report = await mod.getAgentSdkAudit();
    expect(report.skillCatalog.available).toBe(false);
    expect(report.skillCatalog.error).toBe("catalog timeout");
    expect(report.skillCatalog.cachedSkills).toBe(0);
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

  it("reports unavailable search result on catalog search failure", async () => {
    installAgentSdkMocks({ catalogSearchShouldFail: true });
    const mod = await loadAgentSdkModule();

    const search = await mod.searchAgentSkillCatalog("planner");
    expect(search.available).toBe(false);
    expect(search.results).toEqual([]);
    expect(search.error).toBe("search timeout");
  });
});
