import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

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

const IGNORED_TOP_ENTRIES = new Set([
  ".git",
  ".next",
  ".playwright-cli",
  "node_modules",
  "dist",
]);

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
        .slice(0, 120)
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

function listFiles(
  rootPath: string,
  currentPath: string,
  depth: number,
): string[] {
  if (depth < 0) {
    return [];
  }

  try {
    return readdirSync(currentPath)
      .filter(
        (entry) =>
          !entry.startsWith(".") &&
          entry !== "node_modules" &&
          entry !== "_generated",
      )
      .flatMap((entry) => {
        const targetPath = join(currentPath, entry);
        try {
          return statSync(targetPath).isDirectory()
            ? listFiles(rootPath, targetPath, depth - 1)
            : [relative(rootPath, targetPath)];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
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

export function collectNotableFiles(projectPath: string): string[] {
  const rootFiles = NOTABLE_FILE_NAMES.filter((fileName) =>
    existsSync(join(projectPath, fileName)),
  );
  const roots = PROMINENT_ROOTS.filter((rootName) =>
    existsSync(join(projectPath, rootName)),
  );
  const perRoot = roots.flatMap((rootName) =>
    listFiles(projectPath, join(projectPath, rootName), 2)
      .sort((left, right) => {
        const scoreDifference =
          notableFileScore(left) - notableFileScore(right);
        return scoreDifference || left.localeCompare(right);
      })
      .slice(0, 3),
  );

  return [...new Set([...rootFiles, ...perRoot])].slice(0, 32);
}

export function collectKeyFolders(projectPath: string): string[] {
  const roots = PROMINENT_ROOTS.filter((rootName) =>
    existsSync(join(projectPath, rootName)),
  );
  const keyFolders: string[] = [...roots];

  for (const rootName of roots) {
    const rootPath = join(projectPath, rootName);
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

  return [...new Set(keyFolders)].slice(0, 20);
}

export function listTopEntries(projectPath: string, limit: number): string[] {
  return readdirSync(projectPath)
    .filter((entry) => !IGNORED_TOP_ENTRIES.has(entry))
    .sort((left, right) => {
      const leftHidden = left.startsWith(".");
      const rightHidden = right.startsWith(".");
      if (leftHidden !== rightHidden) {
        return leftHidden ? 1 : -1;
      }
      return left.localeCompare(right);
    })
    .slice(0, limit);
}
