import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { listNativeCapabilityTruth } from "@/runtime/native/capability-truth";
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
    if (!existsSync(absolutePath)) {
      failures.push(`${relativePath}: file does not exist`);
      continue;
    }
    const content = readFileSync(absolutePath, "utf8");
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
      if (!existsSync(target)) {
        const line = content.slice(0, match.index ?? 0).split("\n").length;
        failures.push(
          `${relativePath}:${line}: missing link target: ${rawTarget}`,
        );
        continue;
      }
      if (!fragment || !statSync(target).isFile() || !target.endsWith(".md")) {
        continue;
      }
      try {
        if (!hasMarkdownFragment(readFileSync(target, "utf8"), fragment)) {
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

function syncFile(
  root: string,
  mode: SyncMode,
  path: string,
  expected: string,
) {
  const absolute = join(root, path);
  const current = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
  if (current === expected) {
    return null;
  }

  if (mode === "write") {
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, expected, "utf8");
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
