import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AutocoderPipelineService,
  AutocoderRunCancelledError,
} from "./service";

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
    const artifact = service.readArtifact(prd.id, 0);
    expect(artifact.artifact).toMatchObject({
      runId: prd.id,
      index: 0,
      kind: "json",
      mimeType: "application/json",
    });
    expect(artifact.encoding).toBe("utf8");
    expect(JSON.parse(artifact.content)).toEqual({
      projectName: "Eliza Native",
    });
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

  it("aborts an active local execution and persists its cancelled lifecycle", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-"));
    const service = new AutocoderPipelineService(root);
    const workflow = service.startWorkflow({
      title: "Cancellable workflow",
      objective: "Stop active local work",
      kind: "generate",
    });
    const run = service.startRun({
      workflowId: workflow.id,
      kind: "generate",
      request: { prompt: "Keep working" },
    });
    let operationObservedAbort = false;
    const execution = service.executeRun(run.id, (signal) => {
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            operationObservedAbort = true;
            reject(signal.reason);
          },
          { once: true },
        );
      });
    });
    await Promise.resolve();

    expect(service.isRunLocallyActive(run.id)).toBe(true);
    const cancellation = service.cancelRunExecution(
      run.id,
      "cancelled by test",
    );

    expect(cancellation).toMatchObject({
      applied: true,
      alreadyCancelled: false,
      locallyActive: true,
      executionTerminationSupported: true,
      executionTerminated: true,
      run: { id: run.id, status: "cancelled" },
    });
    await expect(execution).rejects.toBeInstanceOf(AutocoderRunCancelledError);
    expect(operationObservedAbort).toBe(true);
    expect(service.isRunLocallyActive(run.id)).toBe(false);
    expect(new AutocoderPipelineService(root).get(run.id)?.status).toBe(
      "cancelled",
    );
    expect(service.getWorkflow(workflow.id)?.status).toBe("cancelled");
  });

  it("reports stale persisted work truthfully and keeps cancellation idempotent", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-pipeline-"));
    const firstProcess = new AutocoderPipelineService(root);
    const workflow = firstProcess.startWorkflow({
      title: "Detached workflow",
      objective: "Represent work from a previous process",
      kind: "research",
    });
    const run = firstProcess.startRun({
      workflowId: workflow.id,
      kind: "research",
      request: { prompt: "Detached work" },
    });
    const currentProcess = new AutocoderPipelineService(root);

    expect(
      currentProcess.cancelRunExecution(run.id, "operator request"),
    ).toMatchObject({
      applied: true,
      alreadyCancelled: false,
      locallyActive: false,
      executionTerminationSupported: true,
      executionTerminated: false,
      run: { status: "cancelled" },
    });
    expect(
      currentProcess.cancelRunExecution(run.id, "operator request"),
    ).toMatchObject({
      applied: false,
      alreadyCancelled: true,
      locallyActive: false,
      executionTerminationSupported: true,
      executionTerminated: false,
      run: { status: "cancelled" },
    });
  });
});
