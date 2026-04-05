import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleCodegenGenerateRoutes } from "./handlers/generate";
import { handleCodegenGithubRoutes } from "./handlers/github";
import { handleCodegenPRDRoutes } from "./handlers/prd";
import { handleCodegenQA } from "./handlers/qa";
import { handleCodegenResearchRoutes } from "./handlers/research";
import { handleCodegenRunsRoutes } from "./handlers/runs";
import { handleCodegenRuntimeRoutes } from "./handlers/runtime";
import { handleCodegenWorkflowsRoutes } from "./handlers/workflows";

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
    const workflowBundle = await handleCodegenWorkflowsRoutes(
      context,
      new Request("http://localhost/codegen/workflows/workflow-1/bundle"),
      new URL("http://localhost/codegen/workflows/workflow-1/bundle"),
    );

    const runtimeBody = await runtime?.json();
    expect(runtimeBody?.execution?.codeGeneration?.available).toBe(true);
    expect(await runs?.json()).toEqual({
      summary: { total: 0 },
      runs: [{ id: "run-listed" }],
    });
    expect(await run?.json()).toEqual({
      run: { id: "run-1", kind: "generate" },
    });
    expect(await workflows?.json()).toEqual({
      summary: { total: 0 },
      workflows: [{ id: "workflow-listed" }],
    });
    expect(await workflowBundle?.json()).toEqual({
      id: "workflow-1",
      bundle: true,
    });
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
    const notes = (
      context.services as unknown as {
        __events: { notes: Array<{ note: string }> };
      }
    ).__events.notes;
    expect(notes[0]?.note).toContain("attached autocoder workflow");
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
      name: "demo-repo",
      private: false,
    });
    expect(deletedBody?.deleted).toEqual({
      name: "demo-repo",
      deleted: true,
    });
  });
});
