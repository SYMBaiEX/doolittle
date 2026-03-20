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
