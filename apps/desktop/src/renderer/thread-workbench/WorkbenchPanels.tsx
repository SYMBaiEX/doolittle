import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { GitControlPanel } from "../components/GitControlPanel";
import { ThreadWorkbenchFilesPanel } from "../components/ThreadWorkbenchFilesPanel";
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
import type { RepositoryControlChange } from "../repository-control";
import { THREAD_WORKBENCH_TABS } from "../thread-workbench";
import {
  bounded,
  commandOutput,
  contextBlock,
} from "../thread-workbench-controller";
import {
  branchHeadLabel,
  compactRailLabel,
  FULL_VIEW,
  QUICK_NAVIGATION,
  statusTone,
  TAB_LABELS,
  type ThreadWorkbenchFullView,
  type WorkbenchController,
} from "./models";
import { ResourceState } from "./ResourceState";

export interface WorkbenchPanelsProps {
  controller: WorkbenchController;
  workspacePath: string;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
}

function FilesPanel({
  controller,
  workspacePath,
}: {
  controller: WorkbenchController;
  workspacePath: string;
}) {
  const {
    acpEditor,
    fileEntries,
    file,
    currentFile,
    currentFileLanguage,
    setSelectedFile,
    tree,
    insert,
  } = controller;
  return (
    <ThreadWorkbenchFilesPanel
      entries={fileEntries}
      file={file}
      onEditorStateChange={(snapshot) =>
        acpEditor.publishEditorState(snapshot, false)
      }
      onInsertFileContext={() =>
        insert(
          "File context added",
          contextBlock("file", currentFile, asString(file.data?.content)),
        )
      }
      onSelectPath={setSelectedFile}
      selectedLanguage={currentFileLanguage}
      selectedPath={currentFile}
      tree={tree}
      workspacePath={workspacePath}
    />
  );
}

function ChangesPanel({ controller }: { controller: WorkbenchController }) {
  const {
    repositorySummary,
    branches,
    changeEntries,
    conflicts,
    remotes,
    stashes,
    worktrees,
    refreshGit,
    checkpoints,
    checkpointBusy,
    createCheckpoint,
    checkpointMessage,
    restoreCheckpoint,
    changes,
    currentChange,
    patch,
    setSelectedChange,
    insert,
  } = controller;
  return (
    <div className="thread-workbench-panel-body thread-workbench-panel-body--changes">
      <div className="thread-workbench-pane-stack">
        <GitControlPanel
          active={Boolean(repositorySummary?.isRepository)}
          branches={asArray(branches.data?.branches) as RepositoryBranch[]}
          changes={changeEntries as RepositoryControlChange[]}
          conflicts={asArray(conflicts.data?.conflicts) as RepositoryConflict[]}
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
          {checkpointMessage ? <p role="status">{checkpointMessage}</p> : null}
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
                          {displayTimestamp(asString(checkpoint.createdAt))} ·{" "}
                          {asString(checkpoint.revision).slice(0, 8)}
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
              <p className="thread-workbench-empty">Working tree is clean.</p>
            ) : null}
          </div>
          {currentChange ? (
            <div className="thread-workbench-preview diff">
              <div>
                <code title={currentChange}>
                  {compactRailLabel(currentChange)}
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
                <pre>{bounded(asString(patch.data?.patch?.patch), 5_000)}</pre>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TerminalPanel({ controller }: { controller: WorkbenchController }) {
  const {
    terminal,
    commandEntries,
    currentCommand,
    setSelectedCommand,
    insert,
  } = controller;
  const selectedCommandOutput = currentCommand
    ? commandOutput(currentCommand)
    : "";
  return (
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
            <p className="thread-workbench-empty">No terminal history yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PlansPanel({ controller }: { controller: WorkbenchController }) {
  const { plans, planEntries } = controller;
  return (
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
                <p>{asString(plan.objective, "No objective recorded.")}</p>
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
  );
}

function BriefPanel({
  controller,
  onOpenFullView,
}: {
  controller: WorkbenchController;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
}) {
  const {
    plans,
    delegationTasks,
    codegen,
    approvals,
    terminal,
    briefPlanSummary,
    model,
    repositorySummary,
    delegatedTaskEntries,
    approvalEntries,
    activeRunCount,
    failedRunCount,
    runEntries,
    commandEntries,
    insert,
  } = controller;
  return (
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
                <strong>{branchHeadLabel(model.branch, model.head)}</strong>
              </div>
              <div>
                <span>Repository</span>
                <strong>
                  {asString(repositorySummary?.root, model.workspacePath)}
                </strong>
              </div>
              <div>
                <span>Dirty files</span>
                <strong>{asNumber(repositorySummary?.changedFiles, 0)}</strong>
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
                      tone={statusTone(briefPlanSummary.activePlan.status)}
                    >
                      {briefPlanSummary.activePlan.status}
                    </Badge>
                  </div>
                  <div>
                    <span>Next step</span>
                    <strong>{briefPlanSummary.activePlan.nextStep}</strong>
                  </div>
                  <div>
                    <span>Total steps</span>
                    <strong>{briefPlanSummary.activePlan.stepCount}</strong>
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
                          briefPlanSummary.activePlan?.status ?? "unavailable",
                        nextStep:
                          briefPlanSummary.activePlan?.nextStep ??
                          "unavailable",
                        title:
                          briefPlanSummary.activePlan?.title ?? "unavailable",
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
                      <span>{compactRailLabel(command)}</span>
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
                      <small>{asString(entry.startedAt, "No timestamp")}</small>
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
  );
}

function SettingsPanel({
  controller,
  onOpenFullView,
}: {
  controller: WorkbenchController;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
}) {
  const { settings, model, repositorySummary, settingEntries } = controller;
  return (
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
                <span>{asNumber(repositorySummary?.changedFiles, 0)}</span>
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
  );
}

function PreviewPanel({ controller }: { controller: WorkbenchController }) {
  const { preview } = controller;
  const previewRecord = asRecord(preview.data?.browser);
  const previewMode =
    asString(previewRecord.mode) ||
    asString(previewRecord.captureMode) ||
    "Available";
  return (
    <div className="thread-workbench-panel-body thread-workbench-panel-body--preview">
      <ResourceState
        error={preview.error}
        loading={preview.loading}
        retry={preview.reload}
      />
      {!preview.loading && !preview.error ? (
        <div className="thread-workbench-preview-status">
          <div className="thread-workbench-preview-orbit" aria-hidden="true">
            <i />
            <span className="thread-workbench-orbit-mark">◎</span>
          </div>
          <Badge tone="good">{previewMode}</Badge>
          <strong>Local preview tools are connected</strong>
          <p className="thread-workbench-preview-copy">
            Inspect, capture, compare, and analyze your running app without
            leaving the thread.
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
  );
}

export function WorkbenchPanels({
  controller,
  workspacePath,
  onOpenFullView,
}: WorkbenchPanelsProps) {
  const { model } = controller;
  const panelId = `thread-workbench-${model.selectedTab}-panel`;
  const tabId = `thread-workbench-${model.selectedTab}-tab`;
  const previewRecord = asRecord(controller.preview.data?.browser);
  const previewMode =
    asString(previewRecord.mode) ||
    asString(previewRecord.captureMode) ||
    "Available";
  const selectedFullView = FULL_VIEW[model.selectedTab];

  return (
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
              ? `${controller.fileEntries.length} entries`
              : model.selectedTab === "changes"
                ? `${controller.changeEntries.length} changed`
                : model.selectedTab === "terminal"
                  ? `${controller.commandEntries.length} commands`
                  : model.selectedTab === "plans"
                    ? `${controller.planEntries.length} plans`
                    : model.selectedTab === "brief"
                      ? `${controller.approvalEntries.length} pending approvals · ${controller.delegatedTaskEntries.length} recent tasks`
                      : model.selectedTab === "settings"
                        ? `${controller.settingEntries.length} values`
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
        <FilesPanel controller={controller} workspacePath={workspacePath} />
      ) : null}
      {model.selectedTab === "changes" ? (
        <ChangesPanel controller={controller} />
      ) : null}
      {model.selectedTab === "terminal" ? (
        <TerminalPanel controller={controller} />
      ) : null}
      {model.selectedTab === "plans" ? (
        <PlansPanel controller={controller} />
      ) : null}
      {model.selectedTab === "brief" ? (
        <BriefPanel controller={controller} onOpenFullView={onOpenFullView} />
      ) : null}
      {model.selectedTab === "settings" ? (
        <SettingsPanel
          controller={controller}
          onOpenFullView={onOpenFullView}
        />
      ) : null}
      {model.selectedTab === "preview" ? (
        <PreviewPanel controller={controller} />
      ) : null}
    </section>
  );
}
