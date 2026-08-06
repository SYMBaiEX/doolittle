import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import {
  AutocoderArtifactError,
  AutocoderPipelineService,
  AutocoderRunCancelledError,
} from "@/services/autocoder-pipeline";
import { createOfficialOrchestratorTestFixture } from "@/testing/official-orchestrator";
import { handleCodegenGenerateRoutes } from "./handlers/generate";
import { handleCodegenGithubRoutes } from "./handlers/github";
import { handleCodegenPRDRoutes } from "./handlers/prd";
import { handleCodegenQA } from "./handlers/qa";
import { handleCodegenResearchRoutes } from "./handlers/research";
import { handleCodegenRunsRoutes } from "./handlers/runs";
import { handleCodegenRuntimeRoutes } from "./handlers/runtime";
import { handleCodegenWorkflowsRoutes } from "./handlers/workflows";

function createContext(): AppContext {
  let workflowCounter = 0;
  let runCounter = 0;
  const official = createOfficialOrchestratorTestFixture();
  const activeRuns = new Map<string, Record<string, unknown>>();

  return {
    runtime: {
      getService: (service: string) => {
        if (service === "ORCHESTRATOR_TASK_SERVICE") {
          return official.service;
        }
        if (service === "code-generation") {
          return {
            generateCode: async (request: Record<string, unknown>) => ({
              generated: true,
              request,
            }),
            performResearch: async (request: Record<string, unknown>) => ({
              researched: true,
              request,
            }),
            generatePRD: async (
              request: Record<string, unknown>,
              research: Record<string, unknown>,
            ) => ({
              prd: true,
              request,
              research,
            }),
            performQA: async (projectPath: string) => ({
              qa: true,
              projectPath,
            }),
          };
        }
        if (service === "github") {
          return {
            createRepository: async (name: string, isPrivate: boolean) => ({
              experimental: true,
              executed: false,
              name,
              private: isPrivate,
              status: "planned",
            }),
            deleteRepository: async (name: string) => ({
              experimental: true,
              executed: false,
              name,
              status: "planned",
            }),
          };
        }
        return undefined;
      },
    },
    services: {
      autocoderPipeline: {
        startWorkflow: (input: Record<string, unknown>) => ({
          ...input,
          id: `workflow-${++workflowCounter}`,
        }),
        startRun: (input: Record<string, unknown>) => {
          const run = {
            ...input,
            id: `run-${++runCounter}`,
            status: "running",
            artifactPaths: [],
          };
          activeRuns.set(run.id, run);
          return run;
        },
        executeRun: async (
          _id: string,
          operation: (signal: AbortSignal) => Promise<unknown>,
        ) => operation(new AbortController().signal),
        completeRun: (id: string, result: unknown) => {
          const run = activeRuns.get(id);
          if (!run) throw new Error(`missing run ${id}`);
          Object.assign(run, { status: "completed", result });
          return run;
        },
        failRun: (id: string, error: string) => {
          const run = activeRuns.get(id);
          if (!run) throw new Error(`missing run ${id}`);
          Object.assign(run, { status: "failed", error });
          return run;
        },
        record: (input: Record<string, unknown>) => ({
          ...input,
          id: `run-${++runCounter}`,
        }),
        summary: () => ({
          total: runCounter,
          workflows: workflowCounter,
          counts: {},
          failed: 0,
          failedWorkflows: 0,
          running: 0,
          runningWorkflows: 0,
          latest: {
            id: "run-latest",
            artifactPaths: ["/private/pipeline/run-latest-result.json"],
          },
          latestWorkflow: {
            id: "workflow-latest",
            artifactPaths: ["/private/pipeline/workflow-latest-result.json"],
          },
        }),
        list: () => [
          {
            id: "run-listed",
            artifactPaths: ["/private/pipeline/run-listed-result.json"],
          },
        ],
        listWorkflows: () => [
          {
            id: "workflow-listed",
            artifactPaths: ["/private/pipeline/workflow-listed-result.json"],
          },
        ],
        get: (id: string) =>
          activeRuns.get(id) ?? {
            id,
            kind: "generate",
            artifactPaths: [`/private/pipeline/${id}-result.json`],
          },
        readArtifact: (id: string, index: number) => {
          if (id === "missing") {
            throw new AutocoderArtifactError(
              "Autocoder artifact not found.",
              404,
            );
          }
          return {
            artifact: {
              runId: id,
              index,
              name: "result.json",
              kind: "json",
              mimeType: "application/json",
              sizeBytes: 11,
            },
            encoding: "utf8",
            content: '{"ok":true}',
          };
        },
        workflow: (id: string) => ({
          workflow: {
            id,
            state: "active",
            artifactPaths: [`/private/pipeline/${id}-manifest.json`],
          },
          runs: [
            {
              id: "run-workflow",
              artifactPaths: ["/private/pipeline/run-workflow-result.json"],
            },
          ],
          tree: [
            {
              id: "run-parent",
              artifactPaths: ["/private/pipeline/run-parent-result.json"],
              children: [
                {
                  id: "run-child",
                  artifactPaths: ["/private/pipeline/run-child-result.json"],
                },
              ],
            },
          ],
        }),
        bundleWorkflow: (id: string) => ({
          workflow: {
            id,
            artifactPaths: [`/private/pipeline/${id}-manifest.json`],
          },
          runs: [],
          manifestPath: `/private/pipeline/${id}-manifest.json`,
        }),
      },
      __events: {
        tasks: official.tasks,
      },
    },
  } as unknown as AppContext;
}

describe("codegen route handlers", () => {
  it("handles runtime and codegen listing routes", async () => {
    const context = createContext();
    const runtime = await handleCodegenRuntimeRoutes(
      context,
      new Request("http://localhost/runtime/codegen"),
      new URL("http://localhost/runtime/codegen"),
    );
    const runs = await handleCodegenRunsRoutes(
      context,
      new Request("http://localhost/codegen/runs"),
      new URL("http://localhost/codegen/runs"),
    );
    const run = await handleCodegenRunsRoutes(
      context,
      new Request("http://localhost/codegen/runs/run-1"),
      new URL("http://localhost/codegen/runs/run-1"),
    );
    const workflows = await handleCodegenWorkflowsRoutes(
      context,
      new Request("http://localhost/codegen/workflows"),
      new URL("http://localhost/codegen/workflows"),
    );
    const workflowDetail = await handleCodegenWorkflowsRoutes(
      context,
      new Request("http://localhost/codegen/workflows/workflow-1"),
      new URL("http://localhost/codegen/workflows/workflow-1"),
    );
    const workflowBundle = await handleCodegenWorkflowsRoutes(
      context,
      new Request("http://localhost/codegen/workflows/workflow-1/bundle", {
        method: "POST",
      }),
      new URL("http://localhost/codegen/workflows/workflow-1/bundle"),
    );
    const unsafeBundleGet = await handleCodegenWorkflowsRoutes(
      context,
      new Request("http://localhost/codegen/workflows/workflow-1/bundle"),
      new URL("http://localhost/codegen/workflows/workflow-1/bundle"),
    );

    const runtimeBody = await runtime?.json();
    const runsBody = await runs?.json();
    const runBody = await run?.json();
    const workflowsBody = await workflows?.json();
    const workflowDetailBody = await workflowDetail?.json();
    const workflowBundleBody = await workflowBundle?.json();
    expect(runtimeBody?.execution?.codeGeneration?.available).toBe(true);
    expect(runsBody).toEqual({
      summary: {
        total: 0,
        workflows: 0,
        counts: {},
        failed: 0,
        failedWorkflows: 0,
        running: 0,
        runningWorkflows: 0,
        latest: {
          id: "run-latest",
          artifacts: [{ index: 0, name: "run-latest-result.json" }],
          artifactCount: 1,
        },
        latestWorkflow: {
          id: "workflow-latest",
          artifacts: [{ index: 0, name: "workflow-latest-result.json" }],
          artifactCount: 1,
        },
      },
      runs: [
        {
          id: "run-listed",
          artifacts: [{ index: 0, name: "run-listed-result.json" }],
          artifactCount: 1,
        },
      ],
    });
    expect(runBody).toEqual({
      run: {
        id: "run-1",
        kind: "generate",
        artifacts: [{ index: 0, name: "run-1-result.json" }],
        artifactCount: 1,
      },
    });
    expect(workflowsBody).toEqual({
      summary: {
        total: 0,
        workflows: 0,
        counts: {},
        failed: 0,
        failedWorkflows: 0,
        running: 0,
        runningWorkflows: 0,
        latest: {
          id: "run-latest",
          artifacts: [{ index: 0, name: "run-latest-result.json" }],
          artifactCount: 1,
        },
        latestWorkflow: {
          id: "workflow-latest",
          artifacts: [{ index: 0, name: "workflow-latest-result.json" }],
          artifactCount: 1,
        },
      },
      workflows: [
        {
          id: "workflow-listed",
          artifacts: [{ index: 0, name: "workflow-listed-result.json" }],
          artifactCount: 1,
        },
      ],
    });
    expect(workflowDetailBody).toEqual({
      workflow: {
        id: "workflow-1",
        state: "active",
        artifacts: [{ index: 0, name: "workflow-1-manifest.json" }],
        artifactCount: 1,
      },
      runs: [
        {
          id: "run-workflow",
          artifacts: [{ index: 0, name: "run-workflow-result.json" }],
          artifactCount: 1,
        },
      ],
      tree: [
        {
          id: "run-parent",
          artifacts: [{ index: 0, name: "run-parent-result.json" }],
          artifactCount: 1,
          children: [
            {
              id: "run-child",
              artifacts: [{ index: 0, name: "run-child-result.json" }],
              artifactCount: 1,
            },
          ],
        },
      ],
    });
    expect(workflowBundleBody).toEqual({
      workflow: {
        id: "workflow-1",
        artifacts: [{ index: 0, name: "workflow-1-manifest.json" }],
        artifactCount: 1,
      },
      runs: [],
      manifest: { index: 0, name: "workflow-1-manifest.json" },
    });
    for (const body of [
      runsBody,
      runBody,
      workflowsBody,
      workflowDetailBody,
      workflowBundleBody,
    ]) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("/private/pipeline");
      expect(serialized).not.toContain("artifactPaths");
      expect(serialized).not.toContain("manifestPath");
    }
    expect(unsafeBundleGet).toBeNull();
  });

  it("serves opaque artifacts with private response headers", async () => {
    const context = createContext();
    const artifact = await handleCodegenRunsRoutes(
      context,
      new Request("http://localhost/codegen/runs/run-1/artifacts/0"),
      new URL("http://localhost/codegen/runs/run-1/artifacts/0"),
    );
    const missing = await handleCodegenRunsRoutes(
      context,
      new Request("http://localhost/codegen/runs/missing/artifacts/0"),
      new URL("http://localhost/codegen/runs/missing/artifacts/0"),
    );
    const invalid = await handleCodegenRunsRoutes(
      context,
      new Request("http://localhost/codegen/runs/run-1/artifacts/path"),
      new URL("http://localhost/codegen/runs/run-1/artifacts/path"),
    );

    expect(await artifact?.json()).toEqual({
      artifact: {
        runId: "run-1",
        index: 0,
        name: "result.json",
        kind: "json",
        mimeType: "application/json",
        sizeBytes: 11,
      },
      encoding: "utf8",
      content: '{"ok":true}',
    });
    expect(artifact?.headers.get("access-control-allow-origin")).toBeNull();
    expect(artifact?.headers.get("cache-control")).toBe("no-store");
    expect(artifact?.headers.get("x-content-type-options")).toBe("nosniff");
    expect(artifact?.headers.get("cross-origin-resource-policy")).toBe(
      "same-origin",
    );
    expect(missing?.status).toBe(404);
    expect(missing?.headers.get("access-control-allow-origin")).toBeNull();
    expect(invalid?.status).toBe(400);
  });

  it("validates generate input and records successful execution", async () => {
    const context = createContext();
    const missing = await handleCodegenGenerateRoutes(
      context,
      new Request("http://localhost/codegen/generate", {
        method: "POST",
        body: JSON.stringify({ projectName: "demo" }),
      }),
      new URL("http://localhost/codegen/generate"),
    );
    const valid = await handleCodegenGenerateRoutes(
      context,
      new Request("http://localhost/codegen/generate", {
        method: "POST",
        body: JSON.stringify({ projectName: "demo", prompt: "build it" }),
      }),
      new URL("http://localhost/codegen/generate"),
    );

    expect(missing?.status).toBe(400);
    expect(await missing?.json()).toEqual({
      error: "projectName and prompt are required",
    });
    expect(valid).not.toBeNull();
    if (!valid) {
      throw new Error("Expected a generation response");
    }
    const validBody = await valid.json();
    expect(validBody.run.kind).toBe("generate");
    const tasks = (
      context.services as unknown as {
        __events: ReturnType<typeof createOfficialOrchestratorTestFixture>;
      }
    ).__events.tasks;
    const task = tasks.get(validBody.taskId);
    expect(task?.messages[0]?.content).toContain("attached autocoder workflow");
  });

  it("runs research, PRD, QA, and github operations", async () => {
    const context = createContext();
    const research = await handleCodegenResearchRoutes(
      context,
      new Request("http://localhost/codegen/research", {
        method: "POST",
        body: JSON.stringify({
          projectName: "demo",
          description: "research this",
        }),
      }),
      new URL("http://localhost/codegen/research"),
    );
    const prd = await handleCodegenPRDRoutes(
      context,
      new Request("http://localhost/codegen/prd", {
        method: "POST",
        body: JSON.stringify({
          projectName: "demo",
          description: "make a PRD",
        }),
      }),
      new URL("http://localhost/codegen/prd"),
    );
    const qa = await handleCodegenQA(
      context,
      new Request("http://localhost/codegen/qa", {
        method: "POST",
        body: JSON.stringify({ projectPath: "/tmp/demo" }),
      }),
      new URL("http://localhost/codegen/qa"),
    );
    const created = await handleCodegenGithubRoutes(
      context,
      new Request("http://localhost/github/create", {
        method: "POST",
        body: JSON.stringify({ name: "demo-repo", private: false }),
      }),
      new URL("http://localhost/github/create"),
    );
    const deleted = await handleCodegenGithubRoutes(
      context,
      new Request("http://localhost/github/delete", {
        method: "POST",
        body: JSON.stringify({ name: "demo-repo" }),
      }),
      new URL("http://localhost/github/delete"),
    );

    const researchBody = await research?.json();
    const prdBody = await prd?.json();
    const qaBody = await qa?.json();
    const createdBody = await created?.json();
    const deletedBody = await deleted?.json();

    expect(researchBody?.run.kind).toBe("research");
    expect(prdBody?.researchRun.kind).toBe("research");
    expect(prdBody?.prdRun.kind).toBe("prd");
    expect(qaBody?.qa.qa).toBe(true);
    expect(createdBody?.repository).toEqual({
      experimental: true,
      executed: false,
      name: "demo-repo",
      private: false,
      status: "planned",
    });
    expect(deletedBody?.deleted).toEqual({
      experimental: true,
      executed: false,
      name: "demo-repo",
      status: "planned",
    });
  });

  it("cancels a running codegen run with an execution-lifecycle receipt", async () => {
    const context = createCancellableRunContext("running");
    const response = await handleCodegenRunsRoutes(
      context.context,
      new Request("http://localhost/codegen/runs/generate-demo-123/cancel", {
        method: "POST",
      }),
      new URL("http://localhost/codegen/runs/generate-demo-123/cancel"),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      run: { id: "generate-demo-123", status: "cancelled" },
      cancellation: {
        requested: true,
        applied: true,
        alreadyCancelled: false,
        locallyActive: false,
        executionTerminationSupported: true,
        executionTerminated: false,
      },
    });
    expect(context.cancelCalls).toEqual([
      { id: "generate-demo-123", reason: "cancelled by API request" },
    ]);
  });

  it("treats cancellation of an already-cancelled run as idempotent", async () => {
    const context = createCancellableRunContext("cancelled");
    const response = await handleCodegenRunsRoutes(
      context.context,
      new Request("http://localhost/codegen/runs/generate-demo-123/cancel", {
        method: "POST",
      }),
      new URL("http://localhost/codegen/runs/generate-demo-123/cancel"),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      run: { id: "generate-demo-123", status: "cancelled" },
      cancellation: {
        applied: false,
        alreadyCancelled: true,
        locallyActive: false,
        executionTerminationSupported: true,
        executionTerminated: false,
      },
    });
    expect(context.cancelCalls).toEqual([]);
  });

  it("aborts the active local execution behind a running route receipt", async () => {
    const service = new AutocoderPipelineService(
      mkdtempSync(join(tmpdir(), "doolittle-codegen-route-")),
    );
    const workflow = service.startWorkflow({
      title: "Active route cancellation",
      objective: "Abort the local execution",
      kind: "generate",
    });
    const run = service.startRun({
      workflowId: workflow.id,
      kind: "generate",
      request: { prompt: "wait" },
    });
    const execution = service.executeRun(run.id, (signal) => {
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    await Promise.resolve();
    const context = {
      services: { autocoderPipeline: service },
    } as unknown as AppContext;

    const response = await handleCodegenRunsRoutes(
      context,
      new Request(`http://localhost/codegen/runs/${run.id}/cancel`, {
        method: "POST",
      }),
      new URL(`http://localhost/codegen/runs/${run.id}/cancel`),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      run: { id: run.id, status: "cancelled" },
      cancellation: {
        requested: true,
        applied: true,
        alreadyCancelled: false,
        locallyActive: true,
        executionTerminationSupported: true,
        executionTerminated: true,
      },
    });
    await expect(execution).rejects.toBeInstanceOf(AutocoderRunCancelledError);
  });

  it("rejects invalid and missing codegen run identifiers", async () => {
    const context = createCancellableRunContext("running");
    const invalid = await handleCodegenRunsRoutes(
      context.context,
      new Request("http://localhost/codegen/runs/%2Fetc%2Fpasswd/cancel", {
        method: "POST",
      }),
      new URL("http://localhost/codegen/runs/%2Fetc%2Fpasswd/cancel"),
    );
    const missing = await handleCodegenRunsRoutes(
      context.context,
      new Request("http://localhost/codegen/runs/generate-missing-123/cancel", {
        method: "POST",
      }),
      new URL("http://localhost/codegen/runs/generate-missing-123/cancel"),
    );

    expect(invalid?.status).toBe(400);
    expect(await invalid?.json()).toEqual({
      error: "Autocoder run identifier is invalid.",
    });
    expect(missing?.status).toBe(404);
    expect(await missing?.json()).toEqual({
      error: "Autocoder pipeline run not found.",
    });
    expect(context.cancelCalls).toEqual([]);
  });

  it("does not rewrite terminal codegen run state when cancellation is requested", async () => {
    const context = createCancellableRunContext("completed");
    const response = await handleCodegenRunsRoutes(
      context.context,
      new Request("http://localhost/codegen/runs/generate-demo-123/cancel", {
        method: "POST",
      }),
      new URL("http://localhost/codegen/runs/generate-demo-123/cancel"),
    );

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      error:
        "Autocoder pipeline run is already completed and cannot be cancelled.",
      run: { id: "generate-demo-123", status: "completed" },
    });
    expect(context.cancelCalls).toEqual([]);
  });
});

function createCancellableRunContext(status: string): {
  context: AppContext;
  cancelCalls: Array<{ id: string; reason: string }>;
} {
  const run = {
    id: "generate-demo-123",
    workflowId: "workflow-demo-123",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    startedAt: "2026-07-27T00:00:00.000Z",
    phase: "generate",
    kind: "generate",
    status,
    input: {},
    outputPreview: status,
    artifactPaths: [],
  };
  const cancelCalls: Array<{ id: string; reason: string }> = [];
  const context = {
    services: {
      autocoderPipeline: {
        get: (id: string) => (id === run.id ? run : undefined),
        cancelRunExecution: (id: string, reason: string) => {
          cancelCalls.push({ id, reason });
          run.status = "cancelled";
          run.outputPreview = "cancelled";
          return {
            run,
            applied: true,
            alreadyCancelled: false,
            locallyActive: false,
            executionTerminationSupported: true,
            executionTerminated: false,
          };
        },
      },
    },
  } as unknown as AppContext;
  return { context, cancelCalls };
}
