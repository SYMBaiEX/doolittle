import { join } from "node:path";
import { readRegularFile } from "@doolittle/storage";
import type { PackageJsonSummary } from "./types";

const PACKAGE_JSON_BYTE_LIMIT = 2 * 1024 * 1024;

export async function readPackageJsonSummary(
  projectPath: string,
  signal?: AbortSignal,
): Promise<PackageJsonSummary> {
  signal?.throwIfAborted();

  try {
    const bytes = await readRegularFile(
      join(projectPath, "package.json"),
      PACKAGE_JSON_BYTE_LIMIT,
      { signal },
    );
    const parsed = JSON.parse(bytes.toString("utf8")) as {
      name?: unknown;
      packageManager?: unknown;
      workspaces?: unknown;
      scripts?: unknown;
    };
    const workspaces = Array.isArray(parsed.workspaces)
      ? parsed.workspaces
      : parsed.workspaces &&
          typeof parsed.workspaces === "object" &&
          Array.isArray((parsed.workspaces as { packages?: unknown }).packages)
        ? ((parsed.workspaces as { packages: unknown[] }).packages ?? [])
        : [];

    return {
      packageName:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : undefined,
      packageManager:
        typeof parsed.packageManager === "string" &&
        parsed.packageManager.trim()
          ? parsed.packageManager.trim()
          : undefined,
      workspacePatterns: workspaces
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 8),
      scripts:
        parsed.scripts && typeof parsed.scripts === "object"
          ? Object.keys(parsed.scripts as Record<string, unknown>)
              .filter(Boolean)
              .sort((left, right) => left.localeCompare(right))
              .slice(0, 10)
          : [],
    };
  } catch {
    signal?.throwIfAborted();
    return { workspacePatterns: [], scripts: [] };
  }
}
