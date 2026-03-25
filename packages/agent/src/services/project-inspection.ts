import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { $ } from "bun";

export interface LocalCodebaseMatch {
  path: string;
  exactBasenameMatch: boolean;
}

export interface LocalProjectInspection {
  name: string;
  path: string;
  type: string;
  packageName?: string;
  packageManager?: string;
  workspacePatterns: string[];
  scripts: string[];
  keyFolders: string[];
  git: {
    available: boolean;
    status?: string;
    recentCommit?: string;
  };
  topEntries: string[];
  readmePreview?: string;
}

function detectProjectKind(projectPath: string): string {
  const markers = [
    ["package.json", "Node/Bun package"],
    ["bun.lock", "Bun workspace"],
    ["pnpm-workspace.yaml", "pnpm workspace"],
    ["pyproject.toml", "Python project"],
    ["Cargo.toml", "Rust crate"],
    ["go.mod", "Go module"],
    ["Gemfile", "Ruby project"],
  ] as const;
  const detected = markers
    .filter(([file]) => existsSync(join(projectPath, file)))
    .map(([, label]) => label);
  return detected.length > 0 ? detected.join(", ") : "project directory";
}

function readProjectReadme(projectPath: string): string | undefined {
  for (const candidate of ["README.md", "README", "readme.md"]) {
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

interface PackageJsonSummary {
  packageName?: string;
  packageManager?: string;
  workspacePatterns: string[];
  scripts: string[];
}

function readPackageJsonSummary(projectPath: string): PackageJsonSummary {
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

function collectKeyFolders(projectPath: string): string[] {
  const prominentRoots = [
    "packages",
    "apps",
    "services",
    "plugins",
    "scripts",
    "docs",
    "examples",
    "src",
  ];
  const keyFolders: string[] = [];

  for (const rootName of prominentRoots) {
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

function resolveSearchRoots(workspaceDir: string): string[] {
  const home = process.env.HOME ?? workspaceDir;
  return [`${home}/dev`, `${home}/code`, `${home}/projects`, workspaceDir]
    .map((root) => resolve(root))
    .filter(
      (root, index, array) => existsSync(root) && array.indexOf(root) === index,
    );
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await $`command -v ${command}`.quiet();
    return true;
  } catch {
    return false;
  }
}

function rankCodebaseMatches(
  query: string,
  paths: string[],
): LocalCodebaseMatch[] {
  const normalizedQuery = basename(query).toLowerCase();
  return paths
    .map((path) => {
      const name = basename(path).toLowerCase();
      return {
        path,
        exactBasenameMatch: name === normalizedQuery,
      };
    })
    .sort((left, right) => {
      if (left.exactBasenameMatch !== right.exactBasenameMatch) {
        return left.exactBasenameMatch ? -1 : 1;
      }
      return left.path.length - right.path.length;
    });
}

export async function findLocalCodebases(
  query: string,
  workspaceDir: string,
): Promise<LocalCodebaseMatch[]> {
  const sanitizedQuery = query.replace(/[^a-zA-Z0-9._/\- ]/gu, "").trim();
  if (!sanitizedQuery) {
    return [];
  }

  const searchRoots = resolveSearchRoots(workspaceDir);
  if (!searchRoots.length) {
    return [];
  }

  const searchTerm = sanitizedQuery.includes("/")
    ? basename(sanitizedQuery)
    : sanitizedQuery;

  let rawMatches: string[] = [];
  if (await commandExists("fd")) {
    const results = await Promise.all(
      searchRoots.map(async (root) => {
        try {
          const output = await $`fd -HI -t d ${searchTerm} ${root}`
            .quiet()
            .text();
          return output
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }),
    );
    rawMatches = results.flat();
  } else {
    const results = await Promise.all(
      searchRoots.map(async (root) => {
        try {
          const output =
            await $`find ${root} -maxdepth 4 -type d ( -name .git -prune -o -iname ${`*${searchTerm}*`} -print )`
              .quiet()
              .text();
          return output
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }),
    );
    rawMatches = results.flat();
  }

  const unique = [...new Set(rawMatches)].filter((entry) => existsSync(entry));
  return rankCodebaseMatches(searchTerm, unique);
}

export async function inspectLocalProject(
  projectPath: string,
  options?: {
    topEntriesLimit?: number;
    readmeLines?: number;
  },
): Promise<LocalProjectInspection> {
  const packageJson = readPackageJsonSummary(projectPath);
  const topEntriesLimit = options?.topEntriesLimit ?? 12;
  const topEntries = readdirSync(projectPath)
    .filter((entry) => ![".git", "node_modules", "dist"].includes(entry))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, topEntriesLimit);

  const gitDirectory = join(projectPath, ".git");
  let gitStatus: string | undefined;
  let recentCommit: string | undefined;
  if (existsSync(gitDirectory)) {
    try {
      gitStatus = (
        await $`git -C ${projectPath} status --short --branch`.quiet().text()
      ).trim();
    } catch {
      gitStatus = undefined;
    }
    try {
      recentCommit = (
        await $`git -C ${projectPath} log -1 --pretty=format:%h%x20%s`
          .quiet()
          .text()
      ).trim();
    } catch {
      recentCommit = undefined;
    }
  }

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
    git: {
      available: existsSync(gitDirectory),
      status: gitStatus || undefined,
      recentCommit: recentCommit || undefined,
    },
    topEntries,
    readmePreview,
  };
}
