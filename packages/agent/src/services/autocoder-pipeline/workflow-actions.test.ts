import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutocoderPipelinePersistence } from "./persistence";
import { createAutocoderPipelineWorkflowActions } from "./workflow-actions";

describe("AutocoderPipelineWorkflowActions", () => {
  it("creates linked runs and bundles workflow manifests", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-workflow-"));
    const persistence = createAutocoderPipelinePersistence(root);
    const actions = createAutocoderPipelineWorkflowActions(persistence);

    const workflow = actions.startWorkflow({
      title: "Eliza Native PRD",
      objective: "Generate research and a PRD",
      kind: "prd",
      projectName: "Eliza Native",
      sessionId: "session-1",
      taskId: "task-1",
    });

    const research = actions.record({
      workflowId: workflow.id,
      kind: "research",
      projectName: "Eliza Native",
      sessionId: "session-1",
      taskId: "task-1",
      request: { projectName: "Eliza Native", apis: ["github"] },
      result: { research: true },
    });
    const prd = actions.record({
      workflowId: workflow.id,
      kind: "prd",
      projectName: "Eliza Native",
      sessionId: "session-1",
      taskId: "task-1",
      request: { projectName: "Eliza Native" },
      result: { prd: true },
      linkedRunIds: [research.id],
      parentRunId: research.id,
    });

    const bundled = actions.bundleWorkflow(workflow.id);
    const store = persistence.loadStore();

    expect(store.runs).toHaveLength(2);
    expect(store.workflows).toHaveLength(1);
    expect(research.parentRunId).toBeUndefined();
    expect(prd.linkedRunIds).toEqual([research.id]);
    expect(prd.parentRunId).toBe(research.id);
    expect(bundled.manifestPath).toBeTruthy();
    expect(bundled.workflow?.artifactPaths.length).toBeGreaterThan(0);
  });

  it("refreshes workflow state for completed runs", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-complete-"));
    const persistence = createAutocoderPipelinePersistence(root);
    const actions = createAutocoderPipelineWorkflowActions(persistence);
    const workflow = actions.startWorkflow({
      title: "Completed workflow",
      objective: "Surface lifecycle transitions",
      kind: "generate",
    });

    const run = actions.startRun({
      workflowId: workflow.id,
      kind: "generate",
      request: { prompt: "Build the thing" },
    });

    actions.completeRun(run.id, { ok: true });

    const store = persistence.loadStore();
    expect(store.runs.find((entry) => entry.id === run.id)?.status).toBe(
      "completed",
    );
    expect(
      store.workflows.find((entry) => entry.id === workflow.id)?.status,
    ).toBe("completed");
  });

  it("refreshes workflow state for failed runs", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-failed-"));
    const persistence = createAutocoderPipelinePersistence(root);
    const actions = createAutocoderPipelineWorkflowActions(persistence);
    const workflow = actions.startWorkflow({
      title: "Failing workflow",
      objective: "Surface lifecycle transitions",
      kind: "generate",
    });

    const run = actions.startRun({
      workflowId: workflow.id,
      kind: "generate",
      request: { prompt: "Build the thing" },
    });

    actions.failRun(run.id, "boom");

    const store = persistence.loadStore();
    expect(store.runs.find((entry) => entry.id === run.id)?.status).toBe(
      "failed",
    );
    expect(
      store.workflows.find((entry) => entry.id === workflow.id)?.status,
    ).toBe("failed");
  });
});
