import type { FormEvent } from "react";
import { ArtifactViewer } from "../components/ArtifactViewer";
import {
  type ApiResource,
  asArray,
  asNumber,
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
import { compactWorkspacePath } from "../workspace-path";
import {
  DetailRow,
  DetailTag,
  SmallEmpty,
  statusTone,
} from "./detail-primitives";
import type { CodegenMode } from "./orchestration-runs-model";
import { CODEGEN_MODES, runArtifacts } from "./orchestration-runs-model";

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
    <div className="orchestration-runs-layout">
      <aside className="orchestration-launcher">
        {codegenRuntimeResource.error ? (
          <ErrorBlock
            error={codegenRuntimeResource.error}
            retry={codegenRuntimeResource.reload}
          />
        ) : null}
        <div className="orchestration-pane-heading">
          <span>New workflow</span>
          <Badge
            tone={codegenReady ? "good" : codegenAvailable ? "warn" : "bad"}
          >
            {codegenReady
              ? "ready"
              : codegenAvailable
                ? "setup needed"
                : "offline"}
          </Badge>
        </div>
        <fieldset className="orchestration-mode-grid">
          <legend>Code generation mode</legend>
          {CODEGEN_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              aria-pressed={codegenMode === mode.id}
              className={codegenMode === mode.id ? "selected" : ""}
              onClick={() => onCodegenModeChange(mode.id)}
            >
              <strong>{mode.label}</strong>
              <span>{mode.detail}</span>
            </button>
          ))}
        </fieldset>
        <form className="orchestration-codegen-form" onSubmit={onSubmitCodegen}>
          {codegenMode === "qa" ? (
            <label>
              <span>Project path</span>
              <input
                value={codegenProjectPath}
                onChange={(event) =>
                  onCodegenProjectPathChange(event.target.value)
                }
                placeholder="/workspace/project"
              />
            </label>
          ) : (
            <>
              <label>
                <span>Project name</span>
                <input
                  value={codegenProjectName}
                  onChange={(event) =>
                    onCodegenProjectNameChange(event.target.value)
                  }
                  placeholder={workspaceLabel || "doolittle"}
                />
              </label>
              {codegenMode !== "generate" ? (
                <label>
                  <span>Target</span>
                  <input
                    value={codegenTargetType}
                    onChange={(event) =>
                      onCodegenTargetTypeChange(event.target.value)
                    }
                    placeholder="plugin"
                  />
                </label>
              ) : null}
              <label>
                <span>
                  {codegenMode === "generate" ? "Build request" : "Description"}
                </span>
                <textarea
                  rows={6}
                  value={codegenPrompt}
                  onChange={(event) =>
                    onCodegenPromptChange(event.target.value)
                  }
                  placeholder="Describe the intended result, constraints, and evidence."
                />
              </label>
            </>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={
              !active || !codegenReady || busyKeys[`codegen:${codegenMode}`]
            }
          >
            {busyKeys[`codegen:${codegenMode}`]
              ? "Running…"
              : `Run ${
                  CODEGEN_MODES.find((mode) => mode.id === codegenMode)?.label
                }`}
          </button>
        </form>
        <p className="orchestration-runtime-version">
          {asString(codegenExecution.source, "product")} engine ·{" "}
          {asArray(codegenExecution.methods).length} methods ·{" "}
          {asNumber(workflowSummary.total)} workflows
        </p>
        {!codegenReady && asString(codegenExecution.detail) ? (
          <p className="orchestration-runtime-detail">
            {asString(codegenExecution.detail)}
          </p>
        ) : null}
        <p className="orchestration-task-routing-note">
          {workspacePath
            ? `Project defaults come from ${compactWorkspacePath(workspacePath)}. QA uses this path directly; other workflows retain the selected project name in their receipt.`
            : "Choose a workspace to prefill project context for build and research receipts."}
        </p>
      </aside>

      <aside className="orchestration-run-browser">
        <div className="orchestration-pane-heading">
          <span>Workflows</span>
          <small>{workflows.length}</small>
        </div>
        <div className="orchestration-workflow-list">
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
                  className={
                    selectedWorkflow?.id === workflow.id
                      ? `selected tier-${tier}`
                      : `tier-${tier}`
                  }
                  aria-pressed={selectedWorkflow?.id === workflow.id}
                  onClick={() => onSelectWorkflow(workflow.id)}
                >
                  <span className="master-row master-row-top">
                    <span className="master-title-line">
                      <i className="master-status-dot" aria-hidden="true" />
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
        <div className="orchestration-pane-heading runs-heading">
          <span>Runs</span>
          <small>{visibleRuns.length}</small>
        </div>
        <div className="orchestration-workflow-list orchestration-run-list">
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
                  className={
                    selectedRun?.id === run.id
                      ? `selected tier-${tier}`
                      : `tier-${tier}`
                  }
                  aria-pressed={selectedRun?.id === run.id}
                  onClick={() => onSelectRun(run.id)}
                >
                  <span className="master-row master-row-top">
                    <span className="master-title-line">
                      <i className="master-status-dot" aria-hidden="true" />
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

      <article className="orchestration-detail orchestration-run-detail">
        {!selectedWorkflow ? (
          <EmptyBlock title="Choose a workflow">
            Workflow and run evidence appear here.
          </EmptyBlock>
        ) : (
          <>
            <div className="orchestration-detail-header">
              <div>
                <span className="detail-kicker">
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
            <div className="orchestration-detail-tags">
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
            <div className="orchestration-run-toolbar">
              <span>
                {asArray(workflowDetailResource.data?.tree).length} root phases
                · {visibleRuns.length} runs
              </span>
              <div className="orchestration-run-actions">
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
                className="orchestration-confirm orchestration-run-confirm"
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
              <div className="orchestration-bundle-receipt">
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
              <div className="orchestration-run-inspector">
                <div className="orchestration-subheading">
                  <div>
                    <span className="detail-kicker">Selected run</span>
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
                <div className="orchestration-detail-tags">
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
                <dl className="orchestration-run-facts">
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
                <div className="orchestration-output-grid">
                  <section>
                    <span className="detail-kicker">Output preview</span>
                    <pre>
                      {asString(
                        selectedRun.outputPreview,
                        "No output preview recorded.",
                      )}
                    </pre>
                  </section>
                  <section>
                    <span className="detail-kicker">Request</span>
                    <pre>
                      {JSON.stringify(asRecord(selectedRun.input), null, 2)}
                    </pre>
                  </section>
                </div>
                <div className="orchestration-artifacts">
                  <span className="detail-kicker">Artifacts</span>
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
