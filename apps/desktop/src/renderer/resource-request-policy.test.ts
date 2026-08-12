import { describe, expect, it } from "vitest";
import {
  automationRequests,
  codingWorkspaceRequests,
  orchestrationRequests,
  reviewRequests,
  sessionDetailRequests,
  setupRequests,
} from "./resource-request-policy";

describe("coding workspace request policy", () => {
  it("loads only the Files-pane resources on the initial visible layout", () => {
    expect(
      codingWorkspaceRequests({
        active: true,
        explorerVisible: true,
        utilityVisible: true,
        leftPane: "files",
        editorPane: "file",
        utilityPane: "terminal",
        hasSelectedPath: false,
        hasSearchQuery: false,
      }),
    ).toEqual({
      summary: true,
      tree: true,
      changes: false,
      log: false,
      worktrees: false,
      sourceControl: false,
      search: false,
      file: false,
      patch: false,
    });
  });

  it("loads the dependencies required by the visible diff and source-control panes", () => {
    const diff = codingWorkspaceRequests({
      active: true,
      explorerVisible: false,
      utilityVisible: false,
      leftPane: "files",
      editorPane: "diff",
      utilityPane: "terminal",
      hasSelectedPath: true,
      hasSearchQuery: false,
    });
    expect(diff.changes).toBe(true);
    expect(diff.patch).toBe(true);
    expect(diff.file).toBe(false);

    const sourceControl = codingWorkspaceRequests({
      ...{
        active: true,
        explorerVisible: false,
        utilityVisible: true,
        leftPane: "files" as const,
        editorPane: "file" as const,
        utilityPane: "source-control" as const,
        hasSelectedPath: false,
        hasSearchQuery: false,
      },
    });
    expect(sourceControl.changes).toBe(true);
    expect(sourceControl.sourceControl).toBe(true);
  });
});

describe("orchestration request policy", () => {
  it("keeps persistent header resources while deferring inactive tab resources", () => {
    expect(
      orchestrationRequests({
        active: true,
        activeTab: "tasks",
        hasSelectedWorkflow: false,
        hasSelectedRun: false,
      }),
    ).toMatchObject({
      overview: true,
      tasks: true,
      workers: false,
      plans: true,
      codegenRuntime: false,
      codegenWorkflows: false,
      codegenRuns: false,
    });
  });

  it("retains header data and runs-only codegen detail dependencies", () => {
    const plans = orchestrationRequests({
      active: true,
      activeTab: "plans",
      hasSelectedWorkflow: true,
      hasSelectedRun: true,
    });
    expect(plans.tasks).toBe(true);
    expect(plans.plans).toBe(true);
    expect(plans.workflowDetail).toBe(false);

    const runs = orchestrationRequests({
      active: true,
      activeTab: "runs",
      hasSelectedWorkflow: true,
      hasSelectedRun: true,
    });
    expect(runs.workflowDetail).toBe(true);
    expect(runs.runDetail).toBe(true);
  });
});

describe("review request policy", () => {
  it("defers source-control collections until both evidence drawers are open", () => {
    expect(
      reviewRequests({
        active: true,
        evidenceOpen: false,
        sourceControlOpen: false,
      }),
    ).toEqual({ primary: true, sourceControl: false });
    expect(
      reviewRequests({
        active: true,
        evidenceOpen: true,
        sourceControlOpen: false,
      }),
    ).toEqual({ primary: true, sourceControl: false });
    expect(
      reviewRequests({
        active: true,
        evidenceOpen: true,
        sourceControlOpen: true,
      }),
    ).toEqual({ primary: true, sourceControl: true });
    expect(
      reviewRequests({
        active: false,
        evidenceOpen: true,
        sourceControlOpen: true,
      }),
    ).toEqual({ primary: false, sourceControl: false });
  });
});

describe("session detail request policy", () => {
  it("loads transcript data immediately and continuity only on demand", () => {
    expect(
      sessionDetailRequests({ active: true, continuityOpen: false }),
    ).toEqual({ primary: true, continuity: false });
    expect(
      sessionDetailRequests({ active: true, continuityOpen: true }),
    ).toEqual({ primary: true, continuity: true });
    expect(
      sessionDetailRequests({ active: false, continuityOpen: true }),
    ).toEqual({ primary: false, continuity: false });
  });
});

describe("setup request policy", () => {
  it("defers the optional checklist until its disclosure is opened", () => {
    expect(setupRequests({ active: true, checklistOpen: false })).toEqual({
      primary: true,
      checklist: false,
    });
    expect(setupRequests({ active: true, checklistOpen: true })).toEqual({
      primary: true,
      checklist: true,
    });
    expect(setupRequests({ active: false, checklistOpen: true })).toEqual({
      primary: false,
      checklist: false,
    });
  });
});

describe("automation request policy", () => {
  it("keeps workflow management primary and defers trace receipts", () => {
    expect(automationRequests({ active: true, runsOpen: false })).toEqual({
      jobs: true,
      runs: false,
    });
    expect(automationRequests({ active: true, runsOpen: true })).toEqual({
      jobs: true,
      runs: true,
    });
    expect(automationRequests({ active: false, runsOpen: true })).toEqual({
      jobs: false,
      runs: false,
    });
  });
});
