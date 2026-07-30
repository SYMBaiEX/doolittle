import { statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { LocalProjectTarget } from "./types";

function expandProjectPath(inputPath: string, workspaceRoot: string): string {
  const home = process.env.HOME ?? workspaceRoot;
  const expanded = inputPath.startsWith("~/")
    ? join(home, inputPath.slice(2))
    : inputPath;
  const homeName = basename(home);
  const homeQualified =
    expanded === homeName || expanded.startsWith(`${homeName}/`)
      ? resolve(dirname(home), expanded)
      : undefined;

  if (isAbsolute(expanded)) {
    return resolve(expanded);
  }
  if (homeQualified) {
    return homeQualified;
  }
  if (/^(dev|code|projects)\//u.test(expanded)) {
    return resolve(home, expanded);
  }
  return resolve(workspaceRoot, expanded);
}

export function resolveLocalProjectTarget(
  inputPath: string,
  workspaceRoot: string,
): LocalProjectTarget | undefined {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return undefined;
  }

  const path = expandProjectPath(trimmed, workspaceRoot);
  try {
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return { path, kind: "directory" };
    }
    if (stats.isFile()) {
      return { path, kind: "file" };
    }
  } catch {
    return undefined;
  }

  return undefined;
}
