import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { listNativeCapabilityTruth } from "@doolittle/agent/runtime/native/capability-truth";
import { readRegularFileSync } from "@doolittle/agent/utils/read-regular-file";
import { buildInventoryRows } from "./inventory";
import {
  renderCapabilityTruth,
  renderPluginInventory,
  renderPluginReadme,
} from "./render";
import { pluginReadmeTargets } from "./targets";
import type { SyncMode } from "./types";

const MARKDOWN_LINK_TARGETS = [
  "README.md",
  "docs/eliza-maximization-matrix.md",
  "docs/monorepo.md",
  "docs/quickstart.md",
] as const;

function insideRoot(root: string, target: string): boolean {
  const rel = relative(realpathSync(root), realpathSync(target));
  return !isAbsolute(rel) && rel !== ".." && !/^\.\.(?:[\\/]|$)/u.test(rel);
}

function ensureGeneratedDirectory(root: string, directory: string): void {
  const rel = relative(root, directory);
  if (isAbsolute(rel) || rel === ".." || /^\.\.(?:[\\/]|$)/u.test(rel)) {
    throw new Error(
      `Generated documentation directory escapes repository: ${directory}`,
    );
  }
  let current = root;
  for (const component of rel.split(/[\\/]/u).filter(Boolean)) {
    current = join(current, component);
    if (!existsSync(current)) mkdirSync(current);
    if (
      lstatSync(current).isSymbolicLink() ||
      !lstatSync(current).isDirectory() ||
      !insideRoot(root, current)
    ) {
      throw new Error(
        `Generated documentation directory is unsafe: ${current}`,
      );
    }
  }
}

function readDocFile(path: string): string {
  return readRegularFileSync(path, 16 * 1024 * 1024).toString("utf8");
}

function markdownFragment(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/gu, "")
    .replace(/[`*_~]/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/gu, "-");
}

function hasMarkdownFragment(content: string, fragment: string): boolean {
  const headings = [...content.matchAll(/^#{1,6}\s+(.+)$/gmu)].map((match) =>
    markdownFragment(match[1] ?? ""),
  );
  if (headings.length === 0) return true;

  const wanted = decodeURIComponent(fragment).toLowerCase();
  return headings.some((heading, index) => {
    const duplicateIndex = headings
      .slice(0, index)
      .filter((item) => item === heading).length;
    return (
      (duplicateIndex ? `${heading}-${duplicateIndex}` : heading) === wanted
    );
  });
}

/**
 * Checks the small set of architecture docs that are maintained alongside the
 * generated truth files. External URLs, mail links, and same-page anchors are
 * intentionally ignored; local files and Markdown heading fragments are
 * checked without following or executing anything.
 */
export function validateMarkdownLinks(
  root: string,
  files: readonly string[] = MARKDOWN_LINK_TARGETS,
): string[] {
  const failures: string[] = [];
  const linkPattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/gu;

  for (const relativePath of files) {
    const absolutePath = join(root, relativePath);
    if (
      !existsSync(absolutePath) ||
      !insideRoot(root, absolutePath) ||
      lstatSync(absolutePath).isSymbolicLink()
    ) {
      failures.push(`${relativePath}: file does not exist`);
      continue;
    }
    const content = readDocFile(absolutePath);
    for (const match of content.matchAll(linkPattern)) {
      const rawTarget = (match[1] ?? "").replace(/^<|>$/gu, "");
      if (
        !rawTarget ||
        rawTarget.startsWith("#") ||
        /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(rawTarget)
      ) {
        continue;
      }

      const [targetPath, fragment] = rawTarget.split("#", 2);
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(targetPath);
      } catch {
        failures.push(`${relativePath}: invalid link encoding: ${rawTarget}`);
        continue;
      }
      const target = join(dirname(absolutePath), decodedPath);
      const repositoryRelativeTarget = relative(root, target);
      if (
        decodedPath.startsWith("/") ||
        /^[A-Za-z]:[\\/]/u.test(decodedPath) ||
        repositoryRelativeTarget === ".." ||
        /^\.\.(?:[\\/]|$)/u.test(repositoryRelativeTarget)
      ) {
        const line = content.slice(0, match.index ?? 0).split("\n").length;
        failures.push(
          `${relativePath}:${line}: link escapes repository: ${rawTarget}`,
        );
        continue;
      }
      if (
        !existsSync(target) ||
        !insideRoot(root, target) ||
        lstatSync(target).isSymbolicLink()
      ) {
        const line = content.slice(0, match.index ?? 0).split("\n").length;
        failures.push(
          `${relativePath}:${line}: missing link target: ${rawTarget}`,
        );
        continue;
      }
      if (!fragment || !lstatSync(target).isFile() || !target.endsWith(".md")) {
        continue;
      }
      try {
        if (!hasMarkdownFragment(readDocFile(target), fragment)) {
          const line = content.slice(0, match.index ?? 0).split("\n").length;
          failures.push(
            `${relativePath}:${line}: missing link fragment: ${rawTarget}`,
          );
        }
      } catch {
        failures.push(`${relativePath}: invalid link fragment: ${rawTarget}`);
      }
    }
  }
  return failures;
}

export function writeGeneratedDocFile(
  root: string,
  path: string,
  expected: string,
): void {
  const absolute = join(root, path);
  ensureGeneratedDirectory(root, dirname(absolute));
  const temporary = join(
    dirname(absolute),
    `.doolittle-doc-${randomUUID()}.tmp`,
  );
  const mode =
    existsSync(absolute) && !lstatSync(absolute).isSymbolicLink()
      ? lstatSync(absolute).mode & 0o777
      : 0o666 & ~process.umask();
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(descriptor, expected, "utf8");
    fchmodSync(descriptor, mode);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, absolute);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function syncFile(
  root: string,
  mode: SyncMode,
  path: string,
  expected: string,
) {
  const absolute = join(root, path);
  const current =
    existsSync(absolute) && !lstatSync(absolute).isSymbolicLink()
      ? readDocFile(absolute)
      : null;
  if (current === expected) {
    return null;
  }

  if (mode === "write") {
    writeGeneratedDocFile(root, path, expected);
    return null;
  }

  return path;
}

export function runSyncDocTruth(options?: { root?: string; mode?: SyncMode }) {
  const root = options?.root ?? process.cwd();
  const mode = options?.mode ?? "check";
  const inventoryRows = buildInventoryRows(root);
  const capabilityTruth = listNativeCapabilityTruth();
  const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
  const failures = [
    syncFile(
      root,
      mode,
      "docs/plugin-inventory.md",
      renderPluginInventory(inventoryRows),
    ),
    syncFile(
      root,
      mode,
      "docs/capability-truth.md",
      renderCapabilityTruth(capabilityTruth),
    ),
  ].filter(Boolean) as string[];

  for (const target of pluginReadmeTargets) {
    const row = inventoryById.get(target.id);
    const truth = capabilityTruth.find((entry) => entry.id === target.id);
    if (!row || !truth) {
      failures.push(target.path);
      continue;
    }
    const failure = syncFile(
      root,
      mode,
      target.path,
      renderPluginReadme(row, truth),
    );
    if (failure) {
      failures.push(failure);
    }
  }

  failures.push(...validateMarkdownLinks(root));

  return failures;
}
