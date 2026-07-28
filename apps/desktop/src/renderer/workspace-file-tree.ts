export interface WorkspaceTreeEntry {
  path: string;
  type: "file" | "directory";
  depth: number;
}

export interface VisibleWorkspaceTreeEntry extends WorkspaceTreeEntry {
  name: string;
  parentPath: string;
}

function normalizedPath(path: string): string {
  return path
    .replace(/\\/gu, "/")
    .replace(/^\.\/+/u, "")
    .replace(/\/+$/u, "");
}

export function workspaceEntryParent(path: string): string {
  const normalized = normalizedPath(path);
  const split = normalized.lastIndexOf("/");
  return split === -1 ? "" : normalized.slice(0, split);
}

export function workspaceDirectoryAncestors(path: string): string[] {
  const ancestors: string[] = [];
  let parent = workspaceEntryParent(path);
  while (parent) {
    ancestors.unshift(parent);
    parent = workspaceEntryParent(parent);
  }
  return ancestors;
}

function entryName(path: string): string {
  return normalizedPath(path).split("/").at(-1) ?? path;
}

function normalizedEntries(
  entries: WorkspaceTreeEntry[],
): Map<string, WorkspaceTreeEntry> {
  const nodes = new Map<string, WorkspaceTreeEntry>();
  for (const entry of entries) {
    const path = normalizedPath(entry.path);
    if (!path) continue;
    nodes.set(path, {
      path,
      type: entry.type,
      depth: Math.max(0, entry.depth),
    });
    for (const ancestor of workspaceDirectoryAncestors(path)) {
      if (!nodes.has(ancestor)) {
        nodes.set(ancestor, {
          path: ancestor,
          type: "directory",
          depth: Math.max(0, ancestor.split("/").length - 1),
        });
      }
    }
  }
  return nodes;
}

export function allWorkspaceDirectories(
  entries: WorkspaceTreeEntry[],
): string[] {
  return [...normalizedEntries(entries).values()]
    .filter((entry) => entry.type === "directory")
    .map((entry) => entry.path);
}

export function visibleWorkspaceTree(
  entries: WorkspaceTreeEntry[],
  expandedDirectories: ReadonlySet<string>,
): VisibleWorkspaceTreeEntry[] {
  const nodes = normalizedEntries(entries);
  const children = new Map<string, WorkspaceTreeEntry[]>();
  for (const entry of nodes.values()) {
    const parent = workspaceEntryParent(entry.path);
    const siblings = children.get(parent) ?? [];
    siblings.push(entry);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "directory" ? -1 : 1;
      }
      return entryName(left.path).localeCompare(entryName(right.path), [], {
        numeric: true,
        sensitivity: "base",
      });
    });
  }

  const visible: VisibleWorkspaceTreeEntry[] = [];
  const visit = (parentPath: string, depth: number) => {
    for (const entry of children.get(parentPath) ?? []) {
      visible.push({
        ...entry,
        depth,
        name: entryName(entry.path),
        parentPath,
      });
      if (entry.type === "directory" && expandedDirectories.has(entry.path)) {
        visit(entry.path, depth + 1);
      }
    }
  };
  visit("", 0);
  return visible;
}
