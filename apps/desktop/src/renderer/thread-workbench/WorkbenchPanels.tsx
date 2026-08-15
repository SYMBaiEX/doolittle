import type { ReactNode } from "react";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
} from "../lib";
import { commandOutput, contextBlock } from "../thread-workbench-controller";
import { ChangesPanel, TerminalPanel } from "./ChangesAndTerminalPanels";
import { FilesPanel } from "./FilesPanel";
import {
  WORKBENCH_BRIEF_CLASS,
  WORKBENCH_BRIEF_EMPTY_CLASS,
  WORKBENCH_BRIEF_LIST_CLASS,
  WORKBENCH_BRIEF_STACK_CLASS,
  WORKBENCH_BRIEF_STAT_CLASS,
  WORKBENCH_EMPTY_CLASS,
  WORKBENCH_LIST_BUTTON_CLASS,
  WORKBENCH_LIST_CLASS,
  WORKBENCH_ORBIT_MARK_CLASS,
  WORKBENCH_PANEL_CLASS,
  WORKBENCH_PANEL_HEADING_CLASS,
  WORKBENCH_PANEL_TITLE_CLASS,
  WORKBENCH_PLAN_CARD_CLASS,
  WORKBENCH_PLAN_LIST_CLASS,
  WORKBENCH_PREVIEW_COPY_CLASS,
  WORKBENCH_PREVIEW_ORBIT_CLASS,
  WORKBENCH_PREVIEW_STATUS_CLASS,
  WORKBENCH_QUICK_NAV_CLASS,
  WORKBENCH_SCROLL_BODY_CLASS,
  WORKBENCH_SETTINGS_CLASS,
  WORKBENCH_SETTINGS_GRID_CLASS,
  WORKBENCH_SETTINGS_ITEM_CLASS,
  WORKBENCH_SETTINGS_NAV_CLASS,
  WORKBENCH_TEXT_BUTTON_CLASS,
} from "./layout";
import {
  branchHeadLabel,
  compactRailLabel,
  FULL_VIEW,
  QUICK_NAVIGATION,
  statusTone,
  TAB_LABELS,
  type ThreadWorkbenchFullView,
  type WorkbenchController,
  workbenchPanelMeta,
} from "./models";
import { ResourceState } from "./ResourceState";

export interface WorkbenchPanelsProps {
  controller: WorkbenchController;
  workspacePath: string;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
}

type PlansPanelController = Pick<WorkbenchController, "plans" | "planEntries">;

type BriefPanelController = Pick<
  WorkbenchController,
  | "plans"
  | "delegationTasks"
  | "codegen"
  | "approvals"
  | "terminal"
  | "briefPlanSummary"
  | "delegatedTaskEntries"
  | "approvalEntries"
  | "activeRunCount"
  | "failedRunCount"
  | "runEntries"
  | "commandEntries"
  | "insert"
>;

type SettingsPanelController = Pick<
  WorkbenchController,
  "settings" | "model" | "repositorySummary" | "settingEntries"
>;

type PreviewPanelController = Pick<WorkbenchController, "preview">;

function BriefEmpty({ children }: { children: ReactNode }) {
  return (
    <p className={WORKBENCH_BRIEF_EMPTY_CLASS} data-thread-workbench="empty">
      {children}
    </p>
  );
}

function PlansPanel({ controller }: { controller: PlansPanelController }) {
  const { plans, planEntries } = controller;
  return (
    <div
      className={WORKBENCH_SCROLL_BODY_CLASS}
      data-thread-workbench-panel="plans"
    >
      <ResourceState
        error={plans.error}
        loading={plans.loading}
        retry={plans.reload}
      />
      {!plans.loading && !plans.error ? (
        <div className={WORKBENCH_PLAN_LIST_CLASS}>
          {planEntries.map((plan, index) => {
            const id = asString(plan.id, `plan-${index}`);
            const status = asString(plan.status, "draft");
            const steps = asArray(plan.steps)
              .map((step) => asString(step))
              .filter(Boolean);
            return (
              <article className={WORKBENCH_PLAN_CARD_CLASS} key={id}>
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
            <p className={WORKBENCH_EMPTY_CLASS}>
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
  controller: BriefPanelController;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
}) {
  const {
    plans,
    delegationTasks,
    codegen,
    approvals,
    terminal,
    briefPlanSummary,
    delegatedTaskEntries,
    approvalEntries,
    activeRunCount,
    failedRunCount,
    runEntries,
    commandEntries,
    insert,
  } = controller;
  return (
    <div
      className={WORKBENCH_SCROLL_BODY_CLASS}
      data-thread-workbench-panel="brief"
    >
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
        <div className={WORKBENCH_BRIEF_CLASS}>
          <section className={WORKBENCH_BRIEF_STACK_CLASS}>
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
                <BriefEmpty>
                  No active plan.{" "}
                  {briefPlanSummary.draftCount > 0
                    ? `There are ${briefPlanSummary.draftCount} draft(s).`
                    : ""}
                </BriefEmpty>
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

          <section className={WORKBENCH_BRIEF_LIST_CLASS}>
            <h3>Task and approval pressure</h3>
            {delegatedTaskEntries.length ? (
              <div className={WORKBENCH_LIST_CLASS}>
                {delegatedTaskEntries.slice(0, 6).map((entry, index) => {
                  const id = asString(entry.id, `task-${index}`);
                  const title = asString(
                    entry.title,
                    asString(entry.objective, "Untitled task"),
                  );
                  const status = asString(entry.status, "pending");
                  return (
                    <button
                      className={WORKBENCH_LIST_BUTTON_CLASS}
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
              <BriefEmpty>No queued delegation tasks.</BriefEmpty>
            )}
            {approvalEntries.length ? (
              <div className={WORKBENCH_LIST_CLASS}>
                {approvalEntries.slice(0, 6).map((approval, index) => {
                  const id = asString(approval.id, `approval-${index}`);
                  const command = asString(
                    approval.command,
                    "Pending execution approval",
                  );
                  return (
                    <button
                      className={WORKBENCH_LIST_BUTTON_CLASS}
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
            ) : delegatedTaskEntries.length ? (
              <BriefEmpty>No pending execution approvals.</BriefEmpty>
            ) : null}
          </section>

          <section className={WORKBENCH_BRIEF_LIST_CLASS}>
            <h3>Automation + terminal pressure</h3>
            <div className={WORKBENCH_LIST_CLASS}>
              <article className={WORKBENCH_BRIEF_STAT_CLASS}>
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
                      className={WORKBENCH_LIST_BUTTON_CLASS}
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
                <BriefEmpty>No terminal history yet.</BriefEmpty>
              )}
            </div>
          </section>

          <section className={WORKBENCH_BRIEF_LIST_CLASS}>
            <h3>Quick navigation</h3>
            <div className={WORKBENCH_QUICK_NAV_CLASS}>
              {QUICK_NAVIGATION.map((item) => (
                <button
                  key={item.label}
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
  controller: SettingsPanelController;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
}) {
  const { settings, model, repositorySummary, settingEntries } = controller;
  return (
    <div
      className={WORKBENCH_SCROLL_BODY_CLASS}
      data-thread-workbench-panel="settings"
    >
      <ResourceState
        error={settings.error}
        loading={settings.loading}
        retry={settings.reload}
      />
      {!settings.loading && !settings.error ? (
        <div className={WORKBENCH_SETTINGS_CLASS}>
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
            <div className={WORKBENCH_SETTINGS_GRID_CLASS}>
              {settingEntries.length ? (
                settingEntries.map((setting) => (
                  <article
                    key={setting.key}
                    className={WORKBENCH_SETTINGS_ITEM_CLASS}
                  >
                    <small>{setting.key}</small>
                    <strong>{setting.value}</strong>
                  </article>
                ))
              ) : (
                <p className={WORKBENCH_EMPTY_CLASS}>
                  No settings values returned from runtime.
                </p>
              )}
            </div>
          </section>
          <details
            className={WORKBENCH_SETTINGS_NAV_CLASS}
            data-thread-workbench="settings-navigation"
          >
            <summary>Open a full page</summary>
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
          </details>
        </div>
      ) : null}
    </div>
  );
}

function PreviewPanel({ controller }: { controller: PreviewPanelController }) {
  const { preview } = controller;
  const previewRecord = asRecord(preview.data?.browser);
  const previewMode =
    asString(previewRecord.mode) ||
    asString(previewRecord.captureMode) ||
    "Available";
  return (
    <div
      className={WORKBENCH_SCROLL_BODY_CLASS}
      data-thread-workbench-panel="preview"
    >
      <ResourceState
        error={preview.error}
        loading={preview.loading}
        retry={preview.reload}
      />
      {!preview.loading && !preview.error ? (
        <div className={WORKBENCH_PREVIEW_STATUS_CLASS}>
          <div className={WORKBENCH_PREVIEW_ORBIT_CLASS} aria-hidden="true">
            <i />
            <span className={WORKBENCH_ORBIT_MARK_CLASS}>◎</span>
          </div>
          <Badge tone="good">{previewMode}</Badge>
          <strong>Local preview tools are connected</strong>
          <p className={WORKBENCH_PREVIEW_COPY_CLASS}>
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
  const panelMeta = workbenchPanelMeta(model.selectedTab, {
    approvals: controller.approvalEntries.length,
    changes: controller.changeEntries.length,
    commands: controller.commandEntries.length,
    files: controller.fileEntries.length,
    plans: controller.planEntries.length,
    preview: previewMode,
    settings: controller.settingEntries.length,
    tasks: controller.delegatedTaskEntries.length,
  });

  return (
    <section
      aria-labelledby={tabId}
      className={WORKBENCH_PANEL_CLASS}
      data-thread-workbench="panel"
      id={panelId}
      role="tabpanel"
    >
      <div className={WORKBENCH_PANEL_HEADING_CLASS}>
        <div>
          <span className={WORKBENCH_PANEL_TITLE_CLASS}>
            {TAB_LABELS[model.selectedTab]}
          </span>
          <small>{panelMeta}</small>
        </div>
        {selectedFullView ? (
          <button
            className={WORKBENCH_TEXT_BUTTON_CLASS}
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
