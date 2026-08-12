import { asArray, asNumber, asString, Badge, ErrorBlock } from "../../lib";
import { compactWorkspacePath } from "../../workspace-path";
import type { OrchestrationRunsPanelProps } from "../OrchestrationRunsPanel";
import { CODEGEN_MODES } from "../orchestration-runs-model";

type LauncherProps = Pick<
  OrchestrationRunsPanelProps,
  | "active"
  | "workspaceLabel"
  | "workspacePath"
  | "codegenRuntimeResource"
  | "codegenExecution"
  | "codegenAvailable"
  | "codegenReady"
  | "workflowSummary"
  | "codegenMode"
  | "codegenProjectName"
  | "codegenPrompt"
  | "codegenProjectPath"
  | "codegenTargetType"
  | "busyKeys"
  | "onCodegenModeChange"
  | "onCodegenProjectNameChange"
  | "onCodegenPromptChange"
  | "onCodegenProjectPathChange"
  | "onCodegenTargetTypeChange"
  | "onSubmitCodegen"
>;

export function OrchestrationLauncher(props: LauncherProps) {
  const {
    active,
    workspaceLabel,
    workspacePath,
    codegenRuntimeResource,
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
    onCodegenModeChange,
    onCodegenProjectNameChange,
    onCodegenPromptChange,
    onCodegenProjectPathChange,
    onCodegenTargetTypeChange,
    onSubmitCodegen,
  } = props;
  return (
    <aside className="orchestration-launcher">
      {codegenRuntimeResource.error ? (
        <ErrorBlock
          error={codegenRuntimeResource.error}
          retry={codegenRuntimeResource.reload}
        />
      ) : null}
      <div className="orchestration-pane-heading">
        <span>New workflow</span>
        <Badge tone={codegenReady ? "good" : codegenAvailable ? "warn" : "bad"}>
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
                onChange={(event) => onCodegenPromptChange(event.target.value)}
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
  );
}
