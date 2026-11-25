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

export function registryInstallKey(entry: RegistryEntry): string {
  return JSON.stringify([entry.name, entry.packageName, entry.version]);
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

export function registryRepositoryLink(
  repository: string,
): { href: string; label: string } | null {
  let url: URL;
  try {
    url = new URL(repository);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const label =
    segments.length >= 2
      ? `${segments[0]}/${segments[1].replace(/\.git$/, "")}`
      : url.host;
  return { href: url.href, label };
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
