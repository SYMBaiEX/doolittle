import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleCodegenRoutes } from "./codegen";

function createContext(): AppContext {
  let taskCounter = 0;
  let workflowCounter = 0;
  let runCounter = 0;
  const completions: Array<{ id: string; note?: string }> = [];
  const failures: Array<{ id: string; note?: string }> = [];
  const notes: Array<{ id: string; note: string }> = [];

  return {
    runtime: {
      getService: (service: string) => {
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
              name,
              private: isPrivate,
            }),
            deleteRepository: async (name: string) => ({
              name,
              deleted: true,
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
        record: (input: Record<string, unknown>) => ({
          ...input,
          id: `run-${++runCounter}`,
        }),
        summary: () => ({ total: runCounter }),
        list: () => [{ id: "run-listed" }],
        listWorkflows: () => [{ id: "workflow-listed" }],
        get: (id: string) => ({ id, kind: "generate" }),
        workflow: (id: string) => ({ id, state: "active" }),
        bundleWorkflow: (id: string) => ({ id, bundle: true }),
      },
      delegation: {
        create: () => ({ id: `task-${++taskCounter}` }),
        markRunning: () => undefined,
        addNote: (id: string, note: string) => {
          notes.push({ id, note });
        },
        complete: (id: string, note?: string) => {
          completions.push({ id, note });
        },
        fail: (id: string, note?: string) => {
          failures.push({ id, note });
        },
      },
      __events: {
        completions,
        failures,
        notes,
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
      new Request("http://localhost/codegen/workflows/workflow-1/bundle"),
      new URL("http://localhost/codegen/workflows/workflow-1/bundle"),
    );
    const runtimeBody = await runtime?.json();
    const runsBody = await runs?.json();
    const workflowsBody = await workflows?.json();
    const runDetailBody = await runDetail?.json();
    const workflowBundleBody = await workflowBundle?.json();

    expect(runtimeBody?.execution.codeGeneration.available).toBe(true);
    expect(runsBody?.runs).toEqual([{ id: "run-listed" }]);
    expect(workflowsBody?.workflows).toEqual([{ id: "workflow-listed" }]);
    expect(runDetailBody?.run).toEqual({
      id: "run-1",
      kind: "generate",
    });
    expect(workflowBundleBody).toEqual({
      id: "workflow-1",
      bundle: true,
    });
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
      completions: Array<{ id: string; note?: string }>;
      notes: Array<{ id: string; note: string }>;
    };

    expect(invalid?.status).toBe(400);
    expect(await invalid?.json()).toEqual({
      error: "projectName and prompt are required",
    });
    expect(body.generation.generated).toBe(true);
    expect(body.run.kind).toBe("generate");
    expect(events.notes[0]?.note).toContain("attached autocoder workflow");
    expect(events.completions[0]?.note).toContain(
      "system: code generation completed",
    );
  });

  it("runs PRD workflows and repository mutations", async () => {
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
      name: "demo-repo",
      private: false,
    });
    expect(deletedBody.deleted).toEqual({
      name: "demo-repo",
      deleted: true,
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
