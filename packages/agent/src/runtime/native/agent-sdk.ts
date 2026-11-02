import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  getConfiguredEndpoints,
  getPluginInfo,
  getRegistryPlugins,
  listNonAppPlugins,
  refreshRegistry,
  searchNonAppPlugins,
} from "@elizaos/agent/services/registry-client";
import { CHANNEL_DIST_TAGS } from "@elizaos/agent/services/update-checker";
import { AI_PROVIDER_PLUGINS } from "@elizaos/agent/services/version-compat";
import { satisfies } from "semver";
import { evaluateExtensionInstallPolicy } from "./extension-policy";

const require = createRequire(import.meta.url);
function installedManifest(
  name: string,
): { version?: string; peerDependencies?: Record<string, string> } | undefined {
  try {
    return JSON.parse(
      readFileSync(require.resolve(`${name}/package.json`), "utf8"),
    );
  } catch {
    return undefined;
  }
}
function installedVersion(name: string): string | null {
  return installedManifest(name)?.version ?? null;
}
const FOUNDATION_PACKAGES = [
  "@elizaos/agent",
  "@elizaos/core",
  "@elizaos/host",
  "@elizaos/plugin-assistant",
  "@elizaos/auth",
  "@elizaos/skills",
] as const;

const ECOSYSTEM_PACKAGES = [
  "@doolittle/plugin-autocoder",
  "@doolittle/plugin-planning",
] as const;

export const AGENT_REGISTRY_INSTALL_FAILURE =
  "Eliza could not install the registry plugin.";

export async function getAgentSdkAudit() {
  const coreVersion = (await installedVersion("@elizaos/core")) ?? "unknown";
  const installed = Object.fromEntries(
    await Promise.all(
      FOUNDATION_PACKAGES.map(async (packageName) => [
        packageName,
        await installedVersion(packageName),
      ]),
    ),
  );
  const ecosystemPackages = [...ECOSYSTEM_PACKAGES];
  const ecosystemInstalled = Object.fromEntries(
    await Promise.all(
      ecosystemPackages.map(async (packageName) => [
        packageName,
        await installedVersion(packageName),
      ]),
    ),
  );
  const compatibilityTargets = [
    ...new Set([...AI_PROVIDER_PLUGINS, ...ecosystemPackages]),
  ];

  // This is a declared peer-range audit. Export and behavior compatibility
  // are established by the local release gate, never by version inference.
  const compatibility = compatibilityTargets.map((pluginName) => {
    const manifest = installedManifest(pluginName);
    const requiredCoreRange = manifest?.peerDependencies?.["@elizaos/core"];
    return {
      plugin: pluginName,
      installedVersion: manifest?.version ?? null,
      requiredCoreRange: requiredCoreRange ?? null,
      compatible: Boolean(
        manifest &&
          (!requiredCoreRange ||
            satisfies(coreVersion, requiredCoreRange, {
              includePrerelease: true,
            })),
      ),
      scope: "declared-peer-range" as const,
    };
  });

  return {
    foundationPackages: [...FOUNDATION_PACKAGES],
    installed,
    ecosystemPackages,
    ecosystemInstalled,
    coreVersion,
    channels: CHANNEL_DIST_TAGS,
    compatibility,
  };
}

async function installedExtensionPackages(): Promise<Set<string>> {
  const { listInstalledPlugins } = await import(
    "@elizaos/agent/services/plugin-installer"
  );
  return new Set(listInstalledPlugins().map((entry) => entry.name));
}

export async function getAgentRegistrySnapshot(
  limit = 20,
  allowlist: readonly string[] = [],
  force = false,
) {
  try {
    const [registry, plugins, installedPackages] = await Promise.all([
      force ? refreshRegistry() : getRegistryPlugins(),
      listNonAppPlugins(),
      installedExtensionPackages(),
    ]);
    return {
      available: true,
      endpoints: getConfiguredEndpoints(),
      total: registry.size,
      nonAppPlugins: plugins.length,
      sample: plugins.slice(0, limit).map((plugin) => plugin.name),
      entries: plugins.slice(0, limit).map((plugin) => ({
        ...plugin,
        policy: evaluateExtensionInstallPolicy(plugin, {
          allowlist,
          installedPackages,
        }),
      })),
    };
  } catch {
    return {
      available: false,
      endpoints: getConfiguredEndpoints(),
      total: 0,
      nonAppPlugins: 0,
      sample: [] as string[],
      // Registry transport exceptions may contain local paths or credentials.
      error: "Agent registry is unavailable.",
    };
  }
}

export async function searchAgentRegistry(
  query: string,
  limit = 15,
  allowlist: readonly string[] = [],
) {
  try {
    const [results, installedPackages] = await Promise.all([
      searchNonAppPlugins(query, limit),
      installedExtensionPackages(),
    ]);
    return {
      available: true,
      query,
      results: results.map((plugin) => ({
        ...plugin,
        policy: evaluateExtensionInstallPolicy(plugin, {
          allowlist,
          installedPackages,
        }),
      })),
    };
  } catch {
    return {
      available: false,
      query,
      results: [],
      error: "Agent registry search failed.",
    };
  }
}

export async function installAgentRegistryExtension(input: {
  name: string;
  packageName: string;
  version: string;
  approved: boolean;
  allowlist?: readonly string[];
}) {
  const name = input.name.trim();
  if (!input.approved) {
    return {
      ok: false as const,
      status: 400,
      error: "explicit operator approval is required",
    };
  }

  const info = await getPluginInfo(name);
  if (!info) {
    return {
      ok: false as const,
      status: 404,
      error: "plugin was not found in the Eliza registry",
    };
  }
  const installedPackages = await installedExtensionPackages();
  const policy = evaluateExtensionInstallPolicy(info, {
    allowlist: input.allowlist,
    installedPackages,
  });
  if (
    policy.provenance.packageName !== input.packageName.trim() ||
    policy.provenance.version !== input.version.trim()
  ) {
    return {
      ok: false as const,
      status: 409,
      error:
        "Registry metadata changed after approval. Refresh and review the package again.",
      policy,
    };
  }
  if (!policy.installable || !policy.provenance.version) {
    return {
      ok: false as const,
      status: 403,
      error: policy.reasons.join(" "),
      policy,
    };
  }

  const { assertValidPackageName, installPlugin } = await import(
    "@elizaos/agent/services/plugin-installer"
  );
  assertValidPackageName(policy.provenance.packageName);
  const result = await installPlugin(
    policy.provenance.packageName,
    undefined,
    policy.provenance.version,
  );
  if (!result.success) {
    return {
      ok: false as const,
      status: 422,
      // Installer diagnostics can include credentials, filesystem paths, or
      // registry response bodies. They are not suitable for operator clients.
      error: AGENT_REGISTRY_INSTALL_FAILURE,
      policy,
    };
  }

  return {
    ok: true as const,
    status: 200,
    installed: {
      name: result.pluginName,
      version: result.version,
      requiresRestart: result.requiresRestart,
    },
    policy: {
      ...policy,
      installed: true,
      installable: false,
    },
    provenance: {
      ...policy.provenance,
      installer: "@elizaos/agent",
      sourceVerification: "not-reported-by-installed-sdk",
    },
  };
}
