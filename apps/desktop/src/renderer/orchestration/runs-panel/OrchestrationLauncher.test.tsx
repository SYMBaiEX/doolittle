import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrchestrationLauncher } from "./OrchestrationLauncher";

const resource = { data: null, error: "", loading: false, reload: vi.fn() };

describe("OrchestrationLauncher", () => {
  it("renders mode controls and offline readiness without changing the form contract", () => {
    const markup = renderToStaticMarkup(
      <OrchestrationLauncher
        active
        workspaceLabel="Doolittle"
        workspacePath="/work/doolittle"
        codegenRuntimeResource={resource}
        codegenExecution={{}}
        codegenAvailable={false}
        codegenReady={false}
        workflowSummary={{}}
        codegenMode="generate"
        codegenProjectName=""
        codegenPrompt=""
        codegenProjectPath=""
        codegenTargetType="app"
        busyKeys={{}}
        onCodegenModeChange={vi.fn()}
        onCodegenProjectNameChange={vi.fn()}
        onCodegenPromptChange={vi.fn()}
        onCodegenProjectPathChange={vi.fn()}
        onCodegenTargetTypeChange={vi.fn()}
        onSubmitCodegen={vi.fn()}
      />,
    );
    expect(markup).toContain("New workflow");
    expect(markup).toContain("offline");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Code generation mode");
    expect(markup).toContain("Run Generate");
  });
});
