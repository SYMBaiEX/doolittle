import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { handleCodegenCommand } from "./index";

function createContext(): AgentExecutionContext {
  let taskCounter = 0;
  let workflowCounter = 0;
  let runCounter = 0;
  const completions: Array<{ id: string; note?: string }> = [];
  const failures: Array<{ id: string; note?: string }> = [];

  return {
    runtime: {
      getService: (service: string) => {
        if (service === "e2b") {
          return {
            listSandboxes: () => [{ id: "sandbox-1", path: "/tmp/sandbox-1" }],
            createSandbox: async (input: { template?: string }) =>
              input.template ? `sandbox:${input.template}` : "sandbox:new",
            killSandbox: async () => undefined,
            executeCode: async (code: string, language: string) => ({
              code,
              language,
            }),
          };
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
              name,
              private: isPrivate,
            }),
            deleteRepository: async (name: string) => ({
              name,
              deleted: true,
            }),
          };
        }
        if (service === "secrets-manager") {
          return {
            listSecretKeys: async () => ["OPENAI_API_KEY"],
            getSecret: async (key: string) => `value:${key}`,
            setSecret: async () => undefined,
          };
        }
        return undefined;
      },
    },
    services: {
      sessions: {
        listSessions: () => [{ sessionId: "cli:test-session" }],
      },
      delegation: {
        create: () => ({ id: `task-${++taskCounter}` }),
        markRunning: () => undefined,
        addNote: () => undefined,
        complete: (id: string, note?: string) => {
          completions.push({ id, note });
        },
        fail: (id: string, note?: string) => {
          failures.push({ id, note });
        },
      },
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
        list: () => [{ id: "run-1" }],
        listWorkflows: () => [{ id: "workflow-1" }],
        get: (id: string) => ({ id, kind: "generate" }),
        workflow: (id: string) => ({ id, state: "active" }),
        bundleWorkflow: (id: string) => ({ id, bundle: true }),
      },
      __events: {
        completions,
        failures,
      },
    },
  } as unknown as AgentExecutionContext;
}

describe("codegen command router", () => {
  it("reports sandbox inventory and executes sandbox code", async () => {
    const context = createContext();
    const listed = await handleCodegenCommand("/e2b", context);
    const created = await handleCodegenCommand("/e2b create python", context);
    const killed = await handleCodegenCommand("/e2b kill sandbox-1", context);
    const executed = await handleCodegenCommand(
      "/e2b exec python :: print('hi')",
      context,
    );
    const runtime = await handleCodegenCommand("/runtime codegen", context);

    expect(listed).toContain('"sandbox-1"');
    expect(created).toContain('"sandbox:python"');
    expect(killed).toContain('"killed": "sandbox-1"');
    expect(executed).toContain('"language": "python"');
    expect(runtime).toContain('"codeGeneration"');
  });

  it("runs code generation and research/prd workflows", async () => {
    const context = createContext();
    const generated = await handleCodegenCommand(
      "/codegen generate demo :: ship it",
      context,
    );
    const researched = await handleCodegenCommand(
      "/codegen research demo | type:plugin | apis:github :: investigate",
      context,
    );
    const prd = await handleCodegenCommand(
      "/codegen prd demo | type:plugin | requirements:qa :: spec this",
      context,
    );
    const qa = await handleCodegenCommand("/codegen qa packages/demo", context);

    expect(generated).toContain('"generated": true');
    expect(researched).toContain('"researched": true');
    expect(prd).toContain('"prd": true');
    expect(prd).toContain('"parentRunId": "run-3"');
    expect(qa).toContain('"qa": true');
  });

  it("manages github and secrets flows with workflow tracking", async () => {
    const context = createContext();
    const created = await handleCodegenCommand(
      "/github create demo-repo | private:false",
      context,
    );
    const deleted = await handleCodegenCommand(
      "/github delete demo-repo",
      context,
    );
    const keys = await handleCodegenCommand("/secrets list", context);
    const fetched = await handleCodegenCommand(
      "/secrets get OPENAI_API_KEY",
      context,
    );
    const stored = await handleCodegenCommand(
      "/secrets set OPENAI_API_KEY :: secret-value",
      context,
    );
    const events = (context.services as unknown as { __events: unknown })
      .__events as {
      completions: Array<{ id: string; note?: string }>;
      failures: Array<{ id: string; note?: string }>;
    };

    expect(created).toContain('"private": false');
    expect(deleted).toContain('"deleted": true');
    expect(keys).toContain("OPENAI_API_KEY");
    expect(fetched).toContain("value:OPENAI_API_KEY");
    expect(stored).toContain('"valueSet": true');
    expect(events.completions.length).toBeGreaterThan(0);
    expect(events.failures).toHaveLength(0);
  });

  it("lists stored codegen runs and returns usage guidance", async () => {
    const context = createContext();
    const runs = await handleCodegenCommand("/codegen runs", context);
    const workflows = await handleCodegenCommand("/codegen workflows", context);
    const show = await handleCodegenCommand("/codegen show run-1", context);
    const workflow = await handleCodegenCommand(
      "/codegen workflow workflow-1",
      context,
    );
    const bundle = await handleCodegenCommand(
      "/codegen bundle workflow-1",
      context,
    );
    const usage = await handleCodegenCommand(
      "/codegen research missing-prompt",
      context,
    );

    expect(runs).toContain('"run-1"');
    expect(workflows).toContain('"workflow-1"');
    expect(show).toContain('"kind": "generate"');
    expect(workflow).toContain('"state": "active"');
    expect(bundle).toContain('"bundle": true');
    expect(usage).toBe(
      "Usage: /codegen research <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>",
    );
  });
});
