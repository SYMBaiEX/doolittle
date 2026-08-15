import type { FormEvent } from "react";
import { ArtifactViewer } from "../components/ArtifactViewer";
import {
  type ApiResource,
  asArray,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Notice,
  type UnknownRecord,
} from "../lib";
import {
  orchestrationStatusTier,
  orchestrationTimingLabel,
  taskCapabilityLabel,
} from "../orchestration-helpers";
import type {
  CodegenRunRecord,
  CodegenWorkflowRecord,
  WorkflowBundleResponse,
} from "../orchestration-resources";
import {
  DetailRow,
  DetailTag,
  SmallEmpty,
  statusTone,
} from "./detail-primitives";
import { orchestrationClass as oc } from "./layout";
import type { CodegenMode } from "./orchestration-runs-model";
import { runArtifacts } from "./orchestration-runs-model";
import { OrchestrationLauncher } from "./runs-panel/OrchestrationLauncher";

type CodegenRuntimeResponse = {
  execution?: {
    codeGeneration?: {
      available?: boolean;
      ready?: boolean;
      detail?: string;
      methods?: string[];
      source?: string;
    };
  };
};
type CodegenWorkflowsResponse = { summary?: UnknownRecord };
type WorkflowDetailResponse = {
  workflow?: CodegenWorkflowRecord;
  tree?: unknown[];
};
type RunDetailResponse = { run?: CodegenRunRecord };

export type OrchestrationRunsPanelProps = {
  active: boolean;
  workspaceLabel?: string;
  workspacePath?: string;
  codegenRuntimeResource: ApiResource<CodegenRuntimeResponse>;
  codegenWorkflowsResource: ApiResource<CodegenWorkflowsResponse>;
  workflowDetailResource: ApiResource<WorkflowDetailResponse>;
  runDetailResource: ApiResource<RunDetailResponse>;
  codegenExecution: UnknownRecord;
  codegenAvailable: boolean;
  codegenReady: boolean;
  workflowSummary: UnknownRecord;
  codegenMode: CodegenMode;
  codegenProjectName: string;
  codegenPrompt: string;
  codegenProjectPath: string;
  codegenTargetType: string;
  busyKeys: Readonly<Record<string, boolean>>;
  workflows: readonly CodegenWorkflowRecord[];
  visibleRuns: readonly CodegenRunRecord[];
  selectedWorkflow?: CodegenWorkflowRecord;
  selectedRun?: CodegenRunRecord;
  bundleWorkflowId: string;
  bundleResult: WorkflowBundleResponse | null;
  bundleError: string;
  bundleLoading: boolean;
  onCodegenModeChange: (mode: CodegenMode) => void;
  onCodegenProjectNameChange: (value: string) => void;
  onCodegenPromptChange: (value: string) => void;
  onCodegenProjectPathChange: (value: string) => void;
  onCodegenTargetTypeChange: (value: string) => void;
  onSubmitCodegen: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onSelectWorkflow: (workflowId: string) => void;
  onSelectRun: (runId: string) => void;
  onRequestRunCancellation: (runId: string) => void;
  onDismissRunCancellation: () => void;
  confirmedRunCancellation: string;
  onLoadBundle: () => void | Promise<void>;
  onCancelRun: (run: CodegenRunRecord) => void | Promise<void>;
};

export function OrchestrationRunsPanel({
  active,
  workspaceLabel,
  workspacePath,
  codegenRuntimeResource,
  codegenWorkflowsResource,
  workflowDetailResource,
  runDetailResource,
  codegenExecution,
  codegenAvailable,
  codegenReady,
  workflowSummary,
  codegenMode,
  codegenProjectName,
  codegenPrompt,
  codegenProjectPath,
  codegenTargetType,
  busyKeys,
  workflows,
  visibleRuns,
  selectedWorkflow,
  selectedRun,
  bundleWorkflowId,
  bundleResult,
  bundleError,
  bundleLoading,
  onCodegenModeChange,
  onCodegenProjectNameChange,
  onCodegenPromptChange,
  onCodegenProjectPathChange,
  onCodegenTargetTypeChange,
  onSubmitCodegen,
  onSelectWorkflow,
  onSelectRun,
  onRequestRunCancellation,
  onDismissRunCancellation,
  confirmedRunCancellation,
  onLoadBundle,
  onCancelRun,
}: OrchestrationRunsPanelProps) {
  return (
    <div className={oc("orchestration-runs-layout")}>
      <OrchestrationLauncher
        active={active}
        workspaceLabel={workspaceLabel}
        workspacePath={workspacePath}
        codegenRuntimeResource={codegenRuntimeResource}
        codegenExecution={codegenExecution}
        codegenAvailable={codegenAvailable}
        codegenReady={codegenReady}
        workflowSummary={workflowSummary}
        codegenMode={codegenMode}
        codegenProjectName={codegenProjectName}
        codegenPrompt={codegenPrompt}
        codegenProjectPath={codegenProjectPath}
        codegenTargetType={codegenTargetType}
        busyKeys={busyKeys}
        onCodegenModeChange={onCodegenModeChange}
        onCodegenProjectNameChange={onCodegenProjectNameChange}
        onCodegenPromptChange={onCodegenPromptChange}
        onCodegenProjectPathChange={onCodegenProjectPathChange}
        onCodegenTargetTypeChange={onCodegenTargetTypeChange}
        onSubmitCodegen={onSubmitCodegen}
      />

      <aside className={oc("orchestration-run-browser")}>
        <div className={oc("orchestration-pane-heading")}>
          <span>Workflows</span>
          <small>{workflows.length}</small>
        </div>
        <div className={oc("orchestration-workflow-list")}>
          {codegenWorkflowsResource.error ? (
            <ErrorBlock
              error={codegenWorkflowsResource.error}
              retry={codegenWorkflowsResource.reload}
            />
          ) : codegenWorkflowsResource.loading ? (
            <LoadingBlock />
          ) : workflows.length === 0 ? (
            <SmallEmpty>No workflows recorded.</SmallEmpty>
          ) : (
            workflows.map((workflow) => {
              const status = asString(workflow.status, "pending");
              const tier = orchestrationStatusTier(status);
              return (
                <button
                  key={workflow.id}
                  type="button"
                  className={oc(
                    selectedWorkflow?.id === workflow.id && "selected",
                    `tier-${tier}`,
                  )}
                  aria-pressed={selectedWorkflow?.id === workflow.id}
                  onClick={() => onSelectWorkflow(workflow.id)}
                >
                  <span className={oc("master-row", "master-row-top")}>
                    <span className={oc("master-title-line")}>
                      <i
                        className={oc("master-status-dot")}
                        aria-hidden="true"
                      />
                      <strong>{asString(workflow.title, workflow.id)}</strong>
                    </span>
                    <Badge tone={statusTone(status)}>{status}</Badge>
                  </span>
                  <small>
                    {orchestrationTimingLabel({
                      status,
                      completedAt: asString(workflow.completedAt),
                      updatedAt: asString(workflow.updatedAt),
                      createdAt: asString(workflow.createdAt),
                    })}
                  </small>
                </button>
              );
            })
          )}
        </div>
        <div className={oc("orchestration-pane-heading", "runs-heading")}>
          <span>Runs</span>
          <small>{visibleRuns.length}</small>
        </div>
        <div
          className={oc(
            "orchestration-workflow-list",
            "orchestration-run-list",
          )}
        >
          {workflowDetailResource.error ? (
            <ErrorBlock
              error={workflowDetailResource.error}
              retry={workflowDetailResource.reload}
            />
          ) : workflowDetailResource.loading ? (
            <LoadingBlock />
          ) : visibleRuns.length === 0 ? (
            <SmallEmpty>No runs in this workflow.</SmallEmpty>
          ) : (
            visibleRuns.map((run) => {
              const status = asString(run.status, "pending");
              const tier = orchestrationStatusTier(status);
              return (
                <button
                  key={run.id}
                  type="button"
                  className={oc(
                    selectedRun?.id === run.id && "selected",
                    `tier-${tier}`,
                  )}
                  aria-pressed={selectedRun?.id === run.id}
                  onClick={() => onSelectRun(run.id)}
                >
                  <span className={oc("master-row", "master-row-top")}>
                    <span className={oc("master-title-line")}>
                      <i
                        className={oc("master-status-dot")}
                        aria-hidden="true"
                      />
                      <strong>{asString(run.phase, run.kind)}</strong>
                    </span>
                    <Badge tone={statusTone(status)}>{status}</Badge>
                  </span>
                  <small>
                    {orchestrationTimingLabel({
                      status,
                      completedAt: asString(run.completedAt),
                      updatedAt: asString(run.updatedAt),
                      createdAt: asString(run.createdAt),
                    })}
                  </small>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <article
        className={oc("orchestration-detail", "orchestration-run-detail")}
      >
        {!selectedWorkflow ? (
          <EmptyBlock title="Choose a workflow">
            Workflow and run evidence appear here.
          </EmptyBlock>
        ) : (
          <>
            <div className={oc("orchestration-detail-header")}>
              <div>
                <span className={oc("detail-kicker")}>
                  {asString(selectedWorkflow.kind, "generate")} workflow
                </span>
                <h2>
                  {asString(
                    workflowDetailResource.data?.workflow?.title,
                    asString(selectedWorkflow.title, selectedWorkflow.id),
                  )}
                </h2>
                <p>
                  {asString(
                    workflowDetailResource.data?.workflow?.objective,
                    asString(
                      selectedWorkflow.objective,
                      "No objective recorded.",
                    ),
                  )}
                </p>
              </div>
              <Badge
                tone={statusTone(asString(selectedWorkflow.status, "pending"))}
              >
                {asString(selectedWorkflow.status, "pending")}
              </Badge>
            </div>
            <div className={oc("orchestration-detail-tags")}>
              <DetailTag
                tone={statusTone(asString(selectedWorkflow.status, "pending"))}
              >
                {orchestrationTimingLabel({
                  status: asString(selectedWorkflow.status, "pending"),
                  completedAt: asString(selectedWorkflow.completedAt),
                  updatedAt: asString(selectedWorkflow.updatedAt),
                  createdAt: asString(selectedWorkflow.createdAt),
                })}
              </DetailTag>
              <DetailTag>
                {asString(selectedWorkflow.kind, "generate")}
              </DetailTag>
              <DetailTag>{visibleRuns.length} runs visible</DetailTag>
              <DetailTag>
                {asArray(workflowDetailResource.data?.tree).length} root phases
              </DetailTag>
            </div>
            <div className={oc("orchestration-run-toolbar")}>
              <span>
                {asArray(workflowDetailResource.data?.tree).length} root phases
                · {visibleRuns.length} runs
              </span>
              <div className={oc("orchestration-run-actions")}>
                {selectedRun &&
                ["pending", "running"].includes(
                  asString(selectedRun.status),
                ) ? (
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => onRequestRunCancellation(selectedRun.id)}
                    disabled={
                      !active || busyKeys[`codegen:${selectedRun.id}:cancel`]
                    }
                  >
                    Cancel run
                  </button>
                ) : null}
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void onLoadBundle()}
                  disabled={
                    !active ||
                    (bundleLoading && bundleWorkflowId === selectedWorkflow.id)
                  }
                >
                  {bundleLoading && bundleWorkflowId === selectedWorkflow.id
                    ? "Bundling…"
                    : "Bundle workflow"}
                </button>
              </div>
            </div>

            {selectedRun && confirmedRunCancellation === selectedRun.id ? (
              <div
                className={oc(
                  "orchestration-confirm",
                  "orchestration-run-confirm",
                )}
                aria-live="polite"
              >
                <div>
                  <strong id="run-cancel-title">Cancel this run?</strong>
                  <span id="run-cancel-description">
                    This records a cancelled lifecycle state. The current
                    pipeline cannot guarantee that in-flight model work stops
                    immediately.
                  </span>
                </div>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void onCancelRun(selectedRun)}
                  disabled={
                    !active || busyKeys[`codegen:${selectedRun.id}:cancel`]
                  }
                >
                  {busyKeys[`codegen:${selectedRun.id}:cancel`]
                    ? "Cancelling…"
                    : "Confirm cancellation"}
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onDismissRunCancellation()}
                >
                  Keep running
                </button>
              </div>
            ) : null}

            {bundleError && bundleWorkflowId === selectedWorkflow.id ? (
              <ErrorBlock
                error={bundleError}
                retry={() => void onLoadBundle()}
              />
            ) : null}
            {bundleResult && bundleWorkflowId === selectedWorkflow.id ? (
              <div className={oc("orchestration-bundle-receipt")}>
                <strong>Bundle ready</strong>
                <code>
                  {asString(bundleResult.manifestPath) ||
                    asString(
                      asRecord(bundleResult.manifest).name,
                      "Manifest receipt ready",
                    )}
                </code>
                <span>
                  {asArray(bundleResult.runs).length} run records included
                </span>
              </div>
            ) : null}

            {!selectedRun ? (
              <SmallEmpty>Select a run to inspect its evidence.</SmallEmpty>
            ) : runDetailResource.error ? (
              <ErrorBlock
                error={runDetailResource.error}
                retry={runDetailResource.reload}
              />
            ) : runDetailResource.loading ? (
              <LoadingBlock />
            ) : (
              <div className={oc("orchestration-run-inspector")}>
                <div className={oc("orchestration-subheading")}>
                  <div>
                    <span className={oc("detail-kicker")}>Selected run</span>
                    <h3>
                      {asString(
                        selectedRun.phase,
                        asString(selectedRun.kind, selectedRun.id),
                      )}
                    </h3>
                  </div>
                  <Badge
                    tone={statusTone(asString(selectedRun.status, "pending"))}
                  >
                    {asString(selectedRun.status, "pending")}
                  </Badge>
                </div>
                <div className={oc("orchestration-detail-tags")}>
                  <DetailTag
                    tone={statusTone(asString(selectedRun.status, "pending"))}
                  >
                    {orchestrationTimingLabel({
                      status: asString(selectedRun.status, "pending"),
                      completedAt: asString(selectedRun.completedAt),
                      updatedAt: asString(selectedRun.updatedAt),
                      createdAt: asString(selectedRun.createdAt),
                    })}
                  </DetailTag>
                  <DetailTag>{asString(selectedRun.kind, "run")}</DetailTag>
                  <DetailTag>
                    {selectedRun.taskId ? "task linked" : "task unlinked"}
                  </DetailTag>
                  <DetailTag>
                    {selectedRun.sessionId
                      ? "session linked"
                      : "session unlinked"}
                  </DetailTag>
                  <DetailTag>
                    {selectedRun.accountLabel || selectedRun.accountId
                      ? `account ${selectedRun.accountLabel || selectedRun.accountId}`
                      : "account not recorded"}
                  </DetailTag>
                </div>
                <dl className={oc("orchestration-run-facts")}>
                  <DetailRow label="Run ID" value={selectedRun.id} />
                  <DetailRow
                    label="Task"
                    value={asString(selectedRun.taskId, "not linked")}
                  />
                  <DetailRow
                    label="Session"
                    value={asString(selectedRun.sessionId, "not linked")}
                  />
                  <DetailRow
                    label="Capability"
                    value={taskCapabilityLabel(
                      selectedRun.capabilityProfile,
                      selectedRun.kind,
                    )}
                  />
                  <DetailRow
                    label="Framework"
                    value={asString(selectedRun.framework, "not recorded")}
                  />
                  <DetailRow
                    label="Account provider"
                    value={asString(
                      selectedRun.accountProviderId,
                      "not recorded",
                    )}
                  />
                  <DetailRow
                    label="Account"
                    value={asString(
                      selectedRun.accountLabel,
                      asString(selectedRun.accountId, "not recorded"),
                    )}
                  />
                  <DetailRow
                    label="Updated"
                    value={displayTimestamp(asString(selectedRun.updatedAt))}
                  />
                </dl>
                {selectedRun.error ? (
                  <Notice tone="bad">
                    <strong>Run error</strong>
                    <span>{selectedRun.error}</span>
                  </Notice>
                ) : null}
                <div className={oc("orchestration-output-grid")}>
                  <section>
                    <span className={oc("detail-kicker")}>Output preview</span>
                    <pre>
                      {asString(
                        selectedRun.outputPreview,
                        "No output preview recorded.",
                      )}
                    </pre>
                  </section>
                  <section>
                    <span className={oc("detail-kicker")}>Request</span>
                    <pre>
                      {JSON.stringify(asRecord(selectedRun.input), null, 2)}
                    </pre>
                  </section>
                </div>
                <div className={oc("orchestration-artifacts")}>
                  <span className={oc("detail-kicker")}>Artifacts</span>
                  {runArtifacts(selectedRun).length > 0 ? (
                    <ArtifactViewer
                      artifacts={runArtifacts(selectedRun)}
                      runId={selectedRun.id}
                    />
                  ) : (
                    <SmallEmpty>No artifacts recorded.</SmallEmpty>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </article>
    </div>
  );
}
