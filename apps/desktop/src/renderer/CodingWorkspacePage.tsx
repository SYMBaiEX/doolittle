import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryMutationRequest,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WorkspacePickResult } from "../shared/contracts";
import type { ChatContextRequest } from "./chat-context-handoff";
import { detectCodeLanguage } from "./code-language";
import { CodeEditor } from "./components/CodeEditor";
import { ExecutionEnvironmentPanel } from "./components/ExecutionEnvironmentPanel";
import { GitControlPanel } from "./components/GitControlPanel";
import { InteractiveTerminal } from "./components/InteractiveTerminal";
import { PanelResizeHandle } from "./components/PanelResizeHandle";
import type { ProjectScope } from "./components/ProjectManager";
import { WorkspaceFileTree } from "./components/WorkspaceFileTree";
import { useDesktopAcpEditorBridge } from "./desktop-acp-client";
import type { DesktopNavigationIntent } from "./desktop-navigation-intent";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  useApiResource,
} from "./lib";
import {
  CODE_EXPLORER_WIDTH,
  CODE_EXPLORER_WIDTH_KEY,
  CODE_UTILITY_WIDTH,
  CODE_UTILITY_WIDTH_KEY,
  loadPanelWidth,
  savePanelWidth,
} from "./panel-layout";
import type { RepositoryControlChange } from "./repository-control";
import { codingWorkspaceRequests } from "./resource-request-policy";
import type { WorkspaceTreeEntry } from "./workspace-file-tree";
import { compactWorkspacePath } from "./workspace-path";
import "./coding-workspace.css";

interface RepositorySummary {
  isRepository: boolean;
  root?: string;
  branch?: string;
  head?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: number;
}

interface RepositorySummaryResponse {
  summary?: RepositorySummary;
}

interface RepositoryChange {
  path: string;
  previousPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

interface RepositoryChangesResponse {
  changes?: RepositoryChange[];
}

interface RepositoryPatchResponse {
  patch?: {
    path?: string;
    staged?: boolean;
    patch?: string;
    truncated?: boolean;
  };
}

interface WorkspaceTreeResponse {
  entries?: WorkspaceTreeEntry[];
}

interface WorkspaceReadResponse {
  path?: string;
  content?: string;
}

interface WorkspaceSearchResponse {
  results?: unknown[];
}

interface RepositoryLogResponse {
  log?: unknown;
}

interface RepositoryWorktreesResponse {
  worktrees?: unknown[];
}
interface RepositoryBranchesResponse {
  branches?: unknown[];
}
interface RepositoryRemotesResponse {
  remotes?: unknown[];
}
interface RepositoryStashesResponse {
  stashes?: unknown[];
}
interface RepositoryConflictsResponse {
  conflicts?: unknown[];
}

type LeftPane = "files" | "changes" | "search";
type EditorPane = "file" | "diff";
type UtilityPane = "terminal" | "commits" | "source-control" | "worktrees";
type ActionNotice = {
  tone: "neutral" | "good" | "warn" | "bad";
  message: string;
};
const EXPLORER_VISIBLE_KEY = "doolittle.desktop.code.explorer-visible.v1";
const UTILITY_VISIBLE_KEY = "doolittle.desktop.code.utility-visible.v1";
const ZEN_MODE_KEY = "doolittle.desktop.code.zen-mode.v1";

function loadBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

const EMPTY_SUMMARY: RepositorySummary = {
  isRepository: false,
  ahead: 0,
  behind: 0,
  dirty: false,
  changedFiles: 0,
};

function PaneTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const selectAt = (index: number) => {
    const option = options[index];
    if (option) onChange(option.id);
  };
  const focusAt = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    selectAt(index);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        'button[role="tab"]',
      );
    requestAnimationFrame(() => tabs?.[index]?.focus());
  };

  return (
    <div aria-label={label} className="coding-tabs" role="tablist">
      {options.map((option, index) => (
        <button
          aria-selected={value === option.id}
          className={value === option.id ? "selected" : ""}
          key={option.id}
          onClick={() => onChange(option.id)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              focusAt(event, (index + 1) % options.length);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              focusAt(event, (index - 1 + options.length) % options.length);
            } else if (event.key === "Home") {
              event.preventDefault();
              focusAt(event, 0);
            } else if (event.key === "End") {
              event.preventDefault();
              focusAt(event, options.length - 1);
            }
          }}
          role="tab"
          tabIndex={value === option.id ? 0 : -1}
          type="button"
        >
          {option.label}
          {option.count === undefined ? null : <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

function fileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function boundedContext(value: string, limit = 12_000): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n[…context truncated by Doolittle…]`;
}

function toChanges(
  value: RepositoryChangesResponse | null,
): RepositoryChange[] {
  return asArray(value?.changes)
    .map((item): RepositoryChange | null => {
      const record = asRecord(item);
      const path = asString(record.path);
      if (!path) return null;
      return {
        path,
        previousPath: asString(record.previousPath) || undefined,
        indexStatus: asString(record.indexStatus, " "),
        worktreeStatus: asString(record.worktreeStatus, " "),
        staged: Boolean(record.staged),
        unstaged: Boolean(record.unstaged),
        untracked: Boolean(record.untracked),
      };
    })
    .filter((item): item is RepositoryChange => item !== null);
}

function controlChanges(
  changes: readonly RepositoryChange[],
): RepositoryControlChange[] {
  return changes.map((change) => ({
    path: change.path,
    status: `${change.indexStatus}${change.worktreeStatus}`.trim(),
    staged: change.staged,
    unstaged: change.unstaged,
    untracked: change.untracked,
  }));
}

function records<T>(value: unknown[] | undefined): T[] {
  return asArray(value) as T[];
}

function toSearchResult(value: unknown): {
  path: string;
  matches: string[];
} | null {
  const record = asRecord(value);
  const path = asString(record.path);
  if (!path) return null;
  return {
    path,
    matches: asArray(record.matches)
      .map((match) => asString(match))
      .filter(Boolean)
      .slice(0, 3),
  };
}

function commitRows(value: unknown): Array<{
  id: string;
  hash: string;
  subject: string;
}> {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line, index) => {
        const [hash = "", ...subject] = line.trim().split(/\s+/u);
        return {
          id: `${hash}:${index}`,
          hash,
          subject: subject.join(" ") || "Commit",
        };
      });
  }
  return asArray(value).map((entry, index) => {
    const record = asRecord(entry);
    const hash =
      asString(record.hash) ||
      asString(record.sha) ||
      asString(record.id, `commit-${index + 1}`);
    return {
      id: `${hash}:${index}`,
      hash,
      subject:
        asString(record.subject) ||
        asString(record.message) ||
        asString(record.title, "Commit"),
    };
  });
}

function statusLabel(change: RepositoryChange): string {
  if (change.untracked) return "U";
  return `${change.indexStatus.trim()}${change.worktreeStatus.trim()}` || "M";
}

function patchLines(patch: string): Array<{
  key: string;
  text: string;
  tone: "addition" | "removal" | "header" | "context";
}> {
  const occurrences = new Map<string, number>();
  return patch.split(/\r?\n/u).map((text) => {
    const tone =
      text.startsWith("@@") ||
      text.startsWith("diff ") ||
      text.startsWith("index ") ||
      text.startsWith("--- ") ||
      text.startsWith("+++ ")
        ? "header"
        : text.startsWith("+")
          ? "addition"
          : text.startsWith("-")
            ? "removal"
            : "context";
    const signature = `${tone}:${text}`;
    const occurrence = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, occurrence);
    return {
      key: `${signature}:${occurrence}`,
      text,
      tone,
    };
  });
}

export function CodingWorkspacePage({
  active,
  navigationIntent,
  onAcknowledgeNavigationIntent,
  onChooseWorkspace,
  onOpenWorkspacePath,
  onSendToChat,
  projectScope,
  workspacePath,
}: {
  active: boolean;
  navigationIntent: DesktopNavigationIntent | null;
  onAcknowledgeNavigationIntent: (id: string) => void;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  onSendToChat: (request: ChatContextRequest) => void;
  projectScope: ProjectScope;
  workspacePath: string;
}) {
  const [explorerVisible, setExplorerVisible] = useState(() =>
    loadBooleanPreference(EXPLORER_VISIBLE_KEY, true),
  );
  const [utilityVisible, setUtilityVisible] = useState(() =>
    loadBooleanPreference(UTILITY_VISIBLE_KEY, true),
  );
  const [zenMode, setZenMode] = useState(() =>
    loadBooleanPreference(ZEN_MODE_KEY, false),
  );
  const [explorerWidth, setExplorerWidth] = useState(() =>
    loadPanelWidth(localStorage, CODE_EXPLORER_WIDTH_KEY, CODE_EXPLORER_WIDTH),
  );
  const [utilityWidth, setUtilityWidth] = useState(() =>
    loadPanelWidth(localStorage, CODE_UTILITY_WIDTH_KEY, CODE_UTILITY_WIDTH),
  );
  const [leftPane, setLeftPane] = useState<LeftPane>("files");
  const [editorPane, setEditorPane] = useState<EditorPane>("file");
  const [utilityPane, setUtilityPane] = useState<UtilityPane>("terminal");
  const [selectedPath, setSelectedPath] = useState("");
  const [stagedPatch, setStagedPatch] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [fileNotice, setFileNotice] = useState<ActionNotice | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const [acpTaskOpen, setAcpTaskOpen] = useState(false);
  const [acpTaskDraft, setAcpTaskDraft] = useState("");
  const fileDirtyRef = useRef(false);
  const consumedNavigationIntents = useRef(new Set<string>());
  const acpEditor = useDesktopAcpEditorBridge({
    active,
    workspacePath,
  });
  const requestPolicy = codingWorkspaceRequests({
    active,
    explorerVisible,
    utilityVisible,
    leftPane,
    editorPane,
    utilityPane,
    hasSelectedPath: Boolean(selectedPath),
    hasSearchQuery: Boolean(searchQuery),
  });

  const summaryResource = useApiResource<RepositorySummaryResponse>(
    requestPolicy.summary ? "/repo/summary" : null,
    [requestPolicy.summary],
  );
  const treeResource = useApiResource<WorkspaceTreeResponse>(
    requestPolicy.tree ? "/workspace/tree?depth=12" : null,
    [requestPolicy.tree],
  );
  const changesResource = useApiResource<RepositoryChangesResponse>(
    requestPolicy.changes ? "/repo/changes" : null,
    [requestPolicy.changes],
  );
  const logResource = useApiResource<RepositoryLogResponse>(
    requestPolicy.log ? "/repo/log" : null,
    [requestPolicy.log],
  );
  const worktreeResource = useApiResource<RepositoryWorktreesResponse>(
    requestPolicy.worktrees ? "/repo/worktrees" : null,
    [requestPolicy.worktrees],
  );
  const branchesResource = useApiResource<RepositoryBranchesResponse>(
    requestPolicy.sourceControl ? "/repo/branches" : null,
    [requestPolicy.sourceControl],
  );
  const remotesResource = useApiResource<RepositoryRemotesResponse>(
    requestPolicy.sourceControl ? "/repo/remotes" : null,
    [requestPolicy.sourceControl],
  );
  const stashesResource = useApiResource<RepositoryStashesResponse>(
    requestPolicy.sourceControl ? "/repo/stashes" : null,
    [requestPolicy.sourceControl],
  );
  const conflictsResource = useApiResource<RepositoryConflictsResponse>(
    requestPolicy.sourceControl ? "/repo/conflicts" : null,
    [requestPolicy.sourceControl],
  );
  const searchResource = useApiResource<WorkspaceSearchResponse>(
    requestPolicy.search
      ? `/workspace/search?query=${encodeURIComponent(searchQuery)}`
      : null,
    [requestPolicy.search, searchQuery],
  );

  const changes = useMemo(
    () => toChanges(changesResource.data),
    [changesResource.data],
  );
  const gitChanges = useMemo(() => controlChanges(changes), [changes]);
  const treeEntries = useMemo(
    () =>
      asArray(treeResource.data?.entries)
        .map((entry) => {
          const record = asRecord(entry);
          const path = asString(record.path);
          const type = asString(record.type);
          if (!path || (type !== "file" && type !== "directory")) return null;
          return {
            path,
            type,
            depth: Math.max(0, Math.min(asNumber(record.depth), 12)),
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            path: string;
            type: "file" | "directory";
            depth: number;
          } => entry !== null,
        ),
    [treeResource.data],
  );
  const selectedChange = changes.find((change) => change.path === selectedPath);
  const selectedLanguage = useMemo(
    () => detectCodeLanguage(selectedPath),
    [selectedPath],
  );
  const fileResource = useApiResource<WorkspaceReadResponse>(
    requestPolicy.file
      ? `/workspace/read?path=${encodeURIComponent(selectedPath)}`
      : null,
    [requestPolicy.file, selectedPath],
  );
  const patchResource = useApiResource<RepositoryPatchResponse>(
    requestPolicy.patch && selectedChange
      ? `/repo/patch?path=${encodeURIComponent(selectedPath)}&staged=${stagedPatch}`
      : null,
    [requestPolicy.patch, selectedPath, stagedPatch, selectedChange?.path],
  );
  const summary = summaryResource.data?.summary ?? EMPTY_SUMMARY;
  const commits = commitRows(logResource.data?.log);
  const searchResults = asArray(searchResource.data?.results)
    .map(toSearchResult)
    .filter(
      (
        result,
      ): result is {
        path: string;
        matches: string[];
      } => result !== null,
    );

  useEffect(() => {
    if (selectedPath) return;
    const initial =
      changes[0]?.path ??
      treeEntries.find((entry) => entry.type === "file")?.path;
    if (initial) setSelectedPath(initial);
  }, [changes, selectedPath, treeEntries]);

  useEffect(() => {
    if (!selectedChange) return;
    setStagedPatch(selectedChange.staged && !selectedChange.unstaged);
  }, [selectedChange]);

  useEffect(() => {
    if (
      fileResource.loading ||
      fileResource.data?.path !== selectedPath ||
      typeof fileResource.data.content !== "string"
    ) {
      return;
    }
    if (fileDirtyRef.current) {
      return;
    }
    setOriginalContent(fileResource.data.content);
    setDraftContent(fileResource.data.content);
    setFileNotice(null);
  }, [
    fileResource.data?.content,
    fileResource.data?.path,
    fileResource.loading,
    selectedPath,
  ]);

  const fileDirty = draftContent !== originalContent;
  fileDirtyRef.current = fileDirty;

  const openPath = useCallback(
    (path: string, destination: EditorPane = "file") => {
      if (path !== selectedPath && fileDirty) {
        setFileNotice({
          tone: "warn",
          message: "Save or discard this file before opening another one.",
        });
        return false;
      }
      setSelectedPath(path);
      setEditorPane(destination);
      return true;
    },
    [fileDirty, selectedPath],
  );

  useEffect(() => {
    if (navigationIntent?.kind !== "workspace-file" || !active) return;
    if (consumedNavigationIntents.current.has(navigationIntent.id)) {
      onAcknowledgeNavigationIntent(navigationIntent.id);
      return;
    }
    const path = navigationIntent.target.path.trim();
    if (path && openPath(path)) {
      consumedNavigationIntents.current.add(navigationIntent.id);
      onAcknowledgeNavigationIntent(navigationIntent.id);
    }
  }, [active, navigationIntent, onAcknowledgeNavigationIntent, openPath]);

  useEffect(() => {
    localStorage.setItem(EXPLORER_VISIBLE_KEY, String(explorerVisible));
    localStorage.setItem(UTILITY_VISIBLE_KEY, String(utilityVisible));
    localStorage.setItem(ZEN_MODE_KEY, String(zenMode));
  }, [explorerVisible, utilityVisible, zenMode]);

  useEffect(() => {
    savePanelWidth(
      localStorage,
      CODE_EXPLORER_WIDTH_KEY,
      explorerWidth,
      CODE_EXPLORER_WIDTH,
    );
  }, [explorerWidth]);

  useEffect(() => {
    savePanelWidth(
      localStorage,
      CODE_UTILITY_WIDTH_KEY,
      utilityWidth,
      CODE_UTILITY_WIDTH,
    );
  }, [utilityWidth]);

  useEffect(() => {
    if (!active) return;
    const handleWorkspaceShortcut = (event: globalThis.KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "b" && !event.shiftKey) {
        event.preventDefault();
        setExplorerVisible((current) => !current);
      } else if (key === "j" && !event.shiftKey) {
        event.preventDefault();
        setUtilityVisible((current) => !current);
      } else if (key === "z" && event.shiftKey) {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        event.preventDefault();
        setZenMode((current) => !current);
      }
    };
    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, [active]);

  const refreshAll = () => {
    summaryResource.reload();
    treeResource.reload();
    changesResource.reload();
    logResource.reload();
    worktreeResource.reload();
    branchesResource.reload();
    remotesResource.reload();
    stashesResource.reload();
    conflictsResource.reload();
    if (searchQuery) searchResource.reload();
    if (selectedPath) fileResource.reload();
    if (selectedChange) patchResource.reload();
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = searchDraft.trim();
    if (!nextQuery) return;
    setSearchQuery(nextQuery);
    setLeftPane("search");
  };

  const discardFile = () => {
    setDraftContent(originalContent);
    setFileNotice({
      tone: "neutral",
      message: "Local edits discarded. The workspace file was not changed.",
    });
  };

  const saveFile = async () => {
    if (!selectedPath || !fileDirty || savingFile) return;
    setSavingFile(true);
    setFileNotice({
      tone: "neutral",
      message: "Review this save in the native confirmation dialog.",
    });
    try {
      const result = await window.doolittle.saveWorkspaceFile({
        path: selectedPath,
        content: draftContent,
        expectedContent: originalContent,
      });
      if (result.status === "cancelled") {
        setFileNotice({
          tone: "neutral",
          message: "Save cancelled. Your edits remain only in this editor.",
        });
      } else if (result.status === "conflict") {
        setFileNotice({
          tone: "bad",
          message: result.message,
        });
      } else {
        setOriginalContent(draftContent);
        setFileNotice({
          tone: "good",
          message: "Saved after native confirmation.",
        });
        summaryResource.reload();
        changesResource.reload();
        patchResource.reload();
      }
    } catch (error) {
      setFileNotice({ tone: "bad", message: errorMessage(error) });
    } finally {
      setSavingFile(false);
    }
  };

  const mutateVisiblePatch = async (
    type: Extract<
      RepositoryMutationRequest["type"],
      "stage-hunk" | "unstage-hunk" | "discard-hunk"
    >,
  ) => {
    const patch = patchResource.data?.patch;
    if (!patch?.patch || patch.truncated) return;
    setFileNotice({
      tone: "neutral",
      message: "Review the selected patch operation in the native dialog.",
    });
    try {
      const result = await window.doolittle.mutateRepository({
        type,
        patch: patch.patch,
      });
      if (result.status === "cancelled") {
        setFileNotice({ tone: "neutral", message: "Git operation cancelled." });
        return;
      }
      setFileNotice({
        tone: result.result.ok ? "good" : "bad",
        message:
          result.result.error || result.result.stderr || result.result.summary,
      });
      refreshAll();
    } catch (cause) {
      setFileNotice({ tone: "bad", message: errorMessage(cause) });
    }
  };

  const sendSelectedContext = () => {
    if (!selectedPath) return;
    void acpEditor.flushEditorState();
    if (editorPane === "diff") {
      const patch = patchResource.data?.patch?.patch ?? "";
      onSendToChat({
        text: [
          `Review and improve the change in ${selectedPath}.`,
          `<review_context path="${selectedPath}" source="${
            stagedPatch ? "staged" : "working-tree"
          }">`,
          boundedContext(patch || "No textual patch was available."),
          "</review_context>",
        ].join("\n"),
        workspacePath,
        projectScope,
      });
      return;
    }
    onSendToChat({
      text: [
        `Help me work on ${selectedPath}.`,
        `<file_context path="${selectedPath}">`,
        boundedContext(draftContent || originalContent),
        "</file_context>",
      ].join("\n"),
      workspacePath,
      projectScope,
    });
  };

  const submitAcpTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await acpEditor.prompt(acpTaskDraft);
  };

  return (
    <div className={`page coding-workspace-page ${zenMode ? "zen" : ""}`}>
      <header className="coding-repo-header">
        <div className="coding-repo-identity">
          <div className="coding-repo-mark" aria-hidden="true">
            &gt;_
          </div>
          <div>
            <span className="eyebrow">Agentic workspace</span>
            <div className="coding-repo-title">
              <h1>{summary.branch || "Workspace"}</h1>
              {summary.head ? <code>{summary.head}</code> : null}
              {summaryResource.loading ? (
                <Badge>Syncing</Badge>
              ) : summaryResource.error ? (
                <Badge tone="bad">Unavailable</Badge>
              ) : (
                <Badge tone={summary.dirty ? "warn" : "good"}>
                  {summary.dirty ? "Changes" : "Clean"}
                </Badge>
              )}
            </div>
            <p title={summary.root}>
              {compactWorkspacePath(summary.root ?? "Local workspace")}
            </p>
          </div>
        </div>
        <div
          className="coding-repo-state"
          aria-label="Repository status"
          role="status"
        >
          <span>
            <strong className="coding-repo-state-value">
              {summaryResource.loading ? "—" : summary.changedFiles}
            </strong>{" "}
            changed
          </span>
          <span>
            <strong className="coding-repo-state-value">
              ↑ {summaryResource.loading ? "—" : summary.ahead}
            </strong>{" "}
            ahead
          </span>
          <span>
            <strong className="coding-repo-state-value">
              ↓ {summaryResource.loading ? "—" : summary.behind}
            </strong>{" "}
            behind
          </span>
          <button
            className="secondary-button"
            disabled={!active}
            onClick={refreshAll}
            type="button"
          >
            Refresh
          </button>
          <div
            aria-label="Workspace layout"
            className="coding-layout-controls"
            role="toolbar"
          >
            <button
              aria-pressed={explorerVisible}
              className={explorerVisible ? "selected" : ""}
              onClick={() => setExplorerVisible((current) => !current)}
              title="Toggle explorer (⌘/Ctrl B)"
              type="button"
            >
              Explorer
            </button>
            <button
              aria-pressed={utilityVisible}
              className={utilityVisible ? "selected" : ""}
              onClick={() => setUtilityVisible((current) => !current)}
              title="Toggle utility rail (⌘/Ctrl J)"
              type="button"
            >
              Utility
            </button>
            <button
              aria-pressed={zenMode}
              className={zenMode ? "selected" : ""}
              onClick={() => setZenMode((current) => !current)}
              title="Toggle focus mode (⌘/Ctrl Shift Z)"
              type="button"
            >
              Focus
            </button>
          </div>
        </div>
      </header>

      {summaryResource.error ? (
        <div className="coding-global-notice">
          <ErrorBlock
            error={summaryResource.error}
            retry={summaryResource.reload}
          />
        </div>
      ) : null}
      {!summaryResource.loading &&
      summaryResource.data &&
      !summary.isRepository ? (
        <div className="coding-global-notice">
          <div className="coding-inline-state">
            This workspace is not inside a Git repository. Files remain
            available, while changes, commits, and worktrees will be empty.
          </div>
        </div>
      ) : null}

      <div
        className={`coding-grid ${
          explorerVisible ? "" : "explorer-hidden"
        } ${utilityVisible ? "" : "utility-hidden"}`.trim()}
        style={
          {
            "--coding-explorer-width": `${explorerWidth}px`,
            "--coding-utility-width": `${utilityWidth}px`,
          } as CSSProperties
        }
      >
        {explorerVisible ? (
          <aside className="coding-pane coding-explorer">
            <PanelResizeHandle
              bounds={CODE_EXPLORER_WIDTH}
              className="coding-explorer-resizer"
              direction="grow-right"
              label="Resize code explorer"
              onResize={setExplorerWidth}
              value={explorerWidth}
            />
            <PaneTabs<LeftPane>
              label="Explorer views"
              options={[
                { id: "files", label: "Files" },
                { id: "changes", label: "Changes", count: changes.length },
                { id: "search", label: "Search" },
              ]}
              value={leftPane}
              onChange={setLeftPane}
            />

            <div className="coding-pane-body" role="tabpanel">
              {leftPane === "files" ? (
                treeResource.loading ? (
                  <LoadingBlock label="Reading workspace tree…" />
                ) : treeResource.error ? (
                  <ErrorBlock
                    error={treeResource.error}
                    retry={treeResource.reload}
                  />
                ) : treeEntries.length ? (
                  <WorkspaceFileTree
                    entries={treeEntries}
                    onOpenFile={openPath}
                    selectedPath={selectedPath}
                  />
                ) : (
                  <EmptyBlock title="Workspace is empty">
                    Files appear here when the runtime exposes a workspace tree.
                  </EmptyBlock>
                )
              ) : null}

              {leftPane === "changes" ? (
                changesResource.loading ? (
                  <LoadingBlock label="Inspecting Git changes…" />
                ) : changesResource.error ? (
                  <ErrorBlock
                    error={changesResource.error}
                    retry={changesResource.reload}
                  />
                ) : changes.length ? (
                  <div className="coding-change-list">
                    {changes.map((change) => (
                      <button
                        className={
                          selectedPath === change.path ? "selected" : ""
                        }
                        key={change.path}
                        onClick={() => openPath(change.path, "diff")}
                        title={change.path}
                        type="button"
                      >
                        <span className="coding-change-code">
                          {statusLabel(change)}
                        </span>
                        <span>
                          <strong className="coding-change-name">
                            {fileName(change.path)}
                          </strong>
                          <small className="coding-change-path">
                            {change.path}
                          </small>
                        </span>
                        <span className="coding-change-badges">
                          {change.staged ? <i>staged</i> : null}
                          {change.unstaged ? <i>working</i> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="Working tree clean">
                    No staged, unstaged, or untracked files were reported.
                  </EmptyBlock>
                )
              ) : null}

              {leftPane === "search" ? (
                <div className="coding-search">
                  <form onSubmit={submitSearch}>
                    <label className="coding-worktree-field">
                      <span className="sr-only">Search workspace files</span>
                      <input
                        className="coding-worktree-input"
                        onChange={(event) => setSearchDraft(event.target.value)}
                        placeholder="Search workspace"
                        value={searchDraft}
                      />
                    </label>
                    <button className="primary-button" type="submit">
                      Find
                    </button>
                  </form>
                  {!searchQuery ? (
                    <EmptyBlock title="Search the workspace">
                      Find matching lines across files without leaving the
                      desktop.
                    </EmptyBlock>
                  ) : searchResource.loading ? (
                    <LoadingBlock label={`Searching for “${searchQuery}”…`} />
                  ) : searchResource.error ? (
                    <ErrorBlock
                      error={searchResource.error}
                      retry={searchResource.reload}
                    />
                  ) : searchResults.length ? (
                    <div className="coding-search-results">
                      {searchResults.map((result) => (
                        <button
                          key={result.path}
                          onClick={() => openPath(result.path)}
                          title={result.path}
                          type="button"
                        >
                          <strong className="coding-search-path">
                            {result.path}
                          </strong>
                          {result.matches.map((match) => (
                            <small
                              className="coding-search-match"
                              key={`${result.path}:${match}`}
                            >
                              {match}
                            </small>
                          ))}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyBlock title="No matches">
                      No workspace lines matched “{searchQuery}”.
                    </EmptyBlock>
                  )}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}

        <main className="coding-pane coding-editor">
          <div className="coding-editor-toolbar">
            <PaneTabs<EditorPane>
              label="Editor views"
              options={[
                { id: "file", label: "File" },
                { id: "diff", label: "Diff" },
              ]}
              value={editorPane}
              onChange={setEditorPane}
            />
            <div className="coding-breadcrumb" title={selectedPath}>
              <span>{selectedPath || "Select a file"}</span>
              {selectedPath ? <small>{selectedLanguage.label}</small> : null}
            </div>
            {editorPane === "file" && selectedPath ? (
              <div className="coding-editor-actions">
                {fileDirty ? (
                  <span className="coding-unsaved-indicator" role="status">
                    Unsaved
                  </span>
                ) : null}
                <button
                  className="secondary-button"
                  disabled={!fileDirty || savingFile}
                  onClick={discardFile}
                  type="button"
                >
                  Discard
                </button>
                <button
                  className="primary-button"
                  disabled={!fileDirty || savingFile}
                  onClick={() => void saveFile()}
                  type="button"
                >
                  {savingFile ? "Saving…" : "Save"}
                </button>
              </div>
            ) : editorPane === "diff" && selectedChange ? (
              <div className="coding-editor-actions">
                {selectedChange.staged ? (
                  <fieldset
                    aria-label="Diff source"
                    className="coding-diff-source"
                  >
                    <legend className="sr-only">Diff source</legend>
                    {selectedChange.unstaged ? (
                      <button
                        aria-pressed={!stagedPatch}
                        className={!stagedPatch ? "selected" : ""}
                        onClick={() => setStagedPatch(false)}
                        type="button"
                      >
                        Working
                      </button>
                    ) : null}
                    <button
                      aria-pressed={stagedPatch}
                      className={stagedPatch ? "selected" : ""}
                      onClick={() => setStagedPatch(true)}
                      type="button"
                    >
                      Staged
                    </button>
                  </fieldset>
                ) : null}
                {patchResource.data?.patch?.patch &&
                !patchResource.data.patch.truncated ? (
                  stagedPatch ? (
                    <button
                      className="secondary-button"
                      onClick={() => void mutateVisiblePatch("unstage-hunk")}
                      type="button"
                    >
                      Unstage patch
                    </button>
                  ) : (
                    <>
                      {!selectedChange.untracked ? (
                        <button
                          className="danger-button"
                          onClick={() =>
                            void mutateVisiblePatch("discard-hunk")
                          }
                          type="button"
                        >
                          Discard patch
                        </button>
                      ) : null}
                      <button
                        className="primary-button"
                        onClick={() => void mutateVisiblePatch("stage-hunk")}
                        type="button"
                      >
                        Stage patch
                      </button>
                    </>
                  )
                ) : null}
              </div>
            ) : null}
          </div>

          <section
            aria-label={
              selectedPath
                ? `${editorPane === "file" ? "File editor" : "Git diff"}: ${selectedPath}`
                : "File editor"
            }
            className="coding-editor-surface"
            role="tabpanel"
          >
            {!selectedPath ? (
              <EmptyBlock title="Choose a file">
                Select a workspace file or changed file to inspect it here.
              </EmptyBlock>
            ) : editorPane === "file" ? (
              fileResource.loading ? (
                <LoadingBlock label={`Opening ${fileName(selectedPath)}…`} />
              ) : fileResource.error ? (
                <ErrorBlock
                  error={fileResource.error}
                  retry={fileResource.reload}
                />
              ) : (
                <>
                  {fileNotice ? (
                    <div
                      aria-live="polite"
                      className={`coding-action-notice ${fileNotice.tone}`}
                      role="status"
                    >
                      {fileNotice.message}
                    </div>
                  ) : null}
                  <CodeEditor
                    disabled={savingFile}
                    language={selectedLanguage}
                    onChange={(value) => {
                      setDraftContent(value);
                      if (fileNotice?.tone !== "bad") setFileNotice(null);
                    }}
                    onEditorStateChange={(snapshot) =>
                      acpEditor.publishEditorState(
                        snapshot,
                        fileDirtyRef.current,
                      )
                    }
                    onSave={() => void saveFile()}
                    path={selectedPath}
                    value={draftContent}
                    workspacePath={workspacePath}
                  />
                </>
              )
            ) : !selectedChange ? (
              <EmptyBlock title="No Git change for this file">
                Choose a changed file from the Changes pane to inspect its
                patch.
              </EmptyBlock>
            ) : patchResource.loading ? (
              <LoadingBlock
                label={`Building patch for ${fileName(selectedPath)}…`}
              />
            ) : patchResource.error ? (
              <ErrorBlock
                error={patchResource.error}
                retry={patchResource.reload}
              />
            ) : patchResource.data?.patch?.patch ? (
              <>
                {fileNotice ? (
                  <div
                    aria-live="polite"
                    className={`coding-action-notice ${fileNotice.tone}`}
                    role="status"
                  >
                    {fileNotice.message}
                  </div>
                ) : null}
                {patchResource.data.patch.truncated ? (
                  <div className="coding-inline-state warn">
                    This large patch was truncated by the runtime.
                  </div>
                ) : null}
                <pre className="coding-source coding-patch">
                  <code>
                    {patchLines(patchResource.data.patch.patch).map((line) => (
                      <span
                        className={`coding-diff-line ${line.tone}`}
                        key={line.key}
                      >
                        {line.text || " "}
                      </span>
                    ))}
                  </code>
                </pre>
              </>
            ) : (
              <EmptyBlock title="No patch output">
                The {stagedPatch ? "staged" : "working-tree"} version of this
                file has no textual patch.
              </EmptyBlock>
            )}
          </section>
          {acpTaskOpen ? (
            <form
              aria-label="ACP editor task"
              className="coding-acp-task"
              onSubmit={(event) => void submitAcpTask(event)}
            >
              <div className="coding-acp-task-row">
                <label
                  className="coding-acp-task-label"
                  htmlFor="coding-acp-task-input"
                >
                  <span>ACP task</span>
                  <small>
                    {selectedPath
                      ? `Current Monaco context · ${fileName(selectedPath)}`
                      : "Workspace context"}
                  </small>
                </label>
                <input
                  disabled={acpEditor.promptBusy}
                  id="coding-acp-task-input"
                  onChange={(event) => setAcpTaskDraft(event.target.value)}
                  placeholder="Inspect, edit, test, or explain…"
                  value={acpTaskDraft}
                />
                {acpEditor.promptBusy ? (
                  <button
                    className="secondary-button"
                    disabled={acpEditor.promptPhase === "cancelling"}
                    onClick={() => void acpEditor.cancel()}
                    type="button"
                  >
                    {acpEditor.promptPhase === "cancelling"
                      ? "Cancelling…"
                      : "Cancel"}
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    disabled={
                      acpEditor.phase !== "connected" || !acpTaskDraft.trim()
                    }
                    type="submit"
                  >
                    Run
                  </button>
                )}
                <button
                  aria-label="Close ACP editor task"
                  className="ghost-button coding-acp-task-close"
                  onClick={() => setAcpTaskOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </div>
              {acpEditor.promptError ? (
                <p className="coding-acp-task-error" role="alert">
                  {acpEditor.promptError}
                </p>
              ) : acpEditor.responseText ? (
                <output className="coding-acp-task-output">
                  {acpEditor.responseText}
                </output>
              ) : acpEditor.promptBusy ? (
                <p className="coding-acp-task-progress" role="status">
                  {acpEditor.lastUpdateLabel
                    ? `${acpEditor.lastUpdateLabel} · ${acpEditor.updates.length} updates`
                    : "Doolittle is working through ACP…"}
                </p>
              ) : acpEditor.stopReason ? (
                <p className="coding-acp-task-progress" role="status">
                  ACP task finished · {acpEditor.stopReason}
                </p>
              ) : null}
            </form>
          ) : null}
          <footer className="coding-editor-status">
            <span
              className={
                fileDirty ? "coding-modified-status" : "coding-editable-status"
              }
            >
              {editorPane === "diff"
                ? "REVIEW"
                : fileDirty
                  ? "MODIFIED"
                  : "EDITABLE"}
            </span>
            <span>{selectedLanguage.label}</span>
            <span>UTF-8</span>
            {editorPane === "file" ? <span>⌘/Ctrl S to save</span> : null}
            <span
              className={`coding-acp-status ${acpEditor.phase}`}
              title={
                acpEditor.error ||
                (acpEditor.sessionId
                  ? `ACP session ${acpEditor.sessionId}`
                  : "ACP editor context")
              }
            >
              <i aria-hidden="true" />
              ACP{" "}
              {acpEditor.phase === "connected"
                ? "live"
                : acpEditor.phase === "degraded"
                  ? "offline"
                  : acpEditor.phase === "connecting"
                    ? "linking"
                    : "idle"}
            </span>
            {acpEditor.updates.length > 0 ? (
              <span
                className="coding-acp-progress"
                title={
                  acpEditor.lastUpdateLabel || "Structured ACP session updates"
                }
              >
                {acpEditor.lastUpdateLabel || "ACP"} ·{" "}
                {acpEditor.updates.length}
              </span>
            ) : null}
            {acpEditor.promptBusy && !acpTaskOpen ? (
              <button
                className="coding-status-action coding-acp-cancel"
                onClick={() => void acpEditor.cancel()}
                type="button"
              >
                Cancel ACP
              </button>
            ) : null}
            <span className="coding-spacer" />
            <button
              aria-expanded={acpTaskOpen}
              className="coding-status-action coding-acp-task-toggle"
              onClick={() => setAcpTaskOpen((current) => !current)}
              type="button"
            >
              ACP task
            </button>
            {selectedPath ? (
              <button
                className="coding-status-action"
                onClick={sendSelectedContext}
                type="button"
              >
                Ask Doolittle
              </button>
            ) : null}
            <span>
              {selectedChange ? statusLabel(selectedChange) : "TRACKED"}
            </span>
          </footer>
        </main>

        {utilityVisible ? (
          <aside className="coding-pane coding-utility">
            <PanelResizeHandle
              bounds={CODE_UTILITY_WIDTH}
              className="coding-utility-resizer"
              direction="grow-left"
              label="Resize code utility panel"
              onResize={setUtilityWidth}
              value={utilityWidth}
            />
            <PaneTabs<UtilityPane>
              label="Workspace utilities"
              options={[
                { id: "terminal", label: "Terminal" },
                { id: "commits", label: "Commits", count: commits.length },
                { id: "source-control", label: "Git", count: changes.length },
                {
                  id: "worktrees",
                  label: "Trees",
                  count: asArray(worktreeResource.data?.worktrees).length,
                },
              ]}
              value={utilityPane}
              onChange={setUtilityPane}
            />
            <div className="coding-pane-body" role="tabpanel">
              {utilityPane === "terminal" ? (
                summaryResource.loading && !summary.root ? (
                  <LoadingBlock label="Connecting terminal to workspace…" />
                ) : (
                  <InteractiveTerminal
                    active={active}
                    onSendToChat={(text) =>
                      onSendToChat({
                        text,
                        workspacePath: summary.root || workspacePath || "",
                        projectScope,
                      })
                    }
                    workspacePath={summary.root || workspacePath || ""}
                  />
                )
              ) : null}

              {utilityPane === "commits" ? (
                logResource.loading ? (
                  <LoadingBlock label="Reading recent commits…" />
                ) : logResource.error ? (
                  <ErrorBlock
                    error={logResource.error}
                    retry={logResource.reload}
                  />
                ) : commits.length ? (
                  <div className="coding-commit-list">
                    {commits.map((commit) => (
                      <article key={commit.id}>
                        <span aria-hidden="true" />
                        <div>
                          <strong className="coding-commit-subject">
                            {commit.subject}
                          </strong>
                          <code>{commit.hash}</code>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No commit history">
                    Recent commits will appear when this workspace has Git
                    history.
                  </EmptyBlock>
                )
              ) : null}

              {utilityPane === "source-control" ? (
                <GitControlPanel
                  active={active && summary.isRepository}
                  branches={records<RepositoryBranch>(
                    branchesResource.data?.branches,
                  )}
                  changes={gitChanges}
                  conflicts={records<RepositoryConflict>(
                    conflictsResource.data?.conflicts,
                  )}
                  onRefresh={refreshAll}
                  remotes={records<RepositoryRemote>(
                    remotesResource.data?.remotes,
                  )}
                  stashes={records<RepositoryStash>(
                    stashesResource.data?.stashes,
                  )}
                  worktrees={records<{
                    path: string;
                    branch?: string;
                    current?: boolean;
                    prunable?: boolean;
                  }>(worktreeResource.data?.worktrees)}
                />
              ) : null}

              {utilityPane === "worktrees" ? (
                <ExecutionEnvironmentPanel
                  active={active}
                  error={worktreeResource.error}
                  isRepository={summary.isRepository}
                  loading={worktreeResource.loading}
                  onChooseWorkspace={onChooseWorkspace}
                  onOpenWorkspacePath={onOpenWorkspacePath}
                  onRefresh={refreshAll}
                  workspaceRoot={summary.root ?? ""}
                  worktrees={worktreeResource.data?.worktrees}
                />
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
