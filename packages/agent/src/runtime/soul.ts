import { lstatSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isStrictlyContainedPath } from "../utils/path-containment";
import { readRegularFileSync } from "../utils/read-regular-file";

const MAX_SOUL_CHARS = 5000;
const MAX_SOUL_BYTES = 1024 * 1024;

export type DoolittleSoul = {
  path?: string;
  text: string;
};

function stripHtmlComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function contained(root: string, candidate: string): boolean {
  return candidate === root || isStrictlyContainedPath(root, candidate);
}

/** Default authority is startDir, matching ContextFilesService. */
export function findDoolittleSoulFile(
  startDir: string,
  trustedRoot?: string,
): string | undefined {
  let current: string;
  let root: string;
  try {
    current = realpathSync(resolve(startDir || process.cwd()));
    root = trustedRoot ? realpathSync(resolve(trustedRoot)) : current;
  } catch {
    return undefined;
  }
  if (!contained(root, current)) return undefined;

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(current, "SOUL.md");
    try {
      const canonical = realpathSync(candidate);
      if (isStrictlyContainedPath(root, canonical)) return candidate;
    } catch {
      // Missing or unreadable candidates do not stop bounded discovery.
    }
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current || !contained(root, parent)) break;
    current = parent;
  }
  return undefined;
}

export function readDoolittleSoul(
  startDir: string,
  trustedRoot?: string,
): DoolittleSoul {
  const path = findDoolittleSoulFile(startDir, trustedRoot);
  if (!path) return { text: "" };

  try {
    const root = realpathSync(
      resolve(trustedRoot || startDir || process.cwd()),
    );
    const canonical = realpathSync(path);
    if (!isStrictlyContainedPath(root, canonical)) return { text: "" };
    // A SOUL leaf link is never needed: workspace selectors are canonicalized
    // during discovery. Reject it even on platforms without O_NOFOLLOW.
    if (lstatSync(path).isSymbolicLink()) return { text: "" };
    const text = stripHtmlComments(
      readRegularFileSync(path, MAX_SOUL_BYTES).toString("utf8"),
    ).slice(0, MAX_SOUL_CHARS);
    return { path, text };
  } catch {
    return { text: "" };
  }
}

export function renderDoolittleSoulContext(
  startDir: string,
  trustedRoot?: string,
): string[] {
  const soul = readDoolittleSoul(startDir, trustedRoot);
  if (!soul.text.trim()) {
    return [];
  }
  return [
    "Doolittle soul (SOUL.md):",
    ...(soul.path ? [`- source=${soul.path}`] : []),
    ...soul.text.split(/\r?\n/).map((line) => `> ${line}`),
  ];
}
