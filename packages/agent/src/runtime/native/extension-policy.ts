import type {
  RegistryPluginInfo,
  RegistryPluginListItem,
} from "@elizaos/agent/services/registry-client";

type RegistryExtension = RegistryPluginInfo | RegistryPluginListItem;

export interface ExtensionInstallPolicy {
  allowed: boolean;
  installable: boolean;
  installed: boolean;
  trust: "built-in" | "first-party" | "allowlisted" | "community";
  reasons: string[];
  provenance: {
    registry: "elizaos";
    packageName: string;
    version: string | null;
    repository: string | null;
    support: string;
    integrity: null;
    integrityVerified: false;
  };
}

function canonicalPackage(entry: RegistryExtension): string {
  return entry.npm?.package?.trim() || entry.name.trim();
}

function registryVersion(entry: RegistryExtension): string | null {
  if ("latestVersion" in entry && entry.latestVersion?.trim()) {
    return entry.latestVersion.trim();
  }
  return entry.npm?.v2Version?.trim() || null;
}

function registryRepository(entry: RegistryExtension): string | null {
  if ("repository" in entry && entry.repository?.trim()) {
    return entry.repository.trim();
  }
  if ("gitUrl" in entry && entry.gitUrl?.trim()) return entry.gitUrl.trim();
  if ("homepage" in entry && entry.homepage?.trim()) {
    return entry.homepage.trim();
  }
  return null;
}

/**
 * Doolittle owns only operator policy. Eliza owns registry resolution and the
 * installation lifecycle. Registry metadata is useful provenance, but it is
 * deliberately not represented as package-integrity verification.
 */
export function evaluateExtensionInstallPolicy(
  entry: RegistryExtension,
  options: {
    allowlist?: readonly string[];
    installedPackages?: ReadonlySet<string>;
  } = {},
): ExtensionInstallPolicy {
  const packageName = canonicalPackage(entry);
  const version = registryVersion(entry);
  const installed = options.installedPackages?.has(packageName) ?? false;
  const allowlist = new Set(
    (options.allowlist ?? []).map((value) => value.trim()).filter(Boolean),
  );
  const elizaNamespace = packageName.startsWith("@elizaos/");
  const builtIn =
    elizaNamespace && (entry.builtIn === true || entry.origin === "builtin");
  const firstParty =
    elizaNamespace &&
    (builtIn || entry.firstParty === true || entry.support === "first-party");
  const localOverride =
    "localPath" in entry &&
    typeof entry.localPath === "string" &&
    Boolean(entry.localPath.trim());
  const explicitlyAllowed =
    allowlist.has(packageName) || allowlist.has(entry.name.trim());
  const supportsV2 = entry.supports?.v2 === true;
  // beta.7 may fall back from npm to registry-provided Git metadata. Until the
  // official installer can bind an approved source, every install needs a
  // package allowlist entry even when registry metadata says first-party.
  const allowed = builtIn || explicitlyAllowed;
  const reasons: string[] = [];

  if (builtIn) {
    reasons.push("Bundled with Eliza; no installation is needed.");
  } else {
    if (firstParty)
      reasons.push(
        "The registry identifies this as first-party, but beta installer source fallback still requires an operator allowlist entry.",
      );
    if (explicitlyAllowed)
      reasons.push("Explicitly allowed by the Doolittle operator policy.");
    else
      reasons.push(
        "Plugin installation requires an explicit operator allowlist entry.",
      );
  }

  if (!supportsV2)
    reasons.push("The registry does not declare Eliza v2 support.");
  if (!version)
    reasons.push("The registry does not publish an exact v2 version.");
  if (installed)
    reasons.push("Already installed through the Eliza plugin lifecycle.");
  if (localOverride)
    reasons.push(
      "Local-path registry overrides cannot be approved as a version-pinned install.",
    );
  reasons.push(
    "Registry metadata does not include a verified package integrity digest.",
  );

  return {
    allowed,
    installable:
      allowed &&
      supportsV2 &&
      Boolean(version) &&
      !builtIn &&
      !installed &&
      !localOverride,
    installed,
    trust: builtIn
      ? "built-in"
      : firstParty
        ? "first-party"
        : explicitlyAllowed
          ? "allowlisted"
          : "community",
    reasons,
    provenance: {
      registry: "elizaos",
      packageName,
      version,
      repository: registryRepository(entry),
      support: entry.support?.trim() || entry.origin?.trim() || "community",
      integrity: null,
      integrityVerified: false,
    },
  };
}
