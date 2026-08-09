import { describe, expect, it } from "vitest";
import { projectCodegenSelection } from "./orchestration-codegen-selection";

const workflows = [{ id: "workflow-a" }, { id: "workflow-b" }];
const globalRuns = [{ id: "global-a" }, { id: "global-b" }];
const detailRuns = [{ id: "run-a" }, { id: "run-b" }];

describe("projectCodegenSelection", () => {
  it("retains valid workflow and run selections", () => {
    const selection = projectCodegenSelection({
      workflows,
      globalRuns,
      workflowDetailRuns: detailRuns,
      selectedWorkflowId: "workflow-b",
      selectedRunId: "run-b",
      detailWorkflowId: "workflow-b",
      workflowDetailLoading: false,
    });

    expect(selection).toMatchObject({
      selectedWorkflow: workflows[1],
      selectedRun: detailRuns[1],
      visibleRuns: detailRuns,
    });
    expect(selection.selectedWorkflowIdUpdate).toBeUndefined();
    expect(selection.selectedRunIdUpdate).toBeUndefined();
  });

  it("falls back to the first workflow when the workflow ID is invalid", () => {
    const selection = projectCodegenSelection({
      workflows,
      globalRuns,
      workflowDetailRuns: detailRuns,
      selectedWorkflowId: "missing",
      selectedRunId: "run-a",
      detailWorkflowId: "missing",
      workflowDetailLoading: false,
    });

    expect(selection.selectedWorkflow).toBe(workflows[0]);
    expect(selection.selectedWorkflowIdUpdate).toBe("workflow-a");
  });

  it("does not write a workflow selection when no workflows exist", () => {
    const selection = projectCodegenSelection({
      workflows: [],
      globalRuns,
      workflowDetailRuns: [],
      selectedWorkflowId: "missing",
      selectedRunId: "run-a",
      detailWorkflowId: "missing",
      workflowDetailLoading: false,
    });

    expect(selection.selectedWorkflow).toBeUndefined();
    expect(selection.selectedWorkflowIdUpdate).toBeUndefined();
    expect(selection.visibleRuns).toEqual([]);
    expect(selection.selectedRunIdUpdate).toBe("");
  });

  it.each([
    { workflowDetailLoading: true, detailWorkflowId: "workflow-a" },
    { workflowDetailLoading: false, detailWorkflowId: "workflow-b" },
  ])(
    "hides runs and does not write a run while workflow detail is stale",
    (detail) => {
      const selection = projectCodegenSelection({
        workflows,
        globalRuns,
        workflowDetailRuns: detailRuns,
        selectedWorkflowId: "workflow-a",
        selectedRunId: "run-a",
        detailedRun: detailRuns[0],
        ...detail,
      });

      expect(selection.visibleRuns).toEqual([]);
      expect(selection.selectedRun).toBeUndefined();
      expect(selection.selectedRunIdUpdate).toBeUndefined();
    },
  );

  it("selects the first matching-detail run when the run ID is invalid", () => {
    const selection = projectCodegenSelection({
      workflows,
      globalRuns,
      workflowDetailRuns: detailRuns,
      selectedWorkflowId: "workflow-a",
      selectedRunId: "missing",
      detailWorkflowId: "workflow-a",
      workflowDetailLoading: false,
    });

    expect(selection.selectedRun).toBe(detailRuns[0]);
    expect(selection.selectedRunIdUpdate).toBe("run-a");
  });

  it("clears a matching-detail run selection when its list is empty", () => {
    const selection = projectCodegenSelection({
      workflows,
      globalRuns,
      workflowDetailRuns: [],
      selectedWorkflowId: "workflow-a",
      selectedRunId: "run-a",
      detailWorkflowId: "workflow-a",
      workflowDetailLoading: false,
    });

    expect(selection.selectedRun).toBeUndefined();
    expect(selection.selectedRunIdUpdate).toBe("");
  });

  it("uses a detailed run only when it matches the selected run ID", () => {
    const detailedRun = { id: "run-a", source: "detail" };
    const selection = projectCodegenSelection({
      workflows,
      globalRuns,
      workflowDetailRuns: [{ id: "run-a", source: "list" }],
      selectedWorkflowId: "workflow-a",
      selectedRunId: "run-a",
      detailWorkflowId: "workflow-a",
      workflowDetailLoading: false,
      detailedRun,
    });
    const mismatched = projectCodegenSelection({
      workflows,
      globalRuns,
      workflowDetailRuns: [{ id: "run-a", source: "list" }],
      selectedWorkflowId: "workflow-a",
      selectedRunId: "run-a",
      detailWorkflowId: "workflow-a",
      workflowDetailLoading: false,
      detailedRun: { id: "foreign", source: "detail" },
    });

    expect(selection.selectedRun).toBe(detailedRun);
    expect(mismatched.selectedRun).toEqual({ id: "run-a", source: "list" });
  });

  it("uses global runs only when no workflow is selected", () => {
    const selection = projectCodegenSelection({
      workflows: [],
      globalRuns,
      workflowDetailRuns: detailRuns,
      selectedWorkflowId: "",
      selectedRunId: "global-b",
      detailWorkflowId: "workflow-a",
      workflowDetailLoading: true,
    });

    expect(selection.selectedWorkflow).toBeUndefined();
    expect(selection.visibleRuns).toBe(globalRuns);
    expect(selection.selectedRun).toBe(globalRuns[1]);
  });
});
