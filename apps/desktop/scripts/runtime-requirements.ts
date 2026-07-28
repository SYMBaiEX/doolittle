const DYNAMIC_COMMONJS_REQUIRE = /import\.meta\.url\)\("([^"]+)"\)/gu;

export function discoverDynamicCommonJsPackages(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(DYNAMIC_COMMONJS_REQUIRE)]
        .map((match) => match[1]?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort();
}
