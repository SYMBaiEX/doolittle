import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSandboxRoutes } from "./sandbox";

function createContext(): AppContext {
  return {
    runtime: {
      getService: (name: string) => {
        if (name === "doolittle_local_sandbox") {
          return {
            listSandboxes: () => [{ id: "sandbox-1", path: "/tmp/sandbox-1" }],
            createSandbox: (options?: Record<string, unknown>) => ({
              id: "sandbox-new",
              options,
            }),
            killSandbox: async (id?: string) => ({ id: id ?? "active" }),
            executeCode: async (
              code: string,
              language: string,
              sandboxId?: string,
            ) => ({
              code,
              language,
              sandboxId,
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

function createServiceCountingContext() {
  let serviceCalls = 0;
  const context = {
    runtime: {
      getService: () => {
        serviceCalls += 1;
        throw new Error("Invalid requests must not reach the sandbox service");
      },
    },
  } as unknown as AppContext;

  return { context, serviceCalls: () => serviceCalls };
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
        body: JSON.stringify({
          code: "print('hi')",
          language: "python",
          sandboxId: "sandbox-1",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/e2b/execute"),
    );

    expect(missingCode?.status).toBe(400);
    await expect(missingCode?.json()).resolves.toEqual({
      error: "code is required",
    });
    await expect(execute?.json()).resolves.toMatchObject({
      result: { sandboxId: "sandbox-1" },
    });
  });

  it("rejects malformed sandbox request bodies before resolving the service", async () => {
    const requests = [
      {
        pathname: "/e2b/sandboxes",
        body: "{",
        error: "Request body must be valid JSON",
      },
      {
        pathname: "/e2b/sandboxes",
        body: "null",
        error: "Request body must be a JSON object",
      },
      {
        pathname: "/e2b/execute",
        body: "[]",
        error: "Request body must be a JSON object",
      },
      {
        pathname: "/e2b/sandboxes",
        body: JSON.stringify({ template: 1 }),
        error: "template must be a non-empty string",
      },
      {
        pathname: "/e2b/sandboxes",
        body: JSON.stringify({ template: "" }),
        error: "template must be a non-empty string",
      },
      {
        pathname: "/e2b/sandboxes",
        body: JSON.stringify({ metadata: null }),
        error: "metadata must be a plain object with string values",
      },
      {
        pathname: "/e2b/sandboxes",
        body: JSON.stringify({ metadata: { team: 1 } }),
        error: "metadata must be a plain object with string values",
      },
      {
        pathname: "/e2b/sandboxes",
        body: JSON.stringify({ metadata: [] }),
        error: "metadata must be a plain object with string values",
      },
      {
        pathname: "/e2b/execute",
        body: JSON.stringify({ code: 1 }),
        error: "code must be a non-empty string",
      },
      {
        pathname: "/e2b/execute",
        body: JSON.stringify({ code: "" }),
        error: "code must be a non-empty string",
      },
      {
        pathname: "/e2b/execute",
        body: JSON.stringify({ code: "ok", language: 1 }),
        error: "language must be a non-empty string",
      },
      {
        pathname: "/e2b/execute",
        body: JSON.stringify({ code: "ok", language: "" }),
        error: "language must be a non-empty string",
      },
      {
        pathname: "/e2b/execute",
        body: JSON.stringify({ code: "ok", sandboxId: 1 }),
        error: "sandboxId must be a non-empty string",
      },
      {
        pathname: "/e2b/execute",
        body: JSON.stringify({ code: "ok", sandboxId: "" }),
        error: "sandboxId must be a non-empty string",
      },
      {
        pathname: "/e2b/kill",
        body: JSON.stringify({ id: 1 }),
        error: "id must be a non-empty string",
      },
      {
        pathname: "/e2b/kill",
        body: JSON.stringify({ id: "" }),
        error: "id must be a non-empty string",
      },
    ];

    for (const { pathname, body, error } of requests) {
      const service = createServiceCountingContext();
      const response = await handleSandboxRoutes(
        service.context,
        new Request(`http://localhost${pathname}`, { method: "POST", body }),
        new URL(`http://localhost${pathname}`),
      );

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toEqual({ error });
      expect(service.serviceCalls()).toBe(0);
    }
  });

  it("preserves execute code text exactly", async () => {
    const response = await handleSandboxRoutes(
      createContext(),
      new Request("http://localhost/e2b/execute", {
        method: "POST",
        body: JSON.stringify({ code: "  print('exact')\n" }),
      }),
      new URL("http://localhost/e2b/execute"),
    );

    await expect(response?.json()).resolves.toMatchObject({
      result: { code: "  print('exact')\n", language: "python" },
    });
  });

  it("maps unknown sandbox execute and kill targets to 404", async () => {
    const missing = Object.assign(new Error("Sandbox not found: missing"), {
      code: "SANDBOX_NOT_FOUND",
    });
    const context = {
      runtime: {
        getService: () => ({
          listSandboxes: () => [],
          executeCode: async () => {
            throw missing;
          },
          killSandbox: async () => {
            throw missing;
          },
        }),
      },
    } as unknown as AppContext;

    const execute = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/execute", {
        method: "POST",
        body: JSON.stringify({ code: "print('no')", sandboxId: "missing" }),
      }),
      new URL("http://localhost/e2b/execute"),
    );
    const kill = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/kill", {
        method: "POST",
        body: JSON.stringify({ id: "missing" }),
      }),
      new URL("http://localhost/e2b/kill"),
    );

    expect(execute?.status).toBe(404);
    expect(kill?.status).toBe(404);
    await expect(execute?.json()).resolves.toMatchObject({
      code: "SANDBOX_NOT_FOUND",
    });
  });

  it("maps unsupported templates to 400", async () => {
    const context = {
      runtime: {
        getService: () => ({
          listSandboxes: () => [],
          createSandbox: async () => {
            throw Object.assign(
              new Error("Unsupported sandbox template: ruby"),
              { code: "UNSUPPORTED_SANDBOX_TEMPLATE" },
            );
          },
        }),
      },
    } as unknown as AppContext;

    const response = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/sandboxes", {
        method: "POST",
        body: JSON.stringify({ template: "ruby" }),
      }),
      new URL("http://localhost/e2b/sandboxes"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "Unsupported sandbox template: ruby",
      code: "UNSUPPORTED_SANDBOX_TEMPLATE",
      supportedTemplates: ["node-js", "python"],
    });
  });

  it("maps a closing sandbox to 409", async () => {
    const closing = Object.assign(new Error("Sandbox is closing: sandbox-1"), {
      code: "SANDBOX_CLOSING",
    });
    const context = {
      runtime: {
        getService: () => ({
          listSandboxes: () => [],
          executeCode: async () => {
            throw closing;
          },
        }),
      },
    } as unknown as AppContext;

    const response = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/execute", {
        method: "POST",
        body: JSON.stringify({ code: "print('later')" }),
      }),
      new URL("http://localhost/e2b/execute"),
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({
      error: "Sandbox is closing: sandbox-1",
      code: "SANDBOX_CLOSING",
    });
  });

  it("maps sandbox ownership conflicts from create and execute to 409", async () => {
    const conflict = Object.assign(
      new Error("Sandbox is owned by another live session: sandbox-1"),
      { code: "SANDBOX_OWNERSHIP_CONFLICT" },
    );
    const context = {
      runtime: {
        getService: () => ({
          listSandboxes: () => [],
          createSandbox: async () => {
            throw conflict;
          },
          executeCode: async () => {
            throw conflict;
          },
        }),
      },
    } as unknown as AppContext;

    const create = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/sandboxes", {
        method: "POST",
        body: JSON.stringify({ template: "python" }),
      }),
      new URL("http://localhost/e2b/sandboxes"),
    );
    const execute = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/execute", {
        method: "POST",
        body: JSON.stringify({ code: "print('after stop')" }),
      }),
      new URL("http://localhost/e2b/execute"),
    );

    for (const response of [create, execute]) {
      expect(response?.status).toBe(409);
      await expect(response?.json()).resolves.toEqual({
        error: "Sandbox is owned by another live session: sandbox-1",
        code: "SANDBOX_OWNERSHIP_CONFLICT",
      });
    }
  });

  it("maps unverified sandbox cleanup to 409", async () => {
    const cleanupFailure = Object.assign(
      new Error("Sandbox cleanup could not be verified: sandbox-1"),
      { code: "SANDBOX_CLEANUP_UNVERIFIED" },
    );
    const context = {
      runtime: {
        getService: () => ({
          listSandboxes: () => [],
          killSandbox: async () => {
            throw cleanupFailure;
          },
        }),
      },
    } as unknown as AppContext;

    const response = await handleSandboxRoutes(
      context,
      new Request("http://localhost/e2b/kill", {
        method: "POST",
        body: JSON.stringify({ id: "sandbox-1" }),
      }),
      new URL("http://localhost/e2b/kill"),
    );

    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toEqual({
      error: "Sandbox cleanup could not be verified: sandbox-1",
      code: "SANDBOX_CLEANUP_UNVERIFIED",
    });
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
