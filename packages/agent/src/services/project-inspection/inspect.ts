import { basename } from "node:path";
import { inspectGitState } from "./git";
import {
  collectKeyFolders,
  detectProjectKind,
  listTopEntries,
  readProjectReadme,
} from "./layout";
import { readPackageJsonSummary } from "./package-json";
import type { LocalProjectInspection } from "./types";

export async function inspectLocalProject(
  projectPath: string,
  options?: {
    topEntriesLimit?: number;
    readmeLines?: number;
  },
): Promise<LocalProjectInspection> {
  const packageJson = readPackageJsonSummary(projectPath);
  const git = await inspectGitState(projectPath);
  const topEntriesLimit = options?.topEntriesLimit ?? 12;
  const readmePreview = readProjectReadme(projectPath)
    ?.split("\n")
    .slice(0, options?.readmeLines ?? 8)
    .join("\n");

  return {
    name: basename(projectPath),
    path: projectPath,
    type: detectProjectKind(projectPath),
    packageName: packageJson.packageName,
    packageManager: packageJson.packageManager,
    workspacePatterns: packageJson.workspacePatterns,
    scripts: packageJson.scripts,
    keyFolders: collectKeyFolders(projectPath),
    git,
    topEntries: listTopEntries(projectPath, topEntriesLimit),
    readmePreview,
  };
}
