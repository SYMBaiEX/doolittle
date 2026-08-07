import { SECRETS_SERVICE_TYPE } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { createOfficialOrchestratorTestFixture } from "@/testing/official-orchestrator";
import { handleSecretsRoutes } from "./secrets";

function createContext(options?: { failSet?: boolean }): AppContext {
  let workflowCounter = 0;
  let runCounter = 0;
  const official = createOfficialOrchestratorTestFixture();

  return {
    runtime: {
      agentId: "00000000-0000-4000-8000-000000000001",
      getService: (service: string) => {
        if (service === "ORCHESTRATOR_TASK_SERVICE") {
          return official.service;
        }
        if (service === SECRETS_SERVICE_TYPE) {
          return {
            list: async () => ({ OPENAI_API_KEY: {} }),
            getGlobal: async (key: string) => `value:${key}`,
            setGlobal: async (key: string, value: string) => {
              if (options?.failSet) {
                throw new Error(`failed:${key}`);
              }
              return Boolean(value);
            },
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
      },
      __events: {
        tasks: official.tasks,
      },
    },
  } as unknown as AppContext;
}

describe("handleSecretsRoutes", () => {
  it("lists and reads secrets", async () => {
    const context = createContext();
    const list = await handleSecretsRoutes(
      context,
      new Request("http://localhost/secrets"),
      new URL("http://localhost/secrets"),
    );
    const get = await handleSecretsRoutes(
      context,
      new Request("http://localhost/secrets/get", {
        method: "POST",
        body: JSON.stringify({ key: "OPENAI_API_KEY" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/secrets/get"),
    );

    await expect(list?.json()).resolves.toEqual({
      keys: ["OPENAI_API_KEY"],
    });
    await expect(get?.json()).resolves.toEqual({
      key: "OPENAI_API_KEY",
      value: "value:OPENAI_API_KEY",
    });
  });

  it("validates required secret payloads", async () => {
    const missingGet = await handleSecretsRoutes(
      createContext(),
      new Request("http://localhost/secrets/get", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/secrets/get"),
    );
    const missingSet = await handleSecretsRoutes(
      createContext(),
      new Request("http://localhost/secrets/set", {
        method: "POST",
        body: JSON.stringify({ key: "OPENAI_API_KEY" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/secrets/set"),
    );

    expect(missingGet?.status).toBe(400);
    await expect(missingGet?.json()).resolves.toEqual({
      error: "key is required",
    });
    expect(missingSet?.status).toBe(400);
    await expect(missingSet?.json()).resolves.toEqual({
      error: "key and value are required",
    });
  });

  it("stores secrets and records the workflow lifecycle", async () => {
    const context = createContext();
    const response = await handleSecretsRoutes(
      context,
      new Request("http://localhost/secrets/set", {
        method: "POST",
        body: JSON.stringify({ key: "OPENAI_API_KEY", value: "secret" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/secrets/set"),
    );
    const body = await response?.json();
    const events = (context.services as unknown as { __events: unknown })
      .__events as {
      tasks: ReturnType<typeof createOfficialOrchestratorTestFixture>["tasks"];
    };
    const task = events.tasks.get(body?.taskId);

    expect(body?.key).toBe("OPENAI_API_KEY");
    expect(body?.valueSet).toBe(true);
    expect(body?.run.kind).toBe("secret.set");
    expect(task?.messages[0]?.content).toContain("attached autocoder workflow");
    expect(task?.status).toBe("done");
    expect(task?.summary).toContain("system: secret stored");
  });

  it("fails the workflow and rethrows when secret storage fails", async () => {
    const context = createContext({ failSet: true });

    await expect(
      handleSecretsRoutes(
        context,
        new Request("http://localhost/secrets/set", {
          method: "POST",
          body: JSON.stringify({ key: "OPENAI_API_KEY", value: "secret" }),
          headers: { "content-type": "application/json" },
        }),
        new URL("http://localhost/secrets/set"),
      ),
    ).rejects.toThrow("failed:OPENAI_API_KEY");

    const events = (context.services as unknown as { __events: unknown })
      .__events as {
      tasks: ReturnType<typeof createOfficialOrchestratorTestFixture>["tasks"];
    };
    const [task] = events.tasks.values();
    expect(task?.paused).toBe(true);
    expect(task?.messages.at(-1)?.content).toContain("failed:OPENAI_API_KEY");
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleSecretsRoutes(
      createContext(),
      new Request("http://localhost/not-secrets"),
      new URL("http://localhost/not-secrets"),
    );

    expect(response).toBeNull();
  });
});
