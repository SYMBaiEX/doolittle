export function officialElizaDependencyVersion(
  name: string,
  value: unknown,
): string | undefined {
  if (
    name.includes(">") ||
    (name !== "elizaos" && !name.startsWith("@elizaos/")) ||
    typeof value !== "string" ||
    value.startsWith("workspace:")
  ) {
    return undefined;
  }
  return value;
}

/** Packages can advance independently; exceptions must remain exact and reviewable. */
export function expectedElizaPackageVersion(
  name: string,
  baseline: string,
  packageVersions: Readonly<Record<string, string>> = {},
): string {
  const version = packageVersions[name] ?? baseline;
  if (!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/iu.test(version)) {
    throw new Error(
      `ElizaOS ${name} requires an exact package version: ${version}`,
    );
  }
  return version;
}
