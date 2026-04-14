import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_KIND_MARKERS = [
  ["package.json", "Node/Bun package"],
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
  "services",
  "plugins",
  "scripts",
  "docs",
  "examples",
  "src",
] as const;

const IGNORED_TOP_ENTRIES = new Set([".git", "node_modules", "dist"]);

export function detectProjectKind(projectPath: string): string {
  const detected = PROJECT_KIND_MARKERS.filter(([file]) =>
    existsSync(join(projectPath, file)),
  ).map(([, label]) => label);
  return detected.length > 0 ? detected.join(", ") : "project directory";
}

export function readProjectReadme(projectPath: string): string | undefined {
  for (const candidate of README_CANDIDATES) {
    const target = join(projectPath, candidate);
    if (!existsSync(target)) {
      continue;
    }

    try {
      const preview = readFileSync(target, "utf8")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8)
        .join("\n");
      if (preview) {
        return preview;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function collectKeyFolders(projectPath: string): string[] {
  const keyFolders: string[] = [];

  for (const rootName of PROMINENT_ROOTS) {
    const rootPath = join(projectPath, rootName);
    if (!existsSync(rootPath)) {
      continue;
    }

    keyFolders.push(rootName);
    try {
      const children = readdirSync(rootPath)
        .filter((entry) => !entry.startsWith("."))
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 4)
        .map((entry) => `${rootName}/${entry}`);
      keyFolders.push(...children);
    } catch {
      // Best effort only.
    }
  }

  return [...new Set(keyFolders)].slice(0, 12);
}

export function listTopEntries(projectPath: string, limit: number): string[] {
  return readdirSync(projectPath)
    .filter((entry) => !IGNORED_TOP_ENTRIES.has(entry))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}
