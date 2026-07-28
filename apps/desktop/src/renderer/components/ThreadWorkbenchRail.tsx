import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
  useApiResource,
} from "../lib";
import {
  browserThreadWorkbenchStorage,
  buildBriefPlanSummary,
  clampThreadWorkbenchWidth,
  loadThreadWorkbenchState,
  saveThreadWorkbenchState,
  THREAD_WORKBENCH_TABS,
  type ThreadWorkbenchState,
  type ThreadWorkbenchTab,
} from "../thread-workbench";
import "../thread-workbench.css";

export type ThreadWorkbenchFullView =
  | "code"
  | "review"
  | "orchestration"
  | "browser"
  | "settings"
  | "models"
  | "automations"
  | "runtime";

export interface ThreadWorkbenchRailProps {
  active: boolean;
  sessionId: string;
  workspacePath: string;
  onInsertContext: (text: string) => void;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
  onRequestClose: () => void;
}

interface RepositorySummaryResponse {
  summary?: {
    isRepository?: boolean;
    root?: string;
    branch?: string;
    head?: string;
    dirty?: boolean;
    changedFiles?: number;
  };
}

interface WorkspaceTreeResponse {
  entries?: unknown[];
}

interface WorkspaceReadResponse {
  path?: string;
  content?: string;
}

interface RepositoryChangesResponse {
  changes?: unknown[];
}

interface WorkspaceCheckpointResponse {
  support?: { supported?: boolean; reason?: string };
  checkpoints?: unknown[];
}

interface RepositoryPatchResponse {
  patch?: {
    path?: string;
    patch?: string;
    truncated?: boolean;
  };
}

interface TerminalHistoryResponse {
  commands?: unknown[];
}

interface PlansResponse {
  plans?: unknown[];
}

interface SettingsResponse {
  settings?: Record<string, unknown>;
}

interface DelegationTasksResponse {
  tasks?: unknown[];
}

interface CodegenRunsResponse {
  summary?: {
    running?: number;
    failed?: number;
    total?: number;
    workflows?: number;
    runningWorkflows?: number;
  };
  runs?: unknown[];
}

interface BrowserStatusResponse {
  browser?: unknown;
}

interface ExecutionApprovalsResponse {
  approvals?: unknown[];
}

interface NavigationCard {
  label: string;
  view: ThreadWorkbenchFullView;
  blurb: string;
}

interface WorkbenchFile {
  path: string;
  type: "file" | "directory";
  depth: number;
}

interface WorkbenchChange {
  path: string;
  status: string;
  staged: boolean;
  untracked: boolean;
}

const TAB_LABELS: Record<ThreadWorkbenchTab, string> = {
  files: "Files",
  changes: "Changes",
  terminal: "Terminal",
  plans: "Plans",
  brief: "Brief",
  settings: "Settings",
  preview: "Preview",
};

const TAB_MARKS: Record<ThreadWorkbenchTab, string> = {
  files: "F",
  changes: "Δ",
  terminal: ">_",
  plans: "P",
  brief: "⚡",
  settings: "▦",
  preview: "◎",
};

const FULL_VIEW: Partial<Record<ThreadWorkbenchTab, ThreadWorkbenchFullView>> =
  {
    files: "code",
    changes: "review",
    terminal: "code",
    plans: "orchestration",
    settings: "settings",
    preview: "browser",
  };

const QUICK_NAVIGATION: NavigationCard[] = [
  {
    label: "Workspace",
    view: "code",
    blurb: "Open the coding workspace.",
  },
  {
    label: "Reviews",
    view: "review",
    blurb: "Open the review panel for changes and diffs.",
  },
  {
    label: "Tasks",
    view: "orchestration",
    blurb: "Open orchestration and delegation status.",
  },
  {
    label: "Browser",
    view: "browser",
    blurb: "Open local preview and capture tools.",
  },
  {
    label: "Settings",
    view: "settings",
    blurb: "Go to runtime and model settings.",
  },
  {
    label: "Models",
    view: "models",
    blurb: "Adjust model providers and routing.",
  },
  {
    label: "Automations",
    view: "automations",
    blurb: "Open automations and schedules.",
  },
  {
    label: "Runtime",
    view: "runtime",
    blurb: "Inspect runtime health and diagnostics.",
  },
];

function flattenSettingEntries(
  source: unknown,
  prefix = "",
  output: Array<{ key: string; value: string }> = [],
): Array<{ key: string; value: string }> {
  if (
    source === null ||
    source === undefined ||
    typeof source !== "object" ||
    Array.isArray(source)
  ) {
    return [{ key: prefix || "runtime", value: String(source ?? "") }];
  }

  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      output.push({ key: nextKey, value: String(value) });
    } else if (Array.isArray(value)) {
      output.push({ key: nextKey, value: `[${value.length} items]` });
    } else if (typeof value === "object") {
      flattenSettingEntries(value, nextKey, output);
    } else {
      output.push({ key: nextKey, value: String(value) });
    }
  }
  return output;
}

const CONTEXT_LIMIT = 16_000;

function bounded(value: string, limit = CONTEXT_LIMIT): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[Context truncated by Doolittle]`;
}

function contextBlock(kind: string, title: string, content: string): string {
  return [
    `<doolittle-context kind="${kind}" source="${title}">`,
    bounded(content.trim() || "(no captured content)"),
    "</doolittle-context>",
  ].join("\n");
}

function commandOutput(record: Record<string, unknown>): string {
  return (
    asString(record.streamOutput) ||
    [asString(record.stdout), asString(record.stderr)]
      .filter(Boolean)
      .join("\n") ||
    asString(record.output)
  );
}

function branchHeadLabel(branch: string, head: string): string {
  const compactHead = head ? head.slice(0, 8) : "";
  return [branch || "No branch", compactHead].filter(Boolean).join(" · ");
}

function compactPath(path: string): string {
  const parts = path.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : path;
}

function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  const normalized = status.toLowerCase();
  if (["completed", "ready", "success", "clean", "active"].includes(normalized))
    return "good";
  if (["failed", "error", "denied", "cancelled"].includes(normalized))
    return "bad";
  if (["running", "pending", "draft", "waiting", "dirty"].includes(normalized))
    return "warn";
  return "neutral";
}

function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (loading) return <LoadingBlock label="Loading workbench…" />;
  if (error) return <ErrorBlock error={error} retry={retry} />;
  return null;
}

export function ThreadWorkbenchRail({
  active,
  sessionId,
  workspacePath,
  onInsertContext,
  onOpenFullView,
  onRequestClose,
}: ThreadWorkbenchRailProps) {
  const storage = useMemo(() => browserThreadWorkbenchStorage(), []);
  const [model, setModel] = useState<ThreadWorkbenchState>(() => ({
    ...loadThreadWorkbenchState({ sessionId, workspacePath }, storage),
    railOpen: true,
  }));
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedChange, setSelectedChange] = useState("");
  const [selectedCommand, setSelectedCommand] = useState("");
  const [copiedLabel, setCopiedLabel] = useState("");
  const [checkpointMessage, setCheckpointMessage] = useState("");
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const tabRefs = useRef<Record<ThreadWorkbenchTab, HTMLButtonElement | null>>({
    files: null,
    changes: null,
    terminal: null,
    plans: null,
    brief: null,
    settings: null,
    preview: null,
  });

  const summary = useApiResource<RepositorySummaryResponse>(
    active ? "/repo/summary" : null,
    [active, workspacePath],
  );
  const tree = useApiResource<WorkspaceTreeResponse>(
    active && model.railOpen && model.selectedTab === "files"
      ? "/workspace/tree?depth=4"
      : null,
    [active, model.railOpen, model.selectedTab, workspacePath],
  );
  const changes = useApiResource<RepositoryChangesResponse>(
    active && model.railOpen && model.selectedTab === "changes"
      ? "/repo/changes"
      : null,
    [active, model.railOpen, model.selectedTab, workspacePath],
  );
  const checkpoints = useApiResource<WorkspaceCheckpointResponse>(
    active && model.railOpen && model.selectedTab === "changes"
      ? "/workspace/checkpoints"
      : null,
    [active, model.railOpen, model.selectedTab, workspacePath],
  );
  const terminal = useApiResource<TerminalHistoryResponse>(
    active &&
      model.railOpen &&
      (model.selectedTab === "terminal" || model.selectedTab === "brief")
      ? "/terminal/history"
      : null,
    [active, model.railOpen, model.selectedTab, workspacePath],
  );
  const plans = useApiResource<PlansResponse>(
    active &&
      model.railOpen &&
      (model.selectedTab === "plans" || model.selectedTab === "brief")
      ? "/plans"
      : null,
    [active, model.railOpen, model.selectedTab],
  );
  const settings = useApiResource<SettingsResponse>(
    active && model.railOpen && model.selectedTab === "settings"
      ? "/settings"
      : null,
    [active, model.railOpen, model.selectedTab],
  );
  const delegationTasks = useApiResource<DelegationTasksResponse>(
    active && model.railOpen && model.selectedTab === "brief"
      ? "/delegation/tasks?limit=8"
      : null,
    [active, model.railOpen, model.selectedTab],
  );
  const codegen = useApiResource<CodegenRunsResponse>(
    active && model.railOpen && model.selectedTab === "brief"
      ? "/codegen/runs"
      : null,
    [active, model.railOpen, model.selectedTab],
  );
  const approvals = useApiResource<ExecutionApprovalsResponse>(
    active && model.railOpen && model.selectedTab === "brief"
      ? "/execution/approvals?status=pending"
      : null,
    [active, model.railOpen, model.selectedTab],
  );
  const preview = useApiResource<BrowserStatusResponse>(
    active && model.railOpen && model.selectedTab === "preview"
      ? "/browser/status"
      : null,
    [active, model.railOpen, model.selectedTab],
  );

  const fileEntries = useMemo(
    () =>
      asArray(tree.data?.entries)
        .map((value): WorkbenchFile | null => {
          const entry = asRecord(value);
          const path = asString(entry.path);
          const type = asString(entry.type);
          if (!path || (type !== "file" && type !== "directory")) return null;
          return {
            path,
            type,
            depth: Math.max(0, Math.min(8, asNumber(entry.depth))),
          };
        })
        .filter((entry): entry is WorkbenchFile => entry !== null),
    [tree.data],
  );
  const changeEntries = useMemo(
    () =>
      asArray(changes.data?.changes)
        .map((value): WorkbenchChange | null => {
          const entry = asRecord(value);
          const path = asString(entry.path);
          if (!path) return null;
          const indexStatus = asString(entry.indexStatus, " ");
          const worktreeStatus = asString(entry.worktreeStatus, " ");
          return {
            path,
            status: `${indexStatus}${worktreeStatus}`.trim() || "modified",
            staged: Boolean(entry.staged),
            untracked: Boolean(entry.untracked),
          };
        })
        .filter((entry): entry is WorkbenchChange => entry !== null),
    [changes.data],
  );
  const commandEntries = useMemo(
    () => asArray(terminal.data?.commands).map((value) => asRecord(value)),
    [terminal.data],
  );
  const planEntries = useMemo(
    () => asArray(plans.data?.plans).map((value) => asRecord(value)),
    [plans.data],
  );
  const settingEntries = useMemo(
    () => flattenSettingEntries(settings.data?.settings).slice(0, 24),
    [settings.data],
  );
  const delegatedTaskEntries = useMemo(
    () => asArray(delegationTasks.data?.tasks).map(asRecord),
    [delegationTasks.data],
  );
  const briefPlanSummary = buildBriefPlanSummary(planEntries);
  const runEntries = useMemo(
    () => asArray(codegen.data?.runs).map(asRecord),
    [codegen.data],
  );
  const approvalEntries = useMemo(
    () => asArray(approvals.data?.approvals).map(asRecord),
    [approvals.data],
  );
  const activeRunCount = asNumber(codegen.data?.summary?.running) || 0;
  const failedRunCount = asNumber(codegen.data?.summary?.failed) || 0;
  const currentFile =
    selectedFile || fileEntries.find((entry) => entry.type === "file")?.path;
  const currentChange = selectedChange || changeEntries[0]?.path;
  const currentCommand =
    commandEntries.find(
      (entry, index) =>
        asString(entry.id, `terminal-${index}`) === selectedCommand,
    ) ?? commandEntries[0];
  const file = useApiResource<WorkspaceReadResponse>(
    active && model.railOpen && model.selectedTab === "files" && currentFile
      ? `/workspace/read?path=${encodeURIComponent(currentFile)}`
      : null,
    [active, model.railOpen, model.selectedTab, currentFile],
  );
  const patch = useApiResource<RepositoryPatchResponse>(
    active && model.railOpen && model.selectedTab === "changes" && currentChange
      ? `/repo/patch?path=${encodeURIComponent(currentChange)}&staged=false`
      : null,
    [active, model.railOpen, model.selectedTab, currentChange],
  );

  useEffect(() => {
    setModel({
      ...loadThreadWorkbenchState(
        {
          sessionId,
          workspacePath,
          lifecycle: active ? "active" : "idle",
        },
        storage,
      ),
      railOpen: true,
    });
    setSelectedFile("");
    setSelectedChange("");
    setSelectedCommand("");
  }, [storage, active, sessionId, workspacePath]);

  useEffect(() => {
    if (model.sessionId !== (sessionId.trim() || "local")) return;
    saveThreadWorkbenchState(model, storage);
  }, [model, sessionId, storage]);

  const repositorySummary = summary.data?.summary;
  useEffect(() => {
    if (!repositorySummary) return;
    const root = asString(repositorySummary.root) || workspacePath;
    setModel((current) => {
      const branch = asString(repositorySummary.branch);
      const head = asString(repositorySummary.head);
      const worktreePath =
        root && workspacePath && root !== workspacePath ? root : undefined;
      if (
        current.branch === branch &&
        current.head === head &&
        current.worktreePath === worktreePath &&
        current.lifecycle === (active ? "active" : "idle")
      ) {
        return current;
      }
      return {
        ...current,
        branch,
        head,
        ...(worktreePath ? { worktreePath } : { worktreePath: undefined }),
        lifecycle: active ? "active" : "idle",
      };
    });
  }, [active, repositorySummary, workspacePath]);

  useEffect(() => {
    if (!copiedLabel) return;
    const timeout = window.setTimeout(() => setCopiedLabel(""), 1_800);
    return () => window.clearTimeout(timeout);
  }, [copiedLabel]);

  if (!active) return null;

  const selectTab = (tab: ThreadWorkbenchTab) => {
    setModel((current) => ({ ...current, selectedTab: tab, railOpen: true }));
  };
  const insert = (label: string, value: string) => {
    onInsertContext(value);
    setCopiedLabel(label);
  };
  const resizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = model.railWidth;
    const onMove = (moveEvent: PointerEvent) => {
      setModel((current) => ({
        ...current,
        railWidth: clampThreadWorkbenchWidth(
          startWidth + startX - moveEvent.clientX,
        ),
      }));
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
  };
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      event.key === "ArrowLeft" ? 16 : event.key === "ArrowRight" ? -16 : 0;
    if (!delta) return;
    event.preventDefault();
    setModel((current) => ({
      ...current,
      railWidth: clampThreadWorkbenchWidth(current.railWidth + delta),
    }));
  };
  const navigateTabs = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let target = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      target = (index + 1) % THREAD_WORKBENCH_TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      target =
        (index - 1 + THREAD_WORKBENCH_TABS.length) %
        THREAD_WORKBENCH_TABS.length;
    } else if (event.key === "Home") {
      target = 0;
    } else if (event.key === "End") {
      target = THREAD_WORKBENCH_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const tab = THREAD_WORKBENCH_TABS[target];
    if (!tab) return;
    selectTab(tab);
    requestAnimationFrame(() => tabRefs.current[tab]?.focus());
  };

  const panelId = `thread-workbench-${model.selectedTab}-panel`;
  const tabId = `thread-workbench-${model.selectedTab}-tab`;
  const previewRecord = asRecord(preview.data?.browser);
  const previewMode =
    asString(previewRecord.mode) ||
    asString(previewRecord.captureMode) ||
    "Available";
  const selectedFullView = FULL_VIEW[model.selectedTab];
  const selectedCommandOutput = currentCommand
    ? commandOutput(currentCommand)
    : "";
  const createCheckpoint = async () => {
    setCheckpointBusy(true);
    setCheckpointMessage("");
    try {
      const response = await desktopRequest<{ checkpoint?: { id?: string } }>(
        "/workspace/checkpoints",
        "POST",
        { label: "Operator checkpoint" },
      );
      setCheckpointMessage(
        `Created checkpoint ${asString(response.checkpoint?.id, "")}.`,
      );
      checkpoints.reload();
    } catch (error) {
      setCheckpointMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCheckpointBusy(false);
    }
  };
  const restoreCheckpoint = async (id: string) => {
    if (
      !window.confirm(
        `Restore checkpoint ${id}? This overwrites tracked workspace files. The runtime will not restart.`,
      )
    ) {
      return;
    }
    setCheckpointBusy(true);
    setCheckpointMessage("");
    try {
      await desktopRequest(
        `/workspace/checkpoints/${encodeURIComponent(id)}/restore`,
        "POST",
        { confirmCheckpointId: id },
      );
      setCheckpointMessage(`Restored ${id}. Runtime remains running.`);
      changes.reload();
      checkpoints.reload();
    } catch (error) {
      setCheckpointMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCheckpointBusy(false);
    }
  };

  return (
    <aside
      aria-label="Thread workbench"
      className="thread-workbench"
      style={
        { "--thread-workbench-width": `${model.railWidth}px` } as CSSProperties
      }
    >
      <button
        aria-label="Resize thread workbench"
        className="thread-workbench-resizer"
        onKeyDown={resizeWithKeyboard}
        onPointerDown={resizeStart}
        title={`Resize workbench. Current width ${model.railWidth} pixels.`}
        type="button"
      />

      <header className="thread-workbench-header">
        <div className="thread-workbench-heading">
          <div>
            <span className="thread-workbench-kicker">Thread workbench</span>
            <strong>{model.workspaceName}</strong>
          </div>
          <button
            aria-label="Close thread workbench"
            className="thread-workbench-icon-button"
            onClick={onRequestClose}
            title="Close workbench"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="thread-workbench-repository">
          <span className="thread-workbench-repo-mark" aria-hidden="true">
            ⎇
          </span>
          <div>
            <strong>{branchHeadLabel(model.branch, model.head)}</strong>
            <small title={model.worktreePath || model.workspacePath}>
              {model.worktreePath
                ? `Worktree · ${compactPath(model.worktreePath)}`
                : `Local · ${compactPath(model.workspacePath)}`}
            </small>
          </div>
          <Badge
            tone={
              repositorySummary?.dirty
                ? "warn"
                : repositorySummary?.isRepository
                  ? "good"
                  : "neutral"
            }
          >
            {repositorySummary?.dirty
              ? `${asNumber(repositorySummary.changedFiles)} changed`
              : repositorySummary?.isRepository
                ? "clean"
                : "workspace"}
          </Badge>
        </div>
      </header>

      <div
        aria-label="Thread workbench views"
        className="thread-workbench-tabs"
        role="tablist"
      >
        {THREAD_WORKBENCH_TABS.map((tab, index) => (
          <button
            aria-controls={`thread-workbench-${tab}-panel`}
            aria-selected={model.selectedTab === tab}
            id={`thread-workbench-${tab}-tab`}
            key={tab}
            onClick={() => selectTab(tab)}
            onKeyDown={(event) => navigateTabs(event, index)}
            ref={(node) => {
              tabRefs.current[tab] = node;
            }}
            role="tab"
            tabIndex={model.selectedTab === tab ? 0 : -1}
            title={TAB_LABELS[tab]}
            type="button"
          >
            <span aria-hidden="true">{TAB_MARKS[tab]}</span>
            <small>{TAB_LABELS[tab]}</small>
          </button>
        ))}
      </div>

      <section
        aria-labelledby={tabId}
        className="thread-workbench-panel"
        id={panelId}
        role="tabpanel"
      >
        <div className="thread-workbench-panel-heading">
          <div>
            <span className="thread-workbench-panel-title">
              {TAB_LABELS[model.selectedTab]}
            </span>
            <small>
              {model.selectedTab === "files"
                ? `${fileEntries.length} entries`
                : model.selectedTab === "changes"
                  ? `${changeEntries.length} changed`
                  : model.selectedTab === "terminal"
                    ? `${commandEntries.length} commands`
                    : model.selectedTab === "plans"
                      ? `${planEntries.length} plans`
                      : model.selectedTab === "brief"
                        ? `${approvalEntries.length} pending approvals · ${delegatedTaskEntries.length} recent tasks`
                        : model.selectedTab === "settings"
                          ? `${settingEntries.length} values`
                          : previewMode}
            </small>
          </div>
          {selectedFullView ? (
            <button
              className="thread-workbench-text-button"
              onClick={() => onOpenFullView(selectedFullView)}
              type="button"
            >
              Open full view
            </button>
          ) : null}
        </div>

        {model.selectedTab === "files" ? (
          <>
            <ResourceState
              error={tree.error}
              loading={tree.loading}
              retry={tree.reload}
            />
            {!tree.loading && !tree.error ? (
              <div className="thread-workbench-split">
                <div className="thread-workbench-list">
                  {fileEntries.slice(0, 160).map((entry) => (
                    <button
                      aria-current={currentFile === entry.path}
                      className={
                        currentFile === entry.path ? "selected" : undefined
                      }
                      disabled={entry.type === "directory"}
                      key={entry.path}
                      onClick={() => setSelectedFile(entry.path)}
                      style={{ "--tree-depth": entry.depth } as CSSProperties}
                      title={entry.path}
                      type="button"
                    >
                      <span aria-hidden="true">
                        {entry.type === "directory" ? "▸" : "·"}
                      </span>
                      <span>{entry.path.split("/").at(-1)}</span>
                    </button>
                  ))}
                  {!fileEntries.length ? (
                    <p className="thread-workbench-empty">
                      No files returned for this workspace.
                    </p>
                  ) : null}
                </div>
                {currentFile ? (
                  <div className="thread-workbench-preview">
                    <div>
                      <code title={currentFile}>
                        {compactPath(currentFile)}
                      </code>
                      <button
                        disabled={!file.data?.content}
                        onClick={() =>
                          insert(
                            "File context added",
                            contextBlock(
                              "file",
                              currentFile,
                              asString(file.data?.content),
                            ),
                          )
                        }
                        type="button"
                      >
                        Add to chat
                      </button>
                    </div>
                    {file.loading ? (
                      <LoadingBlock label="Reading file…" />
                    ) : file.error ? (
                      <ErrorBlock error={file.error} retry={file.reload} />
                    ) : (
                      <pre>{bounded(asString(file.data?.content), 4_000)}</pre>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {model.selectedTab === "changes" ? (
          <>
            <section
              aria-label="Workspace checkpoints"
              className="thread-workbench-checkpoints"
            >
              <div>
                <strong>Checkpoints</strong>
                <small>
                  Local Git snapshots. Restore requires confirmation and never
                  restarts Doolittle.
                </small>
              </div>
              {checkpoints.data?.support?.supported ? (
                <button
                  className="thread-workbench-text-button"
                  disabled={checkpointBusy}
                  onClick={() => void createCheckpoint()}
                  type="button"
                >
                  {checkpointBusy ? "Working…" : "Create checkpoint"}
                </button>
              ) : (
                <small>
                  {asString(
                    checkpoints.data?.support?.reason,
                    "Checkpoints unavailable.",
                  )}
                </small>
              )}
              {checkpointMessage ? (
                <p role="status">{checkpointMessage}</p>
              ) : null}
              {checkpoints.data?.support?.supported ? (
                <div className="thread-workbench-checkpoint-list">
                  {asArray(checkpoints.data?.checkpoints)
                    .slice(0, 8)
                    .map((value) => {
                      const checkpoint = asRecord(value);
                      const id = asString(checkpoint.id);
                      if (!id) return null;
                      return (
                        <div key={id}>
                          <span className="thread-workbench-checkpoint-details">
                            <strong>
                              {asString(checkpoint.label, "Checkpoint")}
                            </strong>
                            <small>
                              {displayTimestamp(asString(checkpoint.createdAt))}{" "}
                              · {asString(checkpoint.revision).slice(0, 8)}
                            </small>
                          </span>
                          <button
                            disabled={checkpointBusy}
                            onClick={() => void restoreCheckpoint(id)}
                            type="button"
                          >
                            Restore
                          </button>
                        </div>
                      );
                    })}
                </div>
              ) : null}
            </section>
            <ResourceState
              error={changes.error}
              loading={changes.loading}
              retry={changes.reload}
            />
            {!changes.loading && !changes.error ? (
              <div className="thread-workbench-split">
                <div className="thread-workbench-list">
                  {changeEntries.map((entry) => (
                    <button
                      aria-current={currentChange === entry.path}
                      className={
                        currentChange === entry.path ? "selected" : undefined
                      }
                      key={entry.path}
                      onClick={() => setSelectedChange(entry.path)}
                      title={entry.path}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={
                          entry.untracked
                            ? "untracked"
                            : entry.staged
                              ? "staged"
                              : "modified"
                        }
                      >
                        {entry.untracked ? "U" : entry.staged ? "S" : "M"}
                      </span>
                      <span>{entry.path}</span>
                      <small>{entry.status}</small>
                    </button>
                  ))}
                  {!changeEntries.length ? (
                    <p className="thread-workbench-empty">
                      Working tree is clean.
                    </p>
                  ) : null}
                </div>
                {currentChange ? (
                  <div className="thread-workbench-preview diff">
                    <div>
                      <code title={currentChange}>
                        {compactPath(currentChange)}
                      </code>
                      <button
                        disabled={!patch.data?.patch?.patch}
                        onClick={() =>
                          insert(
                            "Diff context added",
                            contextBlock(
                              "diff",
                              currentChange,
                              asString(patch.data?.patch?.patch),
                            ),
                          )
                        }
                        type="button"
                      >
                        Add diff
                      </button>
                    </div>
                    {patch.loading ? (
                      <LoadingBlock label="Reading diff…" />
                    ) : patch.error ? (
                      <ErrorBlock error={patch.error} retry={patch.reload} />
                    ) : (
                      <pre>
                        {bounded(asString(patch.data?.patch?.patch), 5_000)}
                      </pre>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {model.selectedTab === "terminal" ? (
          <>
            <ResourceState
              error={terminal.error}
              loading={terminal.loading}
              retry={terminal.reload}
            />
            {!terminal.loading && !terminal.error ? (
              <div className="thread-workbench-terminal">
                <div className="thread-workbench-command-list">
                  {commandEntries.map((entry, index) => {
                    const id = asString(entry.id, `terminal-${index}`);
                    const selected = currentCommand === entry;
                    return (
                      <button
                        aria-current={selected}
                        className={selected ? "selected" : undefined}
                        key={id}
                        onClick={() => setSelectedCommand(id)}
                        type="button"
                      >
                        <span>$ {asString(entry.command, "command")}</span>
                        <small>
                          {asString(entry.status, "completed")}
                          {entry.startedAt
                            ? ` · ${displayTimestamp(asString(entry.startedAt))}`
                            : ""}
                        </small>
                      </button>
                    );
                  })}
                </div>
                {currentCommand ? (
                  <div className="thread-workbench-preview terminal">
                    <div>
                      <Badge tone={statusTone(asString(currentCommand.status))}>
                        {asString(currentCommand.status, "recorded")}
                      </Badge>
                      <button
                        disabled={!selectedCommandOutput}
                        onClick={() =>
                          insert(
                            "Terminal output added",
                            contextBlock(
                              "terminal",
                              asString(currentCommand.command, "command"),
                              selectedCommandOutput,
                            ),
                          )
                        }
                        type="button"
                      >
                        Add output
                      </button>
                    </div>
                    <pre>{bounded(selectedCommandOutput, 5_000)}</pre>
                  </div>
                ) : (
                  <p className="thread-workbench-empty">
                    No terminal history yet.
                  </p>
                )}
              </div>
            ) : null}
          </>
        ) : null}

        {model.selectedTab === "plans" ? (
          <>
            <ResourceState
              error={plans.error}
              loading={plans.loading}
              retry={plans.reload}
            />
            {!plans.loading && !plans.error ? (
              <div className="thread-workbench-plan-list">
                {planEntries.map((plan, index) => {
                  const id = asString(plan.id, `plan-${index}`);
                  const status = asString(plan.status, "draft");
                  const steps = asArray(plan.steps)
                    .map((step) => asString(step))
                    .filter(Boolean);
                  return (
                    <article className="thread-workbench-plan-card" key={id}>
                      <div>
                        <strong>{asString(plan.title, "Untitled plan")}</strong>
                        <Badge tone={statusTone(status)}>{status}</Badge>
                      </div>
                      <p>
                        {asString(plan.objective, "No objective recorded.")}
                      </p>
                      <small>
                        {steps.length} {steps.length === 1 ? "step" : "steps"}
                        {plan.updatedAt
                          ? ` · ${displayTimestamp(asString(plan.updatedAt))}`
                          : ""}
                      </small>
                    </article>
                  );
                })}
                {!planEntries.length ? (
                  <p className="thread-workbench-empty">
                    No plans are attached to the local runtime.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {model.selectedTab === "brief" ? (
          <>
            <ResourceState
              error={
                plans.error ||
                delegationTasks.error ||
                codegen.error ||
                approvals.error ||
                terminal.error
              }
              loading={
                plans.loading ||
                delegationTasks.loading ||
                codegen.loading ||
                approvals.loading ||
                terminal.loading
              }
              retry={() => {
                plans.reload();
                terminal.reload();
                delegationTasks.reload();
                codegen.reload();
                approvals.reload();
              }}
            />
            {!(
              plans.loading ||
              delegationTasks.loading ||
              codegen.loading ||
              approvals.loading ||
              terminal.loading
            ) ? (
              <div className="thread-workbench-brief">
                <section className="thread-workbench-brief-stack">
                  <article>
                    <h3>Workspace pulse</h3>
                    <div>
                      <span>Branch</span>
                      <strong>
                        {branchHeadLabel(model.branch, model.head)}
                      </strong>
                    </div>
                    <div>
                      <span>Repository</span>
                      <strong>
                        {asString(repositorySummary?.root, model.workspacePath)}
                      </strong>
                    </div>
                    <div>
                      <span>Dirty files</span>
                      <strong>
                        {asNumber(repositorySummary?.changedFiles, 0)}
                      </strong>
                    </div>
                  </article>
                  <article>
                    <h3>Current plan</h3>
                    {briefPlanSummary.activePlan ? (
                      <>
                        <div>
                          <span>Plan</span>
                          <strong>{briefPlanSummary.activePlan.title}</strong>
                        </div>
                        <p>{briefPlanSummary.activePlan.objective}</p>
                        <div>
                          <span>Status</span>
                          <Badge
                            tone={statusTone(
                              briefPlanSummary.activePlan.status,
                            )}
                          >
                            {briefPlanSummary.activePlan.status}
                          </Badge>
                        </div>
                        <div>
                          <span>Next step</span>
                          <strong>
                            {briefPlanSummary.activePlan.nextStep}
                          </strong>
                        </div>
                        <div>
                          <span>Total steps</span>
                          <strong>
                            {briefPlanSummary.activePlan.stepCount}
                          </strong>
                        </div>
                      </>
                    ) : (
                      <p className="thread-workbench-empty">
                        No active plan right now.{" "}
                        {briefPlanSummary.draftCount > 0
                          ? `There are ${briefPlanSummary.draftCount} draft(s).`
                          : ""}
                      </p>
                    )}
                    <button
                      onClick={() =>
                        insert(
                          "Brief plan summary added",
                          contextBlock(
                            "brief",
                            "plan-summary",
                            JSON.stringify({
                              status:
                                briefPlanSummary.activePlan?.status ??
                                "unavailable",
                              nextStep:
                                briefPlanSummary.activePlan?.nextStep ??
                                "unavailable",
                              title:
                                briefPlanSummary.activePlan?.title ??
                                "unavailable",
                              objective:
                                briefPlanSummary.activePlan?.objective ??
                                "unavailable",
                              stepCount:
                                briefPlanSummary.activePlan?.stepCount ??
                                briefPlanSummary.draftCount,
                            }),
                          ),
                        )
                      }
                      type="button"
                    >
                      Add plan context
                    </button>
                  </article>
                </section>

                <section className="thread-workbench-brief-list">
                  <h3>Task and approval pressure</h3>
                  {delegatedTaskEntries.length ? (
                    <div className="thread-workbench-list">
                      {delegatedTaskEntries.slice(0, 6).map((entry, index) => {
                        const id = asString(entry.id, `task-${index}`);
                        const title = asString(
                          entry.title,
                          asString(entry.objective, "Untitled task"),
                        );
                        const status = asString(entry.status, "pending");
                        return (
                          <button
                            key={id}
                            onClick={() =>
                              insert(
                                "Delegation task context added",
                                contextBlock(
                                  "delegation-task",
                                  id,
                                  `${title}\n\n${asString(entry.group)}\n${asString(
                                    entry.status,
                                    "pending",
                                  )}`,
                                ),
                              )
                            }
                            type="button"
                          >
                            <span>{title}</span>
                            <small>
                              <Badge tone={statusTone(status)}>{status}</Badge>
                              {asString(entry.profile)}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="thread-workbench-empty">
                      No recent tasks in the delegation queue.
                    </p>
                  )}
                  {approvalEntries.length ? (
                    <div className="thread-workbench-list">
                      {approvalEntries.slice(0, 6).map((approval, index) => {
                        const id = asString(approval.id, `approval-${index}`);
                        const command = asString(
                          approval.command,
                          "Pending execution approval",
                        );
                        return (
                          <button
                            key={id}
                            onClick={() =>
                              insert(
                                "Execution approval context added",
                                contextBlock(
                                  "execution-approval",
                                  id,
                                  `${command}\n\n${asString(
                                    approval.reason,
                                  )}\n${displayTimestamp(asString(approval.createdAt))}`,
                                ),
                              )
                            }
                            type="button"
                          >
                            <span>{compactPath(command)}</span>
                            <small>
                              {displayTimestamp(asString(approval.createdAt))}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </section>

                <section className="thread-workbench-brief-list">
                  <h3>Automation + terminal pressure</h3>
                  <div className="thread-workbench-list">
                    <article className="thread-workbench-brief-stat">
                      <span>Codegen</span>
                      <strong>{`${activeRunCount} active · ${failedRunCount} failed`}</strong>
                      <small>
                        {runEntries.length} recent run(s),{" "}
                        {asNumber(codegen.data?.summary?.total)} total
                      </small>
                    </article>
                    {commandEntries.length ? (
                      commandEntries.slice(0, 5).map((entry, index) => {
                        const id = asString(entry.id, `terminal-${index}`);
                        return (
                          <button
                            key={id}
                            onClick={() =>
                              insert(
                                "Terminal context added",
                                contextBlock(
                                  "terminal",
                                  asString(entry.command, "command"),
                                  commandOutput(entry),
                                ),
                              )
                            }
                            type="button"
                          >
                            <span>$ {asString(entry.command, "command")}</span>
                            <small>
                              {asString(entry.startedAt, "No timestamp")}
                            </small>
                          </button>
                        );
                      })
                    ) : (
                      <p className="thread-workbench-empty">
                        No terminal activity yet in this workspace.
                      </p>
                    )}
                  </div>
                </section>

                <section className="thread-workbench-brief-list">
                  <h3>Quick navigation</h3>
                  <div className="thread-workbench-quick-nav">
                    {QUICK_NAVIGATION.map((item) => (
                      <button
                        key={item.label}
                        className="thread-workbench-text-button"
                        onClick={() => onOpenFullView(item.view)}
                        title={item.blurb}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
          </>
        ) : null}

        {model.selectedTab === "settings" ? (
          <>
            <ResourceState
              error={settings.error}
              loading={settings.loading}
              retry={settings.reload}
            />
            {!settings.loading && !settings.error ? (
              <div className="thread-workbench-settings">
                <section>
                  <h3>Runtime snapshot</h3>
                  <article>
                    <p>
                      <strong>Workspace</strong>
                      <span>{model.workspaceName}</span>
                    </p>
                    <p>
                      <strong>Branch</strong>
                      <span>{branchHeadLabel(model.branch, model.head)}</span>
                    </p>
                    <p>
                      <strong>Changed files</strong>
                      <span>
                        {asNumber(repositorySummary?.changedFiles, 0)}
                      </span>
                    </p>
                  </article>
                </section>
                <section>
                  <h3>Runtime settings snapshot</h3>
                  <div className="thread-workbench-settings-grid">
                    {settingEntries.length ? (
                      settingEntries.map((setting) => (
                        <article
                          key={setting.key}
                          className="thread-workbench-settings-item"
                        >
                          <small>{setting.key}</small>
                          <strong>{setting.value}</strong>
                        </article>
                      ))
                    ) : (
                      <p className="thread-workbench-empty">
                        No settings values returned from runtime.
                      </p>
                    )}
                  </div>
                </section>
                <section className="thread-workbench-settings-nav">
                  <h3>Open full-screen navigation</h3>
                  <div>
                    {QUICK_NAVIGATION.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => onOpenFullView(item.view)}
                        title={item.blurb}
                        type="button"
                      >
                        <strong>{item.label}</strong>
                        <small>{item.blurb}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
          </>
        ) : null}

        {model.selectedTab === "preview" ? (
          <>
            <ResourceState
              error={preview.error}
              loading={preview.loading}
              retry={preview.reload}
            />
            {!preview.loading && !preview.error ? (
              <div className="thread-workbench-preview-status">
                <div
                  className="thread-workbench-preview-orbit"
                  aria-hidden="true"
                >
                  <i />
                  <span className="thread-workbench-orbit-mark">◎</span>
                </div>
                <Badge tone="good">{previewMode}</Badge>
                <strong>Local preview tools are connected</strong>
                <p className="thread-workbench-preview-copy">
                  Inspect, capture, compare, and analyze your running app
                  without leaving the thread.
                </p>
                {Object.keys(previewRecord).length ? (
                  <dl>
                    {Object.entries(previewRecord)
                      .filter(([, value]) =>
                        ["string", "number", "boolean"].includes(typeof value),
                      )
                      .slice(0, 6)
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <footer className="thread-workbench-footer">
        <span aria-live="polite">
          {copiedLabel || `${model.environment} · ${model.lifecycle}`}
        </span>
        <button
          aria-label="Refresh current workbench view"
          className="thread-workbench-icon-button"
          onClick={() => {
            summary.reload();
            if (model.selectedTab === "files") {
              tree.reload();
              file.reload();
            }
            if (model.selectedTab === "changes") {
              changes.reload();
              patch.reload();
            }
            if (model.selectedTab === "terminal") terminal.reload();
            if (model.selectedTab === "plans") plans.reload();
            if (model.selectedTab === "brief") {
              plans.reload();
              terminal.reload();
              delegationTasks.reload();
              codegen.reload();
              approvals.reload();
            }
            if (model.selectedTab === "settings") settings.reload();
            if (model.selectedTab === "preview") preview.reload();
          }}
          title="Refresh"
          type="button"
        >
          ↻
        </button>
      </footer>
    </aside>
  );
}
