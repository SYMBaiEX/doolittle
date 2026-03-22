import {
  getConfiguredEndpoints,
  getRegistryPlugins,
  listNonAppPlugins,
  searchNonAppPlugins,
} from "@elizaos/agent/services/registry-client";
import {
  type CatalogSkill,
  getCatalogSkill,
  getCatalogSkills,
  getTrendingSkills,
  searchCatalogSkills,
} from "@elizaos/agent/services/skill-catalog-client";
import { CHANNEL_DIST_TAGS } from "@elizaos/agent/services/update-checker";
import {
  AI_PROVIDER_PLUGINS,
  getInstalledVersion,
  validatePluginCompat,
} from "@elizaos/agent/services/version-compat";

const FOUNDATION_PACKAGES = [
  "@elizaos/agent",
  "@elizaos/autonomous",
  "@elizaos/skills",
  "@elizaos/plugin-browser",
  "@elizaos/plugin-mcp",
] as const;

const LEGACY_PACKAGES = [
  "@elizaos/server",
  "@elizaos/cli",
  "@elizaos/api-client",
  "@elizaos/client",
  "@elizaos/project-starter",
] as const;

const ECOSYSTEM_PACKAGES = [
  "@elizaos/plugin-action-bench",
  "@elizaos/plugin-autocoder",
  "@elizaos/plugin-planning",
  "@elizaos/plugin-tts",
] as const;

export async function getAgentSdkAudit() {
  const coreVersion = (await getInstalledVersion("@elizaos/core")) ?? "unknown";
  const installed = Object.fromEntries(
    await Promise.all(
      FOUNDATION_PACKAGES.map(async (packageName) => [
        packageName,
        await getInstalledVersion(packageName),
      ]),
    ),
  );
  const ecosystemPackages = [...ECOSYSTEM_PACKAGES];
  const ecosystemInstalled = Object.fromEntries(
    await Promise.all(
      ecosystemPackages.map(async (packageName) => [
        packageName,
        await getInstalledVersion(packageName),
      ]),
    ),
  );
  const legacyPackages = [...LEGACY_PACKAGES];
  const legacyInstalled = Object.fromEntries(
    await Promise.all(
      legacyPackages.map(async (packageName) => [
        packageName,
        await getInstalledVersion(packageName),
      ]),
    ),
  );

  const compatibilityTargets = [
    ...new Set([
      ...AI_PROVIDER_PLUGINS,
      "@elizaos/plugin-browser",
      "@elizaos/plugin-mcp",
      ...ecosystemPackages,
    ]),
  ];

  const compatibility = await Promise.all(
    compatibilityTargets.map((plugin) =>
      validatePluginCompat(plugin, coreVersion),
    ),
  );

  let catalogSkills: CatalogSkill[] = [];
  let catalogError: string | undefined;
  try {
    catalogSkills = await getCatalogSkills();
  } catch (error) {
    catalogError = error instanceof Error ? error.message : String(error);
  }

  return {
    foundationPackages: [...FOUNDATION_PACKAGES],
    installed,
    ecosystemPackages,
    ecosystemInstalled,
    legacyPackages,
    legacyInstalled,
    coreVersion,
    channels: CHANNEL_DIST_TAGS,
    compatibility,
    skillCatalog: {
      available: catalogError === undefined,
      cachedSkills: catalogSkills.length,
      sample: catalogSkills.slice(0, 5).map((skill) => skill.slug),
      error: catalogError,
    },
  };
}

export async function getAgentRegistrySnapshot(limit = 20) {
  try {
    const [registry, plugins] = await Promise.all([
      getRegistryPlugins(),
      listNonAppPlugins(),
    ]);
    return {
      available: true,
      endpoints: getConfiguredEndpoints(),
      total: registry.size,
      nonAppPlugins: plugins.length,
      sample: plugins.slice(0, limit).map((plugin) => plugin.name),
    };
  } catch (error) {
    return {
      available: false,
      endpoints: getConfiguredEndpoints(),
      total: 0,
      nonAppPlugins: 0,
      sample: [] as string[],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function searchAgentRegistry(query: string, limit = 15) {
  try {
    return {
      available: true,
      query,
      results: await searchNonAppPlugins(query, limit),
    };
  } catch (error) {
    return {
      available: false,
      query,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getAgentSkillCatalogSnapshot(limit = 20) {
  try {
    const [catalog, trending] = await Promise.all([
      getCatalogSkills(),
      getTrendingSkills(limit),
    ]);
    return {
      available: true,
      total: catalog.length,
      trending: trending.map((skill) => ({
        slug: skill.slug,
        displayName: skill.displayName,
        installs: skill.stats.installsCurrent,
        stars: skill.stats.stars,
      })),
    };
  } catch (error) {
    return {
      available: false,
      total: 0,
      trending: [] as Array<{
        slug: string;
        displayName: string;
        installs: number;
        stars: number;
      }>,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getAgentCatalogSkills() {
  return getCatalogSkills();
}

export async function getAgentCatalogSkill(slug: string) {
  return getCatalogSkill(slug);
}

export async function searchAgentSkillCatalog(query: string, limit = 15) {
  try {
    return {
      available: true,
      query,
      results: await searchCatalogSkills(query, limit),
    };
  } catch (error) {
    return {
      available: false,
      query,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
