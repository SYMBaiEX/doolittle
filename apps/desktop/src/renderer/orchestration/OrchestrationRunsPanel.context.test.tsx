// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OrchestrationRunsPanel,
  type OrchestrationRunsPanelProps,
} from "./OrchestrationRunsPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("workflow and run context actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  const resource = () => ({
    data: null,
    loading: false,
    error: "",
    reload: vi.fn(),
  });
  function props(): OrchestrationRunsPanelProps {
    return {
      active: true,
      codegenRuntimeResource: resource(),
      codegenWorkflowsResource: resource(),
      workflowDetailResource: resource(),
      runDetailResource: resource(),
      codegenExecution: {},
      codegenAvailable: true,
      codegenReady: true,
      workflowSummary: {},
      codegenMode: "generate",
      codegenProjectName: "Example",
      codegenPrompt: "",
      codegenProjectPath: "",
      codegenTargetType: "",
      busyKeys: {},
      workflows: [{ id: "workflow-a", title: "Release", status: "running" }],
      visibleRuns: [{ id: "run-a", phase: "Build", status: "running" }],
      bundleWorkflowId: "",
      bundleResult: null,
      bundleError: "",
      bundleLoading: false,
      onCodegenModeChange: vi.fn(),
      onCodegenProjectNameChange: vi.fn(),
      onCodegenPromptChange: vi.fn(),
      onCodegenProjectPathChange: vi.fn(),
      onCodegenTargetTypeChange: vi.fn(),
      onSubmitCodegen: vi.fn(),
      onSelectWorkflow: vi.fn(),
      onSelectRun: vi.fn(),
      onRequestRunCancellation: vi.fn(),
      onDismissRunCancellation: vi.fn(),
      confirmedRunCancellation: "",
      onLoadBundle: vi.fn(),
      onCancelRun: vi.fn(),
    };
  }
  async function open(selector: string) {
    await act(async () =>
      container.querySelector(selector)?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
  }
  async function select(label: string) {
    const item = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((entry) => entry.textContent === label);
    if (!item) throw new Error(`Missing action: ${label}`);
    await act(async () => item.click());
  }
  it("inspects workflows and requests exact run cancellation without committing it", async () => {
    const model = props();
    await act(async () => root.render(<OrchestrationRunsPanel {...model} />));
    await open(".orchestration-workflow-list button");
    await select("Inspect workflow");
    expect(model.onSelectWorkflow).toHaveBeenCalledExactlyOnceWith(
      "workflow-a",
    );
    await open(".orchestration-run-list button");
    await select("Cancel run…");
    expect(model.onSelectRun).toHaveBeenCalledExactlyOnceWith("run-a");
    expect(model.onRequestRunCancellation).toHaveBeenCalledExactlyOnceWith(
      "run-a",
    );
    expect(model.onCancelRun).not.toHaveBeenCalled();
  });
  it("does not invent cancellation for completed runs", async () => {
    const model = props();
    model.visibleRuns = [{ id: "run-a", phase: "Build", status: "completed" }];
    await act(async () => root.render(<OrchestrationRunsPanel {...model} />));
    await open(".orchestration-run-list button");
    expect(
      Array.from(document.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent,
      ),
    ).toEqual(["Inspect run", "Copy run ID"]);
    expect(model.onRequestRunCancellation).not.toHaveBeenCalled();
  });
});
