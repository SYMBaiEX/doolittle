import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSecretsRoutes } from "./secrets";

function createContext(options?: { failSet?: boolean }): AppContext {
  let taskCounter = 0;
  let workflowCounter = 0;
  let runCounter = 0;
  const completions: Array<{ id: string; note?: string }> = [];
  const failures: Array<{ id: string; note?: string }> = [];
  const notes: Array<{ id: string; note: string }> = [];

  return {
    runtime: {
      getService: (service: string) => {
        if (service === "secrets-manager") {
          return {
            listSecretKeys: async () => ["OPENAI_API_KEY"],
            getSecret: async (key: string) => `value:${key}`,
            setSecret: async (key: string, value: string) => {
              if (options?.failSet) {
                throw new Error(`failed:${key}`);
              }
              return { key, value, stored: true };
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
      completions: Array<{ id: string; note?: string }>;
      notes: Array<{ id: string; note: string }>;
    };

    expect(body?.key).toBe("OPENAI_API_KEY");
    expect(body?.valueSet).toBe(true);
    expect(body?.run.kind).toBe("secret.set");
    expect(events.notes[0]?.note).toContain("attached autocoder workflow");
    expect(events.completions[0]?.note).toContain("system: secret stored");
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
      failures: Array<{ id: string; note?: string }>;
    };
    expect(events.failures[0]?.note).toContain("failed:OPENAI_API_KEY");
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
