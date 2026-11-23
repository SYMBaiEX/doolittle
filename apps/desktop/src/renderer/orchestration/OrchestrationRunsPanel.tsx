import { ContextActionMenu } from "@doolittle/ui";
import { Workflow } from "lucide-react";
import type { FormEvent } from "react";
import { ArtifactViewer } from "../components/ArtifactViewer";
import { WorkbenchEmpty } from "../components/workbench/Workbench";
import { copyContextText } from "../context-menu-clipboard";
import {
  type ApiResource,
  asArray,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
  Notice,
  titleCase,
  type UnknownRecord,
} from "../lib";
import {
  orchestrationTimingLabel,
  taskCapabilityLabel,
} from "../orchestration-helpers";
import type {
  CodegenRunRecord,
  CodegenWorkflowRecord,
  WorkflowBundleResponse,
} from "../orchestration-resources";
import { statusTier, type WorkTier } from "../work-surface/status";
import {
  DetailFacts,
  DetailHeader,
  FactRow,
  WorkActions,
  WorkCard,
  WorkCards,
  WorkConfirm,
  WorkDisclosure,
  WorkList,
  WorkRow,
  WorkTag,
} from "../work-surface/WorkSurface";
import { orchestrationClass as oc } from "./layout";
import type { CodegenMode } from "./orchestration-runs-model";
import { runArtifacts } from "./orchestration-runs-model";
import { OrchestrationLauncher } from "./runs-panel/OrchestrationLauncher";
import "./runs-panel/runs-layout.css";

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

function tagTone(tier: WorkTier): "good" | "warn" | "bad" | "neutral" {
  if (tier === "done") return "good";
  if (tier === "attention") return "warn";
  if (tier === "failed") return "bad";
  return "neutral";
}

function runCancellable(run: CodegenRunRecord): boolean {
  return ["pending", "running"].includes(asString(run.status));
}

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
  const emptyHistory =
    !codegenWorkflowsResource.loading &&
    !codegenWorkflowsResource.error &&
    workflows.length === 0 &&
    visibleRuns.length === 0 &&
    !selectedWorkflow;

  return (
    <div className={oc("orchestration-runs-layout")} data-empty={emptyHistory}>
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

      <aside
        className={`ws-rail ${oc("orchestration-run-browser")}`}
        hidden={emptyHistory}
      >
        <div className="ws-rail__heading">
          <span>Workflows</span>
          <small>{workflows.length}</small>
        </div>
        {codegenWorkflowsResource.error ? (
          <ErrorBlock
            error={codegenWorkflowsResource.error}
            retry={codegenWorkflowsResource.reload}
          />
        ) : codegenWorkflowsResource.loading ? (
          <LoadingBlock />
        ) : workflows.length === 0 ? (
          <p className="ws-empty-line">No workflows recorded.</p>
        ) : (
          <ul className="ws-list ws-list--cap">
            {workflows.map((workflow) => {
              const status = asString(workflow.status, "pending");
              const title = asString(workflow.title, workflow.id);
              return (
                <ContextActionMenu
                  key={workflow.id}
                  label="Workflow actions"
                  scopeKey={`workflow:${workflow.id}`}
                  items={[
                    {
                      id: "inspect",
                      label: "Inspect workflow",
                      onSelect: () => onSelectWorkflow(workflow.id),
                    },
                    {
                      id: "copy-id",
                      label: "Copy workflow ID",
                      onSelect: () => void copyContextText(workflow.id),
                    },
                  ]}
                >
                  <WorkRow
                    label={title}
                    meta={[asString(workflow.kind, "generate")]}
                    onSelect={() => onSelectWorkflow(workflow.id)}
                    selected={selectedWorkflow?.id === workflow.id}
                    status={titleCase(status)}
                    time={orchestrationTimingLabel({
                      status,
                      completedAt: asString(workflow.completedAt),
                      updatedAt: asString(workflow.updatedAt),
                      createdAt: asString(workflow.createdAt),
                    })}
                    title={title}
                    tone={statusTier(status)}
                  />
                </ContextActionMenu>
              );
            })}
          </ul>
        )}
        <div className={`ws-rail__heading ${oc("runs-heading")}`}>
          <span>Runs</span>
          <small>{visibleRuns.length}</small>
        </div>
        {workflowDetailResource.error ? (
          <ErrorBlock
            error={workflowDetailResource.error}
            retry={workflowDetailResource.reload}
          />
        ) : workflowDetailResource.loading ? (
          <LoadingBlock />
        ) : visibleRuns.length === 0 ? (
          <p className="ws-empty-line">No runs in this workflow.</p>
        ) : (
          <WorkList>
            {visibleRuns.map((run) => {
              const status = asString(run.status, "pending");
              const title = asString(run.phase, run.kind);
              return (
                <ContextActionMenu
                  key={run.id}
                  label="Run actions"
                  scopeKey={`run:${run.id}:${status}`}
                  items={[
                    {
                      id: "inspect",
                      label: "Inspect run",
                      onSelect: () => onSelectRun(run.id),
                    },
                    {
                      id: "copy-id",
                      label: "Copy run ID",
                      onSelect: () => void copyContextText(run.id),
                    },
                    ...(runCancellable(run)
                      ? [
                          {
                            id: "cancel",
                            label: "Cancel run…",
                            destructive: true,
                            separatorBefore: true,
                            disabled:
                              !active || busyKeys[`codegen:${run.id}:cancel`],
                            onSelect: () => {
                              onSelectRun(run.id);
                              onRequestRunCancellation(run.id);
                            },
                          },
                        ]
                      : []),
                  ]}
                >
                  <WorkRow
                    label={title}
                    meta={[asString(run.kind, "run")]}
                    onSelect={() => onSelectRun(run.id)}
                    selected={selectedRun?.id === run.id}
                    status={titleCase(status)}
                    time={orchestrationTimingLabel({
                      status,
                      completedAt: asString(run.completedAt),
                      updatedAt: asString(run.updatedAt),
                      createdAt: asString(run.createdAt),
                    })}
                    title={title}
                    tone={statusTier(status)}
                  />
                </ContextActionMenu>
              );
            })}
          </WorkList>
        )}
      </aside>

      <article
        className={`ws-detail ${oc("orchestration-run-detail")}`}
        hidden={emptyHistory}
      >
        {!selectedWorkflow ? (
          <WorkbenchEmpty icon={Workflow} title="Choose a workflow">
            Workflow and run evidence appear here.
          </WorkbenchEmpty>
        ) : (
          <WorkflowDetail
            active={active}
            bundleError={bundleError}
            bundleLoading={bundleLoading}
            bundleResult={bundleResult}
            bundleWorkflowId={bundleWorkflowId}
            busyKeys={busyKeys}
            confirmedRunCancellation={confirmedRunCancellation}
            onCancelRun={onCancelRun}
            onDismissRunCancellation={onDismissRunCancellation}
            onLoadBundle={onLoadBundle}
            onRequestRunCancellation={onRequestRunCancellation}
            runCount={visibleRuns.length}
            runDetailResource={runDetailResource}
            selectedRun={selectedRun}
            selectedWorkflow={selectedWorkflow}
            workflowDetailResource={workflowDetailResource}
          />
        )}
      </article>
    </div>
  );
}

function WorkflowDetail({
  active,
  bundleError,
  bundleLoading,
  bundleResult,
  bundleWorkflowId,
  busyKeys,
  confirmedRunCancellation,
  onCancelRun,
  onDismissRunCancellation,
  onLoadBundle,
  onRequestRunCancellation,
  runCount,
  runDetailResource,
  selectedRun,
  selectedWorkflow,
  workflowDetailResource,
}: {
  active: boolean;
  bundleError: string;
  bundleLoading: boolean;
  bundleResult: WorkflowBundleResponse | null;
  bundleWorkflowId: string;
  busyKeys: Readonly<Record<string, boolean>>;
  confirmedRunCancellation: string;
  onCancelRun: (run: CodegenRunRecord) => void | Promise<void>;
  onDismissRunCancellation: () => void;
  onLoadBundle: () => void | Promise<void>;
  onRequestRunCancellation: (runId: string) => void;
  runCount: number;
  runDetailResource: ApiResource<RunDetailResponse>;
  selectedRun?: CodegenRunRecord;
  selectedWorkflow: CodegenWorkflowRecord;
  workflowDetailResource: ApiResource<WorkflowDetailResponse>;
}) {
  const status = asString(selectedWorkflow.status, "pending");
  const tier = statusTier(status);
  const bundling = bundleLoading && bundleWorkflowId === selectedWorkflow.id;
  return (
    <>
      <DetailHeader
        kicker={`${asString(selectedWorkflow.kind, "generate")} workflow`}
        objective={asString(
          workflowDetailResource.data?.workflow?.objective,
          asString(selectedWorkflow.objective, "No objective recorded."),
        )}
        status={<Badge tone={tagTone(tier)}>{titleCase(status)}</Badge>}
        tags={
          <>
            <WorkTag tone={tagTone(tier)}>
              {orchestrationTimingLabel({
                status,
                completedAt: asString(selectedWorkflow.completedAt),
                updatedAt: asString(selectedWorkflow.updatedAt),
                createdAt: asString(selectedWorkflow.createdAt),
              })}
            </WorkTag>
            <WorkTag>{asString(selectedWorkflow.kind, "generate")}</WorkTag>
            <WorkTag>{runCount} runs</WorkTag>
            <WorkTag>
              {asArray(workflowDetailResource.data?.tree).length} root phases
            </WorkTag>
          </>
        }
        title={asString(
          workflowDetailResource.data?.workflow?.title,
          asString(selectedWorkflow.title, selectedWorkflow.id),
        )}
      />
      <WorkActions
        primary={
          <button
            className="secondary-button"
            type="button"
            onClick={() => void onLoadBundle()}
            disabled={!active || bundling}
          >
            {bundling ? "Bundling…" : "Bundle workflow"}
          </button>
        }
        secondary={
          <details className="ws-overflow">
            <summary>More</summary>
            <div className="ws-overflow__menu">
              <button
                className="text-button"
                type="button"
                onClick={() => void copyContextText(selectedWorkflow.id)}
              >
                Copy workflow ID
              </button>
              {selectedRun && runCancellable(selectedRun) ? (
                <button
                  className="text-button danger-text-button"
                  type="button"
                  onClick={() => onRequestRunCancellation(selectedRun.id)}
                  disabled={
                    !active || busyKeys[`codegen:${selectedRun.id}:cancel`]
                  }
                >
                  Cancel run…
                </button>
              ) : null}
            </div>
          </details>
        }
      />
      {selectedRun && confirmedRunCancellation === selectedRun.id ? (
        <WorkConfirm
          detail="This records a cancelled lifecycle state. The current pipeline cannot guarantee that in-flight model work stops immediately."
          title="Cancel this run?"
        >
          <button
            className="danger-button"
            type="button"
            onClick={() => void onCancelRun(selectedRun)}
            disabled={!active || busyKeys[`codegen:${selectedRun.id}:cancel`]}
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
        </WorkConfirm>
      ) : null}
      {bundleError && bundleWorkflowId === selectedWorkflow.id ? (
        <ErrorBlock error={bundleError} retry={() => void onLoadBundle()} />
      ) : null}
      {bundleResult && bundleWorkflowId === selectedWorkflow.id ? (
        <Notice tone="good">
          <strong>Bundle ready</strong>
          <span>
            {asString(bundleResult.manifestPath) ||
              asString(
                asRecord(bundleResult.manifest).name,
                "Manifest receipt ready",
              )}{" "}
            · {asArray(bundleResult.runs).length} run records included
          </span>
        </Notice>
      ) : null}
      {!selectedRun ? (
        <p className="ws-empty-line">Select a run to inspect its evidence.</p>
      ) : runDetailResource.error ? (
        <ErrorBlock
          error={runDetailResource.error}
          retry={runDetailResource.reload}
        />
      ) : runDetailResource.loading ? (
        <LoadingBlock />
      ) : (
        <RunInspector selectedRun={selectedRun} />
      )}
    </>
  );
}

function RunInspector({ selectedRun }: { selectedRun: CodegenRunRecord }) {
  const status = asString(selectedRun.status, "pending");
  const tier = statusTier(status);
  const artifacts = runArtifacts(selectedRun);
  return (
    <div className={oc("orchestration-run-inspector")}>
      <div className={oc("orchestration-subheading")}>
        <div>
          <span className="ws-kicker">Selected run</span>
          <h3>
            {asString(
              selectedRun.phase,
              asString(selectedRun.kind, selectedRun.id),
            )}
          </h3>
        </div>
        <Badge tone={tagTone(tier)}>{titleCase(status)}</Badge>
      </div>
      <div className="ws-tags">
        <WorkTag tone={tagTone(tier)}>
          {orchestrationTimingLabel({
            status,
            completedAt: asString(selectedRun.completedAt),
            updatedAt: asString(selectedRun.updatedAt),
            createdAt: asString(selectedRun.createdAt),
          })}
        </WorkTag>
        <WorkTag>{asString(selectedRun.kind, "run")}</WorkTag>
        <WorkTag>
          {selectedRun.taskId ? "task linked" : "task unlinked"}
        </WorkTag>
        <WorkTag>
          {selectedRun.sessionId ? "session linked" : "session unlinked"}
        </WorkTag>
        <WorkTag>
          {selectedRun.accountLabel || selectedRun.accountId
            ? `account ${selectedRun.accountLabel || selectedRun.accountId}`
            : "account not recorded"}
        </WorkTag>
      </div>
      {selectedRun.error ? (
        <Notice tone="bad">
          <strong>Run error</strong>
          <span>{selectedRun.error}</span>
        </Notice>
      ) : null}
      <WorkCards>
        <WorkCard kicker="Output preview">
          <pre>
            {asString(selectedRun.outputPreview, "No output preview recorded.")}
          </pre>
        </WorkCard>
        <WorkCard kicker="Artifacts">
          {artifacts.length > 0 ? (
            <ArtifactViewer artifacts={artifacts} runId={selectedRun.id} />
          ) : (
            <p className="ws-empty-line">No artifacts recorded.</p>
          )}
        </WorkCard>
      </WorkCards>
      <WorkDisclosure
        aside={`${asString(selectedRun.kind, "run")} · ${titleCase(status)}`}
        detail="IDs, session, account, and runtime diagnostics"
        summary="Run details"
      >
        <DetailFacts>
          <FactRow label="Run ID">{selectedRun.id}</FactRow>
          <FactRow label="Task">
            {asString(selectedRun.taskId, "not linked")}
          </FactRow>
          <FactRow label="Session">
            {asString(selectedRun.sessionId, "not linked")}
          </FactRow>
          <FactRow label="Capability">
            {taskCapabilityLabel(
              selectedRun.capabilityProfile,
              selectedRun.kind,
            )}
          </FactRow>
          <FactRow label="Framework">
            {asString(selectedRun.framework, "not recorded")}
          </FactRow>
          <FactRow label="Account provider">
            {asString(selectedRun.accountProviderId, "not recorded")}
          </FactRow>
          <FactRow label="Account">
            {asString(
              selectedRun.accountLabel,
              asString(selectedRun.accountId, "not recorded"),
            )}
          </FactRow>
          <FactRow label="Updated">
            {displayTimestamp(asString(selectedRun.updatedAt))}
          </FactRow>
        </DetailFacts>
      </WorkDisclosure>
      <WorkDisclosure
        detail="Raw input record submitted to the workflow"
        summary="Request payload"
      >
        <pre>{JSON.stringify(asRecord(selectedRun.input), null, 2)}</pre>
      </WorkDisclosure>
    </div>
  );
}
