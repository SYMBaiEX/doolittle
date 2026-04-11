import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSandboxRoutes } from "./sandbox";

function createContext(): AppContext {
  return {
    runtime: {
      getService: (name: string) => {
        if (name === "e2b") {
          return {
            listSandboxes: () => [{ id: "sandbox-1", path: "/tmp/sandbox-1" }],
            createSandbox: (options?: Record<string, unknown>) => ({
              id: "sandbox-new",
              options,
            }),
            killSandbox: async (id?: string) => ({ id: id ?? "active" }),
            executeCode: async (code: string, language: string) => ({
              code,
              language,
              ok: true,
            }),
          };
        }
        return undefined;
      },
      getAllActions: () => [],
    },
  } as unknown as AppContext;
}

describe("handleSandboxRoutes", () => {
  it("returns runtime and sandbox summaries", async () => {
    const context = createContext();
    const runtime = await handleSandboxRoutes(
      context,
      new Request("http://localhost/runtime/e2b"),
      new URL("http://localhost/runtime/e2b"),
    );
    const sandboxes = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/sandboxes"),
      new URL("http://localhost/e2b/sandboxes"),
    );

    expect(await runtime?.json()).toHaveProperty("e2b");
    expect(await sandboxes?.json()).toHaveProperty("sandboxes");
  });

  it("validates and executes sandbox code", async () => {
    const missingCode = await handleSandboxRoutes(
      createContext(),
      new Request("http://localhost/e2b/execute", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/e2b/execute"),
    );
    const execute = await handleSandboxRoutes(
      createContext(),
      new Request("http://localhost/e2b/execute", {
        method: "POST",
        body: JSON.stringify({ code: "print('hi')", language: "python" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/e2b/execute"),
    );

    expect(missingCode?.status).toBe(400);
    await expect(missingCode?.json()).resolves.toEqual({
      error: "code is required",
    });
    expect(await execute?.json()).toHaveProperty("result");
  });

  it("creates and kills sandboxes", async () => {
    const context = createContext();
    const create = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/sandboxes", {
        method: "POST",
        body: JSON.stringify({ template: "python" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/e2b/sandboxes"),
    );
    const kill = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/kill", {
        method: "POST",
        body: JSON.stringify({ id: "sandbox-1" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/e2b/kill"),
    );
    const createBody = await create?.json();
    const killBody = await kill?.json();

    expect(createBody).toHaveProperty("sandboxId");
    expect(createBody).toHaveProperty("sandboxes");
    expect(killBody).toHaveProperty("killed", "sandbox-1");
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleSandboxRoutes(
      createContext(),
      new Request("http://localhost/not-sandbox"),
      new URL("http://localhost/not-sandbox"),
    );

    expect(response).toBeNull();
  });
});
