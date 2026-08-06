import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { createOfficialOrchestratorTestFixture } from "@/testing/official-orchestrator";
import { handleCodegenRoutes } from "./codegen";

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
        workflow: (id: string) => ({
          workflow: {
            id,
            state: "active",
            artifactPaths: [`/private/pipeline/${id}-manifest.json`],
          },
          runs: [],
          tree: [],
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

describe("handleCodegenRoutes", () => {
  it("returns runtime, list, detail, and bundle payloads", async () => {
    const context = createContext();

    const runtime = await handleCodegenRoutes(
      context,
      new Request("http://localhost/runtime/codegen"),
      new URL("http://localhost/runtime/codegen"),
    );
    const runs = await handleCodegenRoutes(
      context,
      new Request("http://localhost/codegen/runs"),
      new URL("http://localhost/codegen/runs"),
    );
    const workflows = await handleCodegenRoutes(
      context,
      new Request("http://localhost/codegen/workflows"),
      new URL("http://localhost/codegen/workflows"),
    );
    const runDetail = await handleCodegenRoutes(
      context,
      new Request("http://localhost/codegen/runs/run-1"),
      new URL("http://localhost/codegen/runs/run-1"),
    );
    const workflowBundle = await handleCodegenRoutes(
      context,
      new Request("http://localhost/codegen/workflows/workflow-1/bundle", {
        method: "POST",
      }),
      new URL("http://localhost/codegen/workflows/workflow-1/bundle"),
    );
    const unsafeBundleGet = await handleCodegenRoutes(
      context,
      new Request("http://localhost/codegen/workflows/workflow-1/bundle"),
      new URL("http://localhost/codegen/workflows/workflow-1/bundle"),
    );
    const runtimeBody = await runtime?.json();
    const runsBody = await runs?.json();
    const workflowsBody = await workflows?.json();
    const runDetailBody = await runDetail?.json();
    const workflowBundleBody = await workflowBundle?.json();

    expect(runtimeBody?.execution.codeGeneration.available).toBe(true);
    expect(runsBody?.runs).toEqual([
      {
        id: "run-listed",
        artifacts: [{ index: 0, name: "run-listed-result.json" }],
        artifactCount: 1,
      },
    ]);
    expect(workflowsBody?.workflows).toEqual([
      {
        id: "workflow-listed",
        artifacts: [{ index: 0, name: "workflow-listed-result.json" }],
        artifactCount: 1,
      },
    ]);
    expect(runDetailBody?.run).toEqual({
      id: "run-1",
      kind: "generate",
      artifacts: [{ index: 0, name: "run-1-result.json" }],
      artifactCount: 1,
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
      workflowsBody,
      runDetailBody,
      workflowBundleBody,
    ]) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("/private/pipeline");
      expect(serialized).not.toContain("artifactPaths");
      expect(serialized).not.toContain("manifestPath");
    }
    expect(unsafeBundleGet).toBeNull();
  });

  it("validates and executes code generation workflows", async () => {
    const context = createContext();

    const invalid = await handleCodegenRoutes(
      context,
      new Request("http://localhost/codegen/generate", {
        method: "POST",
        body: JSON.stringify({ projectName: "demo" }),
      }),
      new URL("http://localhost/codegen/generate"),
    );
    const valid = await handleCodegenRoutes(
      context,
      new Request("http://localhost/codegen/generate", {
        method: "POST",
        body: JSON.stringify({ projectName: "demo", prompt: "build it" }),
      }),
      new URL("http://localhost/codegen/generate"),
    );
    const body = await valid?.json();
    const events = (context.services as unknown as { __events: unknown })
      .__events as {
      tasks: ReturnType<typeof createOfficialOrchestratorTestFixture>["tasks"];
    };
    const task = events.tasks.get(body.taskId);

    expect(invalid?.status).toBe(400);
    expect(await invalid?.json()).toEqual({
      error: "projectName and prompt are required",
    });
    expect(body.generation.generated).toBe(true);
    expect(body.run.kind).toBe("generate");
    expect(task?.messages[0]?.content).toContain("attached autocoder workflow");
    expect(task?.status).toBe("done");
    expect(task?.summary).toContain("system: code generation completed");
  });

  it("runs PRD workflows and repository-operation plans", async () => {
    const context = createContext();

    const prd = await handleCodegenRoutes(
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
    const created = await handleCodegenRoutes(
      context,
      new Request("http://localhost/github/create", {
        method: "POST",
        body: JSON.stringify({ name: "demo-repo", private: false }),
      }),
      new URL("http://localhost/github/create"),
    );
    const deleted = await handleCodegenRoutes(
      context,
      new Request("http://localhost/github/delete", {
        method: "POST",
        body: JSON.stringify({ name: "demo-repo" }),
      }),
      new URL("http://localhost/github/delete"),
    );

    const prdBody = await prd?.json();
    const createdBody = await created?.json();
    const deletedBody = await deleted?.json();

    expect(prdBody.researchRun.kind).toBe("research");
    expect(prdBody.prdRun.kind).toBe("prd");
    expect(prdBody.prdRun.parentRunId).toBe(prdBody.researchRun.id);
    expect(createdBody.repository).toEqual({
      experimental: true,
      executed: false,
      name: "demo-repo",
      private: false,
      status: "planned",
    });
    expect(deletedBody.deleted).toEqual({
      experimental: true,
      executed: false,
      name: "demo-repo",
      status: "planned",
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleCodegenRoutes(
      createContext(),
      new Request("http://localhost/not-codegen"),
      new URL("http://localhost/not-codegen"),
    );

    expect(response).toBeNull();
  });
});
