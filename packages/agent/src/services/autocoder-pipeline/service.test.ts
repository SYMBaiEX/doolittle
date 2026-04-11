import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutocoderPipelineService } from "./service";

describe("AutocoderPipelineService", () => {
  it("persists workflow-linked runs with request/result artifacts and summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-"));
    const service = new AutocoderPipelineService(root);
    const workflow = service.startWorkflow({
      title: "Eliza Native PRD",
      objective: "Generate research and a PRD",
      kind: "prd",
      projectName: "Eliza Native",
      sessionId: "session-1",
      taskId: "task-1",
    });

    const research = service.record({
      workflowId: workflow.id,
      kind: "research",
      projectName: "Eliza Native",
      sessionId: "session-1",
      taskId: "task-1",
      request: { projectName: "Eliza Native", apis: ["github"] },
      result: { research: true },
    });
    const prd = service.record({
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

    expect(service.list(5)).toHaveLength(2);
    expect(service.latest("research")?.id).toBe(research.id);
    expect(service.get(prd.id)?.linkedRunIds).toEqual([research.id]);
    expect(service.get(prd.id)?.parentRunId).toBe(research.id);
    expect(service.get(prd.id)?.artifactPaths).toHaveLength(2);
    expect(service.summary().counts.prd).toBe(1);
    expect(service.summary().total).toBe(2);
    expect(service.summary().workflows).toBe(1);
    expect(service.summary().latestWorkflow?.id).toBe(workflow.id);
    expect(service.getWorkflow(workflow.id)?.taskId).toBe("task-1");
    expect(service.workflow(workflow.id).tree).toHaveLength(1);
    expect(service.workflow(workflow.id).tree[0]?.children).toHaveLength(1);
    expect(service.bundleWorkflow(workflow.id).manifestPath).toBeTruthy();
  });

  it("tracks running and failed workflow lifecycle state", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-"));
    const service = new AutocoderPipelineService(root);
    const workflow = service.startWorkflow({
      title: "Failing workflow",
      objective: "Surface lifecycle transitions",
      kind: "generate",
    });

    const run = service.startRun({
      workflowId: workflow.id,
      kind: "generate",
      request: { prompt: "Build the thing" },
    });

    expect(service.getWorkflow(workflow.id)?.status).toBe("running");
    service.failRun(run.id, "boom");
    expect(service.get(run.id)?.status).toBe("failed");
    expect(service.getWorkflow(workflow.id)?.status).toBe("failed");
    expect(service.summary().failedWorkflows).toBe(1);
  });
});
