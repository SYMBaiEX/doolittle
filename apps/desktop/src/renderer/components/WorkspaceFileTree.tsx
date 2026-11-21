import { ContextActionMenu } from "@doolittle/ui";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Folder,
  FolderOpen,
  ListFilter,
  RefreshCw,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { copyContextText } from "../context-menu-clipboard";
import {
  allWorkspaceDirectories,
  visibleWorkspaceTree,
  type WorkspaceTreeEntry,
  workspaceDirectoryAncestors,
  workspaceEntryParent,
} from "../workspace-file-tree";
import { UiIcon } from "./UiIcon";
import { WorkspaceFileIcon } from "./WorkspaceFileIcon";
import "./workspace-file-tree.css";

export interface WorkspaceFileStatus {
  code: string;
  label: string;
  tone: "addition" | "removal" | "changed";
}

export function WorkspaceFileTree({
  entries,
  onOpenFile,
  selectedPath,
  truncated = false,
  contextScope = "",
  workspaceName = "Workspace",
  statuses,
  onRefresh,
  filterable = false,
}: {
  entries: WorkspaceTreeEntry[];
  onOpenFile: (path: string) => void;
  selectedPath: string;
  truncated?: boolean;
  /** Immutable bot/conversation/workspace identity supplied by the resource host. */
  contextScope?: string;
  workspaceName?: string;
  statuses?: ReadonlyMap<string, WorkspaceFileStatus>;
  onRefresh?: () => void;
  filterable?: boolean;
}) {
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    () => new Set(workspaceDirectoryAncestors(selectedPath)),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [collapsedMatches, setCollapsedMatches] = useState<Set<string>>(
    () => new Set(),
  );
  const [focusedPath, setFocusedPath] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const query = filter.trim().toLowerCase();
  const filteredEntries = useMemo(
    () =>
      query
        ? entries.filter(({ path }) => path.toLowerCase().includes(query))
        : entries,
    [entries, query],
  );
  const directories = useMemo(
    () => allWorkspaceDirectories(filteredEntries),
    [filteredEntries],
  );
  const expansion = useMemo(
    () =>
      query
        ? new Set(directories.filter((path) => !collapsedMatches.has(path)))
        : expandedDirectories,
    [collapsedMatches, directories, expandedDirectories, query],
  );
  const visibleEntries = useMemo(
    () => visibleWorkspaceTree(filteredEntries, expansion),
    [filteredEntries, expansion],
  );
  const fileCount = useMemo(
    () => filteredEntries.filter((entry) => entry.type === "file").length,
    [filteredEntries],
  );
  const tabTarget =
    visibleEntries.find(({ path }) => path === focusedPath)?.path ??
    visibleEntries.find(({ path }) => path === selectedPath)?.path ??
    visibleEntries[0]?.path;

  useEffect(() => {
    if (filterOpen) filterRef.current?.focus();
  }, [filterOpen]);

  useEffect(() => {
    if (!selectedPath) return;
    const ancestors = workspaceDirectoryAncestors(selectedPath);
    setExpandedDirectories((current) =>
      ancestors.every((path) => current.has(path))
        ? current
        : new Set([...current, ...ancestors]),
    );
    setFocusedPath(selectedPath);
  }, [selectedPath]);

  function toggleDirectory(path: string, force?: boolean) {
    const nextExpanded = force ?? !expansion.has(path);
    const set = query ? setCollapsedMatches : setExpandedDirectories;
    const include = query ? !nextExpanded : nextExpanded;
    set((current) => {
      const next = new Set(current);
      if (include) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  function setAllFolders(expanded: boolean) {
    if (query) setCollapsedMatches(new Set(expanded ? [] : directories));
    else setExpandedDirectories(new Set(expanded ? directories : []));
  }

  function applyFilter(value: string) {
    setCollapsedMatches(new Set());
    setFilter(value);
  }

  function closeFilter() {
    applyFilter("");
    setFilterOpen(false);
    filterButton.current?.focus();
  }

  function focusPath(path: string) {
    requestAnimationFrame(() => itemRefs.current.get(path)?.focus());
  }

  function handleItemKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
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
      if (!expansion.has(entry.path)) toggleDirectory(entry.path, true);
      else if (next?.parentPath === entry.path) focusPath(next.path);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (entry.type === "directory" && expansion.has(entry.path)) {
        toggleDirectory(entry.path, false);
      } else {
        const parent = workspaceEntryParent(entry.path);
        if (parent) focusPath(parent);
      }
    }
  }

  return (
    <ContextActionMenu
      label="Workspace files"
      scopeKey={contextScope}
      items={[
        {
          id: "expand-all",
          label: "Expand all folders",
          disabled:
            directories.length === 0 ||
            directories.every((path) => expansion.has(path)),
          onSelect: () => setAllFolders(true),
        },
        {
          id: "collapse-all",
          label: "Collapse all folders",
          disabled: expansion.size === 0,
          onSelect: () => setAllFolders(false),
        },
        ...(onRefresh
          ? [
              {
                id: "refresh",
                label: "Refresh workspace files",
                onSelect: onRefresh,
              },
            ]
          : []),
      ]}
    >
      <div className="workspace-file-tree">
        <header className="workspace-tree-header">
          <div className="workspace-tree-heading">
            <strong title={workspaceName}>{workspaceName}</strong>
            <span
              title={
                truncated
                  ? "The loaded tree is partial. Use workspace search for additional files."
                  : undefined
              }
            >
              {fileCount} {fileCount === 1 ? "file" : "files"}
              {truncated ? " · Partial" : null}
            </span>
          </div>
          <div className="workspace-tree-controls">
            {filterable ? (
              <button
                aria-label="Filter workspace files"
                aria-expanded={filterOpen}
                onClick={filterOpen ? closeFilter : () => setFilterOpen(true)}
                ref={filterButton}
                title="Filter workspace files"
                type="button"
              >
                <UiIcon icon={ListFilter} size="xs" />
              </button>
            ) : null}
            {onRefresh ? (
              <button
                aria-label="Refresh workspace files"
                onClick={onRefresh}
                title="Refresh workspace files"
                type="button"
              >
                <UiIcon icon={RefreshCw} size="xs" />
              </button>
            ) : null}
            <button
              aria-label="Collapse all folders"
              disabled={!expansion.size}
              onClick={() => setAllFolders(false)}
              title="Collapse all folders"
              type="button"
            >
              <UiIcon icon={ChevronsDownUp} size="xs" />
            </button>
          </div>
        </header>
        {filterOpen ? (
          <div className="workspace-tree-filter">
            <UiIcon icon={ListFilter} size="xs" />
            <input
              aria-label="Filter by file name or path"
              autoComplete="off"
              onChange={(event) => applyFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeFilter();
                } else if (event.key === "ArrowDown" && tabTarget) {
                  event.preventDefault();
                  focusPath(tabTarget);
                }
              }}
              placeholder="Name or path"
              ref={filterRef}
              value={filter}
            />
            <button
              aria-label="Close file filter"
              onClick={closeFilter}
              type="button"
            >
              <UiIcon icon={X} size="xs" />
            </button>
          </div>
        ) : null}
        <div
          aria-label="Workspace files"
          className="workspace-tree-scroll"
          role="tree"
        >
          {visibleEntries.map((entry, index) => {
            const directory = entry.type === "directory";
            const expanded = directory && expansion.has(entry.path);
            const status = directory ? undefined : statuses?.get(entry.path);
            return (
              <ContextActionMenu
                key={entry.path}
                label={`${directory ? "Folder" : "File"}: ${entry.path}`}
                scopeKey={`${contextScope}:${entry.path}:${expanded}`}
                items={[
                  {
                    id: directory ? "toggle-folder" : "open-file",
                    label: directory
                      ? expanded
                        ? "Collapse folder"
                        : "Expand folder"
                      : "Open file",
                    onSelect: () =>
                      directory
                        ? toggleDirectory(entry.path)
                        : onOpenFile(entry.path),
                  },
                  {
                    id: "copy-path",
                    label: "Copy relative path",
                    separatorBefore: true,
                    onSelect: () => copyContextText(entry.path),
                  },
                  {
                    id: "copy-name",
                    label: "Copy name",
                    onSelect: () => copyContextText(entry.name),
                  },
                ]}
              >
                <button
                  aria-description={status?.label}
                  aria-expanded={directory ? expanded : undefined}
                  aria-level={entry.depth + 1}
                  aria-selected={!directory && selectedPath === entry.path}
                  className="workspace-tree-item"
                  data-entry-type={entry.type}
                  onClick={() =>
                    directory
                      ? toggleDirectory(entry.path)
                      : onOpenFile(entry.path)
                  }
                  onFocus={() => setFocusedPath(entry.path)}
                  onKeyDown={(event) => handleItemKeyDown(event, index)}
                  ref={(node) => {
                    if (node) itemRefs.current.set(entry.path, node);
                    else itemRefs.current.delete(entry.path);
                  }}
                  role="treeitem"
                  style={{
                    paddingInlineStart: 6 + Math.min(entry.depth, 12) * 12,
                  }}
                  tabIndex={tabTarget === entry.path ? 0 : -1}
                  title={
                    status ? `${entry.path} · ${status.label}` : entry.path
                  }
                  type="button"
                >
                  {directory ? (
                    <>
                      <UiIcon
                        className="workspace-tree-disclosure"
                        icon={expanded ? ChevronDown : ChevronRight}
                        size="xs"
                      />
                      <UiIcon
                        className="workspace-tree-folder"
                        icon={expanded ? FolderOpen : Folder}
                        size="xs"
                      />
                    </>
                  ) : (
                    <>
                      <span />
                      <WorkspaceFileIcon path={entry.path} />
                    </>
                  )}
                  <span className="workspace-tree-name">{entry.name}</span>
                  {status ? (
                    <span
                      aria-hidden="true"
                      className="workspace-tree-status"
                      data-tone={status.tone}
                    >
                      {status.code}
                    </span>
                  ) : null}
                </button>
              </ContextActionMenu>
            );
          })}
        </div>
        {visibleEntries.length === 0 ? (
          <p className="workspace-tree-empty" role="status">
            No matching files.
          </p>
        ) : null}
      </div>
    </ContextActionMenu>
  );
}
