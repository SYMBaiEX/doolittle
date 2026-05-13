import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export function resolveLocalProjectPath(
  inputPath: string,
  workspaceDir: string,
): string | undefined {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return undefined;
  }
  const home = process.env.HOME ?? workspaceDir;
  const expanded = trimmed.startsWith("~/")
    ? join(home, trimmed.slice(2))
    : trimmed;
  const homeName = basename(home);
  const homeQualified =
    expanded === homeName || expanded.startsWith(`${homeName}/`)
      ? resolve(dirname(home), expanded)
      : undefined;
  const resolved = isAbsolute(expanded)
    ? resolve(expanded)
    : homeQualified
      ? homeQualified
      : /^(dev|code|projects)\//u.test(expanded)
        ? resolve(home, expanded)
        : resolve(workspaceDir, expanded);
  return existsSync(resolved) ? resolved : undefined;
}
