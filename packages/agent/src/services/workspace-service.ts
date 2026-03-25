import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import type { WorkspaceEntry } from "@/types";

const ignoredNames = new Set([
  ".git",
  ".eliza",
  ".idea",
  ".next",
  ".turbo",
  ".eliza-agent",
  "dist",
  "node_modules",
]);

export class WorkspaceService {
  constructor(private readonly workspaceDir: string) {}

  root(): string {
    return this.workspaceDir;
  }

  tree(maxDepth = 2): WorkspaceEntry[] {
    const entries: WorkspaceEntry[] = [];
    this.walk(this.workspaceDir, 0, maxDepth, entries);
    return entries;
  }

  read(path: string): string {
    const resolvedPath = this.resolvePath(path);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Path not found: ${path}`);
    }
    return readFileSync(resolvedPath, "utf8");
  }

  write(path: string, content: string): string {
    const resolvedPath = this.resolvePath(path);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, content, "utf8");
    return resolvedPath;
  }

  search(
    query: string,
    maxResults = 25,
  ): Array<{ path: string; matches: string[] }> {
    const ripgrepResults = this.searchWithRipgrep(query, maxResults);
    if (ripgrepResults) {
      return ripgrepResults;
    }

    const lowerQuery = query.toLowerCase();
    const results: Array<{ path: string; matches: string[] }> = [];

    for (const entry of this.tree(8)) {
      if (entry.type !== "file") {
        continue;
      }

      const absolutePath = this.resolvePath(entry.path);
      let content = "";
      try {
        content = readFileSync(absolutePath, "utf8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      const matches = lines
        .filter((line) => line.toLowerCase().includes(lowerQuery))
        .slice(0, 3);

      if (matches.length) {
        results.push({
          path: entry.path,
          matches,
        });
      }

      if (results.length >= maxResults) {
        break;
      }
    }

    return results;
  }

  private searchWithRipgrep(
    query: string,
    maxResults: number,
  ): Array<{ path: string; matches: string[] }> | undefined {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const proc = Bun.spawnSync({
        cmd: [
          "rg",
          "--no-heading",
          "--line-number",
          "--color",
          "never",
          "--hidden",
          "--fixed-strings",
          "--max-count",
          "3",
          "--glob",
          "!.git",
          "--glob",
          "!node_modules",
          "--glob",
          "!.eliza-agent",
          "--glob",
          "!dist",
          trimmed,
          ".",
        ],
        cwd: this.workspaceDir,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (proc.exitCode !== 0 && proc.exitCode !== 1) {
        return undefined;
      }

      const stdout = proc.stdout
        ? Buffer.from(proc.stdout).toString("utf8")
        : "";
      if (!stdout.trim()) {
        return [];
      }

      const grouped = new Map<string, string[]>();
      for (const line of stdout.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const match = line.match(/^(.+?):\d+:(.*)$/u);
        if (!match) {
          continue;
        }
        const [, path, content] = match;
        const existing = grouped.get(path) ?? [];
        if (existing.length < 3) {
          existing.push(content);
        }
        grouped.set(path, existing);
        if (grouped.size >= maxResults) {
          break;
        }
      }

      return Array.from(grouped.entries()).map(([path, matches]) => ({
        path: path.replaceAll("\\", "/"),
        matches,
      }));
    } catch {
      return undefined;
    }
  }

  summary(maxEntries = 20): string {
    const entries = this.tree(2).slice(0, maxEntries);
    if (!entries.length) {
      return "(empty workspace)";
    }

    return entries
      .map(
        (entry) =>
          `${"  ".repeat(entry.depth)}- ${entry.path}${entry.type === "directory" ? "/" : ""}`,
      )
      .join("\n");
  }

  private walk(
    currentDir: string,
    depth: number,
    maxDepth: number,
    entries: WorkspaceEntry[],
  ): void {
    if (depth > maxDepth) {
      return;
    }

    const dirEntries = readdirSync(currentDir).sort((left, right) =>
      left.localeCompare(right),
    );
    for (const name of dirEntries) {
      if (ignoredNames.has(name)) {
        continue;
      }

      const absolutePath = join(currentDir, name);
      const relativePath = relative(this.workspaceDir, absolutePath).replaceAll(
        "\\",
        "/",
      );
      const stat = statSync(absolutePath);

      if (stat.isDirectory()) {
        entries.push({
          path: relativePath,
          type: "directory",
          depth,
        });
        this.walk(absolutePath, depth + 1, maxDepth, entries);
        continue;
      }

      entries.push({
        path: relativePath,
        type: "file",
        depth,
      });
    }
  }

  private resolvePath(path: string): string {
    const trimmed = path.trim();
    const resolvedPath = resolve(
      trimmed.startsWith(this.workspaceDir)
        ? trimmed
        : join(this.workspaceDir, trimmed),
    );
    const normalizedWorkspace = normalize(
      this.workspaceDir.endsWith(sep)
        ? this.workspaceDir
        : `${this.workspaceDir}${sep}`,
    );

    if (
      resolvedPath !== this.workspaceDir &&
      !resolvedPath.startsWith(normalizedWorkspace)
    ) {
      throw new Error("Path must stay inside the configured workspace.");
    }

    return resolvedPath;
  }
}
