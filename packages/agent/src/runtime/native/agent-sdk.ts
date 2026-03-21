import {
  type CatalogSkill,
  getCatalogSkills,
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

  const compatibilityTargets = [
    ...new Set([
      ...AI_PROVIDER_PLUGINS,
      "@elizaos/plugin-browser",
      "@elizaos/plugin-mcp",
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
