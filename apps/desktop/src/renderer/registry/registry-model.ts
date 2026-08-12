import { asArray, asRecord, asString } from "../lib";

export interface RegistryEntry {
  name: string;
  packageName: string;
  description: string;
  version: string;
  repository: string;
  support: string;
  trust: string;
  installed: boolean;
  installable: boolean;
  reasons: string[];
  integrityVerified: boolean;
}

export const REGISTRY_INSTALL_CAVEAT =
  "Eliza installer · integrity and fallback source unreported by this SDK.";

export function registryResultLabel({
  count,
  error,
  loading,
}: {
  count: number;
  error: string;
  loading: boolean;
}): string {
  if (loading) return "Searching…";
  if (error) return "Unavailable";
  return `${count} results`;
}

export function registryCatalogPresentation(entry: RegistryEntry) {
  return {
    eyebrow: entry.support === "community" ? undefined : entry.support,
    status: entry.installed
      ? "Installed"
      : entry.installable
        ? undefined
        : "Restricted",
    tone: entry.installed
      ? ("good" as const)
      : entry.installable
        ? undefined
        : ("neutral" as const),
    code: entry.packageName === entry.name ? undefined : entry.packageName,
    meta: `${entry.version} · ${entry.trust}`,
    detailsLabel: "Policy",
  };
}

export function normalizeRegistryEntries(value: unknown): RegistryEntry[] {
  const response = asRecord(value);
  const rows = asArray(
    response.results ?? response.entries ?? response.registries,
  );
  return rows
    .map((value): RegistryEntry | null => {
      const entry = asRecord(value);
      const policy = asRecord(entry.policy);
      const provenance = asRecord(policy.provenance);
      const name = asString(entry.name).trim();
      if (!name) return null;
      return {
        name,
        packageName: asString(provenance.packageName, name).trim(),
        description: asString(entry.description, "No description provided."),
        version: asString(
          provenance.version,
          asString(entry.latestVersion, "No v2 release"),
        ),
        repository: asString(provenance.repository, asString(entry.repository)),
        support: asString(provenance.support, "community"),
        trust: asString(policy.trust, "community"),
        installed: policy.installed === true,
        installable: policy.installable === true,
        reasons: asArray(policy.reasons)
          .map((reason) => asString(reason).trim())
          .filter(Boolean),
        integrityVerified: provenance.integrityVerified === true,
      };
    })
    .filter((entry): entry is RegistryEntry => entry !== null);
}
