import type { NativePluginManagerSummary } from "./types";

interface NativePluginManagerEntry {
  enabled?: unknown;
  source?: unknown;
}

function isNativePluginManagerEntry(
  entry: unknown,
): entry is NativePluginManagerEntry {
  return entry !== null && typeof entry === "object";
}

function countCategories(categories: unknown): number {
  return categories && typeof categories === "object"
    ? Object.keys(categories as Record<string, unknown>).length
    : 0;
}

export function buildDerivedPluginManagerSummary(
  plugins: unknown,
  categories: unknown,
): NativePluginManagerSummary {
  const summary: NativePluginManagerSummary = {
    total: 0,
    enabled: 0,
    official: 0,
    vendored: 0,
    categories: countCategories(categories),
  };

  if (!Array.isArray(plugins)) {
    return summary;
  }

  summary.total = plugins.length;

  for (const entry of plugins) {
    if (!isNativePluginManagerEntry(entry)) {
      continue;
    }
    if (entry.enabled) {
      summary.enabled += 1;
    }
    if (entry.source === "official") {
      summary.official += 1;
    }
    if (entry.source === "vendored") {
      summary.vendored += 1;
    }
  }

  return summary;
}
