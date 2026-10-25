import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface WorkspaceManifest {
  name: string;
  version: string;
  private?: boolean;
  type?: string;
  exports?: string | Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface Workspace {
  directory: string;
  path: string;
  manifest: WorkspaceManifest;
}

/** Read exactly the package-manager workspace set, including nested providers. */
export function readWorkspaces(root: string): Workspace[] {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  ) as {
    workspaces: string[];
  };
  const paths = new Set(
    manifest.workspaces.flatMap((pattern) =>
      globSync(`${pattern}/package.json`, { cwd: root }),
    ),
  );
  return [...paths].sort().map((path) => ({
    directory: dirname(path).replaceAll("\\", "/"),
    path: resolve(root, path),
    manifest: JSON.parse(
      readFileSync(resolve(root, path), "utf8"),
    ) as WorkspaceManifest,
  }));
}

if (import.meta.main) {
  for (const workspace of readWorkspaces(process.cwd()))
    console.log(`${workspace.manifest.name}\t${workspace.directory}`);
}
