export const MAX_APP_ASAR_BYTES = 128 * 1024 * 1024;

export type ProductionPackageManifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export function packageNamesFromAsarEntries(
  entries: readonly string[],
): string[] {
  const names = new Set<string>();
  for (const entry of entries) {
    const marker = "/node_modules/";
    let index = entry.indexOf(marker);
    while (index !== -1) {
      const segments = entry.slice(index + marker.length).split("/");
      const first = segments[0];
      if (first) {
        names.add(
          first.startsWith("@") && segments[1]
            ? `${first}/${segments[1]}`
            : first,
        );
      }
      index = entry.indexOf(marker, index + marker.length);
    }
  }
  return [...names].sort();
}

export function productionDependencyClosure(
  rootDependencies: Record<string, string> | undefined,
  dependenciesByPackage: ReadonlyMap<
    string,
    ProductionPackageManifest | undefined
  >,
): string[] {
  const closure = new Set<string>();
  const pending = Object.keys(rootDependencies ?? {});
  while (pending.length > 0) {
    const packageName = pending.pop();
    if (!packageName || closure.has(packageName)) continue;
    closure.add(packageName);
    const manifest = dependenciesByPackage.get(packageName);
    for (const dependency of Object.keys({
      ...manifest?.dependencies,
      ...manifest?.optionalDependencies,
    })) {
      pending.push(dependency);
    }
  }
  return [...closure].sort();
}

export function assertPackageComposition({
  asarBytes,
  packagedModules,
  allowedModules,
  maxAsarBytes = MAX_APP_ASAR_BYTES,
}: {
  asarBytes: number;
  packagedModules: readonly string[];
  allowedModules: readonly string[];
  maxAsarBytes?: number;
}): void {
  if (asarBytes > maxAsarBytes) {
    throw new Error(
      `app.asar is ${(asarBytes / 1024 / 1024).toFixed(1)} MiB; the limit is ${(maxAsarBytes / 1024 / 1024).toFixed(0)} MiB.`,
    );
  }
  const allowed = new Set(allowedModules);
  const unexpected = [...new Set(packagedModules)]
    .filter((packageName) => !allowed.has(packageName))
    .sort();
  if (unexpected.length > 0) {
    throw new Error(
      `app.asar contains unexpected production modules: ${unexpected.join(", ")}.`,
    );
  }
}
