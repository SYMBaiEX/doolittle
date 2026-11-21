import { realpath } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { currentConversationWorkspace } from "../../runtime/workspace-scope";
import { inspectGitState } from "./git";
import { inspectProjectLayout, readProjectReadme } from "./layout";
import { readPackageJsonSummary } from "./package-json";
import type { LocalProjectInspection } from "./types";

export async function inspectLocalProject(
  projectPath: string,
  options?: {
    topEntriesLimit?: number;
    readmeLines?: number;
    signal?: AbortSignal;
  },
): Promise<LocalProjectInspection> {
  const { signal } = options ?? {};
  signal?.throwIfAborted();
  const scope = currentConversationWorkspace();
  const root = await realpath(projectPath);
  if (
    scope?.workspacePath === resolve(projectPath) &&
    root !== scope.workspacePath
  )
    throw new Error(
      "The authorized workspace no longer resolves to its original root.",
    );
  signal?.throwIfAborted();
  const [packageJson, git, layout, readmePreview] = await Promise.all([
    readPackageJsonSummary(root, signal),
    inspectGitState(root, signal),
    inspectProjectLayout(root, options?.topEntriesLimit ?? 12, signal),
    readProjectReadme(root, options?.readmeLines ?? 40, signal),
  ]);
  signal?.throwIfAborted();

  return {
    name: basename(projectPath),
    path: projectPath,
    ...layout,
    packageName: packageJson.packageName,
    packageManager: packageJson.packageManager,
    workspacePatterns: packageJson.workspacePatterns,
    scripts: packageJson.scripts,
    git,
    readmePreview,
  };
}
