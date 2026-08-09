const DYNAMIC_COMMONJS_REQUIRE = /import\.meta\.url\)\("([^"]+)"\)/gu;
const RUNTIME_ASSET_REFERENCE =
  /new URL\(\s*["']\.\/([^"']+?\.(?:tar\.gz|wasm|data))["']\s*,\s*import\.meta\.url\s*\)/gu;

export type RuntimePackageManifest = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

export function discoverDynamicCommonJsPackages(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(DYNAMIC_COMMONJS_REQUIRE)]
        .map((match) => match[1]?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort();
}

export function discoverRuntimeAssetReferences(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(RUNTIME_ASSET_REFERENCE)]
        .map((match) => match[1]?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort();
}

export function runtimePackageClosure(
  rootPackages: readonly string[],
  manifests: ReadonlyMap<string, RuntimePackageManifest | undefined>,
): string[] {
  const packages = new Set<string>();
  const pending = [...rootPackages];
  while (pending.length > 0) {
    const packageName = pending.pop();
    if (!packageName || packages.has(packageName)) continue;
    packages.add(packageName);
    const manifest = manifests.get(packageName);
    pending.push(
      ...Object.keys(manifest?.dependencies ?? {}),
      ...Object.keys(manifest?.optionalDependencies ?? {}),
    );
  }
  return [...packages].sort();
}
