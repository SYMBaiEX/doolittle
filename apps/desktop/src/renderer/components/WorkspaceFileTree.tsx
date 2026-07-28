import {
  type CSSProperties,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  allWorkspaceDirectories,
  visibleWorkspaceTree,
  type WorkspaceTreeEntry,
  workspaceEntryParent,
} from "../workspace-file-tree";
import "./workspace-file-tree.css";

function fileExtension(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  const suffix = name.split(".").at(-1);
  return suffix && suffix !== name ? suffix : "";
}

export function WorkspaceFileTree({
  entries,
  onOpenFile,
  selectedPath,
}: {
  entries: WorkspaceTreeEntry[];
  onOpenFile: (path: string) => void;
  selectedPath: string;
}) {
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    () => new Set(),
  );
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const directories = useMemo(
    () => allWorkspaceDirectories(entries),
    [entries],
  );
  const visibleEntries = useMemo(
    () => visibleWorkspaceTree(entries, expandedDirectories),
    [entries, expandedDirectories],
  );
  const fileCount = entries.filter((entry) => entry.type === "file").length;

  const toggleDirectory = (path: string, force?: boolean) => {
    setExpandedDirectories((current) => {
      const next = new Set(current);
      const shouldExpand = force ?? !next.has(path);
      if (shouldExpand) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  const focusPath = (path: string) => {
    requestAnimationFrame(() => itemRefs.current[path]?.focus());
  };

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const entry = visibleEntries[index];
    if (!entry) return;
    const previous = visibleEntries[index - 1];
    const next = visibleEntries[index + 1];

    if (event.key === "ArrowDown" && next) {
      event.preventDefault();
      focusPath(next.path);
    } else if (event.key === "ArrowUp" && previous) {
      event.preventDefault();
      focusPath(previous.path);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = visibleEntries[0];
      if (first) focusPath(first.path);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = visibleEntries.at(-1);
      if (last) focusPath(last.path);
    } else if (event.key === "ArrowRight" && entry.type === "directory") {
      event.preventDefault();
      if (!expandedDirectories.has(entry.path)) {
        toggleDirectory(entry.path, true);
      } else if (next?.parentPath === entry.path) {
        focusPath(next.path);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (entry.type === "directory" && expandedDirectories.has(entry.path)) {
        toggleDirectory(entry.path, false);
      } else {
        const parent = workspaceEntryParent(entry.path);
        if (parent) focusPath(parent);
      }
    } else if (
      (event.key === "Enter" || event.key === " ") &&
      entry.type === "directory"
    ) {
      event.preventDefault();
      toggleDirectory(entry.path);
    }
  };

  return (
    <div className="workspace-file-tree-shell">
      <header className="workspace-file-tree-header">
        <div>
          <strong>Workspace</strong>
          <span>
            {fileCount} files · {directories.length} folders
          </span>
        </div>
        <div>
          <button
            aria-label="Collapse all folders"
            disabled={expandedDirectories.size === 0}
            onClick={() => setExpandedDirectories(new Set())}
            title="Collapse all folders"
            type="button"
          >
            −
          </button>
          <button
            aria-label="Expand all folders"
            disabled={
              directories.length === 0 ||
              directories.every((path) => expandedDirectories.has(path))
            }
            onClick={() => setExpandedDirectories(new Set(directories))}
            title="Expand all folders"
            type="button"
          >
            +
          </button>
        </div>
      </header>
      <div
        aria-label="Workspace files"
        className="workspace-file-tree"
        role="tree"
      >
        {visibleEntries.map((entry, index) => {
          const directory = entry.type === "directory";
          const expanded = directory && expandedDirectories.has(entry.path);
          const suffix = directory ? "" : fileExtension(entry.path);
          return (
            <button
              aria-expanded={directory ? expanded : undefined}
              aria-level={entry.depth + 1}
              aria-selected={!directory && selectedPath === entry.path}
              className={`${entry.type} ${
                selectedPath === entry.path ? "selected" : ""
              }`}
              key={`${entry.type}:${entry.path}`}
              onClick={() =>
                directory ? toggleDirectory(entry.path) : onOpenFile(entry.path)
              }
              onKeyDown={(event) => handleItemKeyDown(event, index)}
              ref={(node) => {
                itemRefs.current[entry.path] = node;
              }}
              role="treeitem"
              style={
                {
                  "--tree-depth": entry.depth,
                } as CSSProperties
              }
              title={entry.path}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`workspace-tree-disclosure ${
                  directory ? "" : "file"
                }`}
              >
                {directory ? (expanded ? "⌄" : "›") : ""}
              </span>
              <span
                aria-hidden="true"
                className={`workspace-tree-icon ${entry.type}`}
              />
              <span className="workspace-tree-name">{entry.name}</span>
              {suffix ? (
                <small className="workspace-tree-extension">{suffix}</small>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
