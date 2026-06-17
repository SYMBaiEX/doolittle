import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MAX_SOUL_CHARS = 5000;

// Memoize the (expensive) read + strip + slice keyed by path, guarded by mtime
// so SOUL.md edits are picked up. The directory walk stays live so newly
// created or deleted SOUL.md files are still detected.
const soulReadCache = new Map<string, { mtimeMs: number; text: string }>();

export type DoolittleSoul = {
  path?: string;
  text: string;
};

function stripHtmlComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function findDoolittleSoulFile(startDir: string): string | undefined {
  let current = resolve(startDir || process.cwd());
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(current, "SOUL.md");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}

export function readDoolittleSoul(startDir: string): DoolittleSoul {
  const path = findDoolittleSoulFile(startDir);
  if (!path) {
    return { text: "" };
  }

  try {
    const mtimeMs = statSync(path).mtimeMs;
    const cached = soulReadCache.get(path);
    if (cached && cached.mtimeMs === mtimeMs) {
      return { path, text: cached.text };
    }
    const text = stripHtmlComments(readFileSync(path, "utf8")).slice(
      0,
      MAX_SOUL_CHARS,
    );
    soulReadCache.set(path, { mtimeMs, text });
    return { path, text };
  } catch {
    return { path, text: "" };
  }
}

export function renderDoolittleSoulContext(startDir: string): string[] {
  const soul = readDoolittleSoul(startDir);
  if (!soul.text.trim()) {
    return [];
  }
  return [
    "Doolittle soul (SOUL.md):",
    ...(soul.path ? [`- source=${soul.path}`] : []),
    ...soul.text.split(/\r?\n/).map((line) => `> ${line}`),
  ];
}
