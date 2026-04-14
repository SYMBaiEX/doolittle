import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PackageJsonSummary } from "./types";

export function readPackageJsonSummary(
  projectPath: string,
): PackageJsonSummary {
  const packageJsonPath = join(projectPath, "package.json");
  if (!existsSync(packageJsonPath)) {
    return { workspacePatterns: [], scripts: [] };
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
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
    return { workspacePatterns: [], scripts: [] };
  }
}
