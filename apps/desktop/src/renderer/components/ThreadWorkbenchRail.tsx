import { type CSSProperties, type KeyboardEvent, useRef } from "react";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
} from "../lib";
import {
  clampThreadWorkbenchWidth,
  THREAD_WORKBENCH_DEFAULT_WIDTH,
  THREAD_WORKBENCH_MAX_WIDTH,
  THREAD_WORKBENCH_MIN_WIDTH,
  THREAD_WORKBENCH_TABS,
  type ThreadWorkbenchTab,
} from "../thread-workbench";
import {
  bounded,
  commandOutput,
  contextBlock,
  useThreadWorkbenchRailController,
} from "../thread-workbench-controller";
import { CodeEditor } from "./CodeEditor";
import { GitControlPanel } from "./GitControlPanel";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import "../thread-workbench.css";
import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import type { RepositoryControlChange } from "../repository-control";

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

interface NavigationCard {
  label: string;
  view: ThreadWorkbenchFullView;
  blurb: string;
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
  const controller = useThreadWorkbenchRailController({
    active,
    sessionId,
    workspacePath,
    onInsertContext,
  });
  const {
    acpEditor,
    model,
    setModel,
    setSelectedFile,
    setSelectedChange,
    setSelectedCommand,
    copiedLabel,
    checkpointMessage,
    checkpointBusy,
    tree,
    changes,
    branches,
    remotes,
    stashes,
    conflicts,
    worktrees,
    checkpoints,
    terminal,
    plans,
    settings,
    delegationTasks,
    codegen,
    approvals,
    preview,
    fileEntries,
    changeEntries,
    commandEntries,
    planEntries,
    settingEntries,
    delegatedTaskEntries,
    briefPlanSummary,
    runEntries,
    approvalEntries,
    activeRunCount,
    failedRunCount,
    currentFile,
    currentFileLanguage,
    currentChange,
    currentCommand,
    file,
    patch,
    repositorySummary,
    selectTab,
    insert,
    refreshGit,
    refreshCurrent,
    createCheckpoint,
    restoreCheckpoint,
  } = controller;
  const tabRefs = useRef<Record<ThreadWorkbenchTab, HTMLButtonElement | null>>({
    files: null,
    changes: null,
    terminal: null,
    plans: null,
    brief: null,
    settings: null,
    preview: null,
  });
  if (!active) return null;
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

  return (
    <aside
      aria-label="Thread workbench"
      className="thread-workbench"
      style={
        { "--thread-workbench-width": `${model.railWidth}px` } as CSSProperties
      }
    >
      <PanelResizeHandle
        bounds={{
          default: THREAD_WORKBENCH_DEFAULT_WIDTH,
          min: THREAD_WORKBENCH_MIN_WIDTH,
          max: THREAD_WORKBENCH_MAX_WIDTH,
        }}
        className="thread-workbench-resizer"
        direction="grow-left"
        label="Resize thread workbench"
        onResize={(railWidth) =>
          setModel((current) => ({
            ...current,
            railWidth: clampThreadWorkbenchWidth(railWidth),
          }))
        }
        value={model.railWidth}
      />

      <header className="thread-workbench-header">
        <div className="thread-workbench-heading">
          <div className="thread-workbench-lockup">
            <span aria-hidden="true" className="thread-workbench-mark">
              <i />
              <span>WB</span>
            </span>
            <div>
              <span className="thread-workbench-kicker">Workbench {"//"}</span>
              <strong>{model.workspaceName}</strong>
              <small>Thread-bound operator surface</small>
            </div>
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
        <div
          className="thread-workbench-status-strip"
          aria-label="Workbench status"
          role="status"
        >
          <span>
            <i aria-hidden="true" /> {model.lifecycle}
          </span>
          <span>{model.environment}</span>
          <span>{THREAD_WORKBENCH_TABS.length} modules</span>
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
            <span className="thread-workbench-tab-mark" aria-hidden="true">
              {TAB_MARKS[tab]}
            </span>
            <small>{TAB_LABELS[tab]}</small>
            <i aria-hidden="true" className="thread-workbench-tab-signal" />
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
            <span className="thread-workbench-panel-kicker">
              Module{" "}
              {String(
                THREAD_WORKBENCH_TABS.indexOf(model.selectedTab) + 1,
              ).padStart(2, "0")}
            </span>
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
          <div className="thread-workbench-panel-body thread-workbench-panel-body--files">
            <ResourceState
              error={tree.error}
              loading={tree.loading}
              retry={tree.reload}
            />
            {!tree.loading && !tree.error ? (
              <div className="thread-workbench-split thread-workbench-file-workspace">
                <div className="thread-workbench-tree">
                  {fileEntries.length ? (
                    <WorkspaceFileTree
                      entries={fileEntries}
                      key={workspacePath}
                      onOpenFile={setSelectedFile}
                      selectedPath={currentFile}
                    />
                  ) : (
                    <p className="thread-workbench-empty">
                      No files returned for this workspace.
                    </p>
                  )}
                </div>
                <div className="thread-workbench-preview thread-workbench-code-preview">
                  {currentFile ? (
                    <>
                      <div>
                        <code title={currentFile}>
                          {compactPath(currentFile)}
                        </code>
                        <span>{currentFileLanguage.label}</span>
                        <div>
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
                      </div>
                      {file.loading ? (
                        <LoadingBlock label="Reading file…" />
                      ) : file.error ? (
                        <ErrorBlock error={file.error} retry={file.reload} />
                      ) : (
                        <div className="thread-workbench-monaco">
                          <CodeEditor
                            ariaLabel={`Preview ${currentFile}`}
                            compact
                            disabled
                            language={currentFileLanguage}
                            onChange={() => undefined}
                            onEditorStateChange={(snapshot) =>
                              acpEditor.publishEditorState(snapshot, false)
                            }
                            onSave={() => undefined}
                            path={currentFile}
                            value={asString(file.data?.content)}
                            workspacePath={workspacePath}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="thread-workbench-file-empty">
                      <span
                        aria-hidden="true"
                        className="thread-workbench-file-empty-icon"
                      >
                        &lt;/&gt;
                      </span>
                      <strong>Select a file</strong>
                      <p>
                        Expand the repository tree to inspect a syntax-aware
                        preview.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {model.selectedTab === "changes" ? (
          <div className="thread-workbench-panel-body thread-workbench-panel-body--changes">
            <div className="thread-workbench-pane-stack">
              <GitControlPanel
                active={Boolean(repositorySummary?.isRepository)}
                branches={
                  asArray(branches.data?.branches) as RepositoryBranch[]
                }
                changes={changeEntries as RepositoryControlChange[]}
                conflicts={
                  asArray(conflicts.data?.conflicts) as RepositoryConflict[]
                }
                onRefresh={refreshGit}
                remotes={asArray(remotes.data?.remotes) as RepositoryRemote[]}
                stashes={asArray(stashes.data?.stashes) as RepositoryStash[]}
                variant="compact"
                worktrees={
                  asArray(worktrees.data?.worktrees) as Array<{
                    path: string;
                    branch?: string;
                    current?: boolean;
                    prunable?: boolean;
                  }>
                }
              />
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
                                {displayTimestamp(
                                  asString(checkpoint.createdAt),
                                )}{" "}
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
            </div>
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
          </div>
        ) : null}

        {model.selectedTab === "terminal" ? (
          <div className="thread-workbench-panel-body thread-workbench-panel-body--terminal">
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
          </div>
        ) : null}

        {model.selectedTab === "plans" ? (
          <div className="thread-workbench-panel-body thread-workbench-panel-body--plans">
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
          </div>
        ) : null}

        {model.selectedTab === "brief" ? (
          <div className="thread-workbench-panel-body thread-workbench-panel-body--brief">
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
          </div>
        ) : null}

        {model.selectedTab === "settings" ? (
          <div className="thread-workbench-panel-body thread-workbench-panel-body--settings">
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
          </div>
        ) : null}

        {model.selectedTab === "preview" ? (
          <div className="thread-workbench-panel-body thread-workbench-panel-body--preview">
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
          </div>
        ) : null}
      </section>

      <footer className="thread-workbench-footer">
        <span aria-live="polite">
          {copiedLabel || `${model.environment} · ${model.lifecycle}`}
        </span>
        <button
          aria-label="Refresh current workbench view"
          className="thread-workbench-icon-button"
          onClick={refreshCurrent}
          title="Refresh"
          type="button"
        >
          ↻
        </button>
      </footer>
    </aside>
  );
}
