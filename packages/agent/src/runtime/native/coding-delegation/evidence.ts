import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { DelegatedFileChange } from "./types";

const MAX_FILES = 2_000;
const MAX_FILE_BYTES = 2_000_000;
const EXCLUDED = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  ".vercel",
  ".DS_Store",
  "bun.lockb",
]);

interface FileSnapshot {
  sha256: string;
  bytes: number;
}

function safeRelativePath(root: string, path: string): string | undefined {
  const normalized = isAbsolute(path) ? path : resolve(root, path);
  const child = relative(root, normalized);
  if (
    !child ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  )
    return;
  const parts = child.split(sep);
  if (
    parts.some(
      (part) =>
        EXCLUDED.has(part) ||
        part.startsWith(".env") ||
        /^(?:credentials|secrets?|auth)(?:\.|$)/i.test(part),
    )
  )
    return;
  return normalized;
}

async function fingerprint(
  root: string,
  path: string,
): Promise<FileSnapshot | null> {
  if (!safeRelativePath(root, path)) return null;
  try {
    const stats = await lstat(path);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size > MAX_FILE_BYTES
    )
      return null;
    const canonical = await realpath(path);
    if (!safeRelativePath(await realpath(root), canonical)) return null;
    const bytes = await readFile(path);
    return {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    };
  } catch {
    return null;
  }
}

/** Bounded source-only fingerprints. Never recursively inventory a broad user directory. */
export class DelegationEvidence {
  private readonly before = new Map<string, FileSnapshot | null>();
  private readonly tracked = new Set<string>();
  private canInventory = true;
  private inventoryComplete = true;

  constructor(private readonly root: string) {}

  async start(): Promise<void> {
    const home = homedir();
    this.canInventory = ![
      sep,
      home,
      join(home, "Desktop"),
      join(home, "Documents"),
      join(home, "Downloads"),
    ].includes(this.root);
    if (!this.canInventory) return;
    for (const path of await this.paths()) {
      this.tracked.add(path);
      this.before.set(path, await fingerprint(this.root, path));
    }
  }

  async track(path: string): Promise<void> {
    const normalized = safeRelativePath(this.root, path);
    if (
      !normalized ||
      this.tracked.has(normalized) ||
      this.tracked.size >= MAX_FILES
    )
      return;
    this.tracked.add(normalized);
    this.before.set(normalized, await fingerprint(this.root, normalized));
  }

  async finish(): Promise<DelegatedFileChange[]> {
    if (this.canInventory && this.inventoryComplete) {
      for (const path of await this.paths()) this.tracked.add(path);
    }
    const changed: DelegatedFileChange[] = [];
    for (const path of this.tracked) {
      const before = this.before.get(path) ?? null;
      const after = await fingerprint(this.root, path);
      if (before?.sha256 === after?.sha256) continue;
      changed.push({
        path,
        beforeSha256: before?.sha256 ?? null,
        afterSha256: after?.sha256 ?? null,
        bytes: after?.bytes ?? 0,
      });
    }
    return changed;
  }

  private async paths(): Promise<string[]> {
    const paths: string[] = [];
    const pending = [this.root];
    let visited = 0;
    while (pending.length && visited < MAX_FILES) {
      const directory = pending.pop();
      if (!directory) break;
      const entries = await readdir(directory, { withFileTypes: true }).catch(
        () => [],
      );
      for (const entry of entries) {
        if (++visited > MAX_FILES) {
          this.inventoryComplete = false;
          break;
        }
        const path = join(directory, entry.name);
        if (!safeRelativePath(this.root, path) || entry.isSymbolicLink())
          continue;
        if (entry.isDirectory()) pending.push(path);
        else if (entry.isFile()) paths.push(path);
      }
    }
    if (pending.length) this.inventoryComplete = false;
    return paths;
  }
}
