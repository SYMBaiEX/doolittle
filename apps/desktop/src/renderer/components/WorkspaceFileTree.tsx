import { Button } from "@elizaos/ui/components/ui/button";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import {
  allWorkspaceDirectories,
  visibleWorkspaceTree,
  type WorkspaceTreeEntry,
  workspaceEntryParent,
} from "../workspace-file-tree";

const TREE_ITEM_CLASS =
  "group grid min-h-[29px] w-full grid-cols-[12px_15px_minmax(0,1fr)_auto] items-center gap-1 overflow-hidden rounded-[var(--radius-xs)] border-0 bg-transparent py-[3px] pr-[7px] text-left text-[var(--text-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:bg-[var(--surface-hover)] focus-visible:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[var(--accent-border)]";
const SELECTED_ITEM_CLASS =
  "bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface-hover))] text-[var(--text)] shadow-[inset_2px_0_var(--accent)]";

function EntryIcon({ directory }: { directory: boolean }) {
  return directory ? (
    <svg
      aria-hidden="true"
      className="size-[13px] text-[var(--accent)]"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M1.5 4.5h4l1.25 1.5h7.75v7.5h-13z"
        fill="currentColor"
        fillOpacity=".15"
        stroke="currentColor"
      />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      className="size-[13px] text-[var(--muted)]"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path d="M3 1.5h6l4 4v9H3z" stroke="currentColor" />
      <path d="M9 1.5v4h4" stroke="currentColor" />
    </svg>
  );
}

function fileExtension(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  const suffix = name.split(".").at(-1);
  return suffix && suffix !== name ? suffix : "";
}

export function WorkspaceFileTree({
  entries,
  onOpenFile,
  selectedPath,
  truncated = false,
}: {
  entries: WorkspaceTreeEntry[];
  onOpenFile: (path: string) => void;
  selectedPath: string;
  truncated?: boolean;
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
    <div className="flex min-h-full flex-col">
      <header className="flex min-h-[42px] shrink-0 items-center justify-between gap-2 border-b border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-raised)_82%,transparent)] py-1.5 pr-2 pl-[11px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap font-[var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Workspace
          </strong>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-[var(--font-mono)] text-[9px] text-[var(--faint)]">
            {fileCount} {fileCount === 1 ? "file" : "files"} ·{" "}
            {directories.length}{" "}
            {directories.length === 1 ? "folder" : "folders"}
            {truncated ? (
              <em
                className="ml-1.5 text-[var(--warning)] not-italic"
                title="This large workspace is showing a bounded tree view. Search can still find additional files."
              >
                limited view
              </em>
            ) : null}
          </span>
        </div>
        <div className="flex shrink-0 gap-[3px]">
          <Button
            aria-label="Collapse all folders"
            className="size-6 min-h-6 p-0 font-[var(--font-mono)] text-[13px] disabled:opacity-30"
            disabled={expandedDirectories.size === 0}
            onClick={() => setExpandedDirectories(new Set())}
            size="icon"
            title="Collapse all folders"
            type="button"
            variant="ghost"
          >
            −
          </Button>
          <Button
            aria-label="Expand all folders"
            className="size-6 min-h-6 p-0 font-[var(--font-mono)] text-[13px] disabled:opacity-30"
            disabled={
              directories.length === 0 ||
              directories.every((path) => expandedDirectories.has(path))
            }
            onClick={() => setExpandedDirectories(new Set(directories))}
            size="icon"
            title="Expand all folders"
            type="button"
            variant="ghost"
          >
            +
          </Button>
        </div>
      </header>
      <div
        aria-label="Workspace files"
        className="min-h-0 flex-1 overflow-auto px-1.5 pt-[5px] pb-2.5 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]"
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
              className={`${TREE_ITEM_CLASS} ${
                selectedPath === entry.path ? SELECTED_ITEM_CLASS : ""
              }`}
              data-entry-type={entry.type}
              key={`${entry.type}:${entry.path}`}
              onClick={() =>
                directory ? toggleDirectory(entry.path) : onOpenFile(entry.path)
              }
              onKeyDown={(event) => handleItemKeyDown(event, index)}
              ref={(node) => {
                itemRefs.current[entry.path] = node;
              }}
              role="treeitem"
              style={{ paddingInlineStart: 5 + entry.depth * 13 }}
              title={entry.path}
              type="button"
            >
              <span
                aria-hidden="true"
                className="text-center font-[var(--font-mono)] text-[13px] leading-none text-[var(--muted)] transition-colors group-hover:text-[var(--accent)] motion-reduce:transition-none"
              >
                {directory ? (expanded ? "⌄" : "›") : ""}
              </span>
              <EntryIcon directory={directory} />
              <span
                className={`overflow-hidden text-ellipsis whitespace-nowrap font-[var(--font-mono)] text-[11px] ${
                  directory ? "font-semibold text-[var(--text-soft)]" : ""
                }`}
              >
                {entry.name}
              </span>
              {suffix ? (
                <small className="font-[var(--font-mono)] text-[9px] uppercase tracking-[0.04em] text-[var(--faint)]">
                  {suffix}
                </small>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
