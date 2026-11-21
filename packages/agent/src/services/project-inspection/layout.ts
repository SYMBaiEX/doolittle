import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { readRegularFile } from "@doolittle/storage";
import { isWorkspacePathVisible } from "../workspace-service/policy";
import { iterateWorkspaceTree } from "../workspace-service/tree";

const PROJECT_KIND_MARKERS = [
  ["package.json", "JavaScript/TypeScript package"],
  ["nub.lock", "Nub workspace"],
  ["bun.lock", "Bun workspace"],
  ["pnpm-workspace.yaml", "pnpm workspace"],
  ["pyproject.toml", "Python project"],
  ["Cargo.toml", "Rust crate"],
  ["go.mod", "Go module"],
  ["Gemfile", "Ruby project"],
] as const;

const README_CANDIDATES = ["README.md", "README", "readme.md"] as const;

const PROMINENT_ROOTS = [
  "packages",
  "apps",
  "app",
  "components",
  "services",
  "server",
  "api",
  "plugins",
  "convex",
  "desktop",
  "game",
  "lib",
  "hooks",
  "scripts",
  "docs",
  "examples",
  "src",
] as const;

const NOTABLE_FILE_NAMES = [
  "package.json",
  "main.ts",
  "main.tsx",
  "main.js",
  "main.cjs",
  "index.ts",
  "index.tsx",
  "layout.tsx",
  "page.tsx",
  "schema.ts",
  "runtime.ts",
  "config.ts",
  "config.js",
  "config.cjs",
  "README.md",
] as const;

const PROJECT_README_BYTE_LIMIT = 1024 * 1024;

function detectProjectKind(entries: Set<string>): string {
  const detected = PROJECT_KIND_MARKERS.filter(([file]) =>
    entries.has(file),
  ).map(([, label]) => label);
  return detected.length > 0 ? detected.join(", ") : "project directory";
}

export async function readProjectReadme(
  projectPath: string,
  maxLines: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  for (const candidate of README_CANDIDATES) {
    signal?.throwIfAborted();
    try {
      const bytes = await readRegularFile(
        join(projectPath, candidate),
        PROJECT_README_BYTE_LIMIT,
        { signal },
      );
      const preview = bytes
        .toString("utf8")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, Math.min(120, maxLines))
        .join("\n");
      if (preview) return preview;
    } catch (error) {
      signal?.throwIfAborted();
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
    }
  }
}

function notableFileScore(path: string): number {
  const name = basename(path);
  const priority = NOTABLE_FILE_NAMES.indexOf(
    name as (typeof NOTABLE_FILE_NAMES)[number],
  );
  const depth = path.split("/").length;
  return (
    (priority >= 0 ? priority : NOTABLE_FILE_NAMES.length + 10) * 100 + depth
  );
}

async function inspectProminentRoot(
  projectPath: string,
  rootName: string,
  signal?: AbortSignal,
): Promise<{ children: string[]; files: string[] }> {
  const children: string[] = [];
  const bestFiles: Array<{ path: string; score: number }> = [];
  try {
    for await (const entry of iterateWorkspaceTree(projectPath, 2, {
      startDir: join(projectPath, rootName),
      requireCanonicalDirectories: true,
      signal,
      includeName: (name) => !name.startsWith(".") && name !== "_generated",
    })) {
      if (entry.depth === 0 && children.length < 4) {
        children.push(entry.path);
      }
      if (entry.type !== "file") continue;
      const score = notableFileScore(entry.path);
      const position = bestFiles.findIndex(
        (candidate) =>
          score < candidate.score ||
          (score === candidate.score &&
            entry.path.localeCompare(candidate.path) < 0),
      );
      if (position >= 0) {
        bestFiles.splice(position, 0, { path: entry.path, score });
        bestFiles.length = Math.min(bestFiles.length, 3);
      } else if (bestFiles.length < 3) {
        bestFiles.push({ path: entry.path, score });
      }
    }
  } catch {
    signal?.throwIfAborted();
    // Unavailable or concurrently removed project subdirectories remain optional.
  }
  return { children, files: bestFiles.map(({ path }) => path) };
}

export async function inspectProjectLayout(
  projectPath: string,
  limit: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const entries = (await readdir(projectPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .filter((entry) => isWorkspacePathVisible(entry.name));
  signal?.throwIfAborted();
  const names = new Set(entries.map(({ name }) => name));
  const files = new Set(
    entries.filter((entry) => entry.isFile()).map(({ name }) => name),
  );
  const directories = new Set(
    entries.filter((entry) => entry.isDirectory()).map(({ name }) => name),
  );
  const roots = PROMINENT_ROOTS.filter((name) => directories.has(name));
  const details = await Promise.all(
    roots.map((name) => inspectProminentRoot(projectPath, name, signal)),
  );
  signal?.throwIfAborted();
  const topEntries = [...names]
    .sort((left, right) => {
      const leftHidden = left.startsWith(".");
      const rightHidden = right.startsWith(".");
      if (leftHidden !== rightHidden) {
        return leftHidden ? 1 : -1;
      }
      return left.localeCompare(right);
    })
    .slice(0, limit);
  return {
    type: detectProjectKind(names),
    topEntries,
    keyFolders: [
      ...roots,
      ...details.flatMap(({ children }) => children),
    ].slice(0, 20),
    notableFiles: [
      ...NOTABLE_FILE_NAMES.filter((name) => files.has(name)),
      ...details.flatMap(({ files }) => files),
    ].slice(0, 32),
  };
}
