import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleOperationsRoutes } from "./operations";

function createContext(): AppContext {
  return {
    runtime: {},
    services: {
      workspace: {
        write: (path: string, content: string) => `${path}:${content}`,
      },
      delivery: {
        recent: (limit: number) => [{ id: `delivery:${limit}` }],
      },
      terminal: {
        recent: (limit: number) => [{ command: `history:${limit}` }],
        run: async (command: string) => ({ command, ok: true }),
      },
    },
  } as unknown as AppContext;
}

describe("handleOperationsRoutes", () => {
  it("returns research, deliveries, and terminal history payloads", async () => {
    const context = createContext();
    const research = await handleOperationsRoutes(
      context,
      new Request("http://localhost/runtime/research"),
      new URL("http://localhost/runtime/research"),
    );
    const deliveries = await handleOperationsRoutes(
      context,
      new Request("http://localhost/deliveries"),
      new URL("http://localhost/deliveries"),
    );
    const history = await handleOperationsRoutes(
      context,
      new Request("http://localhost/terminal/history"),
      new URL("http://localhost/terminal/history"),
    );

    expect(await research?.json()).toHaveProperty("research");
    await expect(deliveries?.json()).resolves.toEqual({
      deliveries: [{ id: "delivery:100" }],
    });
    await expect(history?.json()).resolves.toEqual({
      commands: [{ command: "history:25" }],
    });
  });

  it("validates workspace writes and terminal commands", async () => {
    const invalidWrite = await handleOperationsRoutes(
      createContext(),
      new Request("http://localhost/workspace/write", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/workspace/write"),
    );
    const invalidRun = await handleOperationsRoutes(
      createContext(),
      new Request("http://localhost/terminal/run", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/terminal/run"),
    );

    expect(invalidWrite?.status).toBe(400);
    await expect(invalidWrite?.json()).resolves.toEqual({
      error: "path and content are required",
    });
    expect(invalidRun?.status).toBe(400);
    await expect(invalidRun?.json()).resolves.toEqual({
      error: "command is required",
    });
  });

  it("writes workspace files and runs commands", async () => {
    const context = createContext();
    const write = await handleOperationsRoutes(
      context,
      new Request("http://localhost/workspace/write", {
        method: "POST",
        body: JSON.stringify({ path: "notes.txt", content: "hello" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/workspace/write"),
    );
    const run = await handleOperationsRoutes(
      context,
      new Request("http://localhost/terminal/run", {
        method: "POST",
        body: JSON.stringify({ command: "pwd" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/terminal/run"),
    );

    await expect(write?.json()).resolves.toEqual({
      path: "notes.txt:hello",
    });
    await expect(run?.json()).resolves.toEqual({
      result: { command: "pwd", ok: true },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleOperationsRoutes(
      createContext(),
      new Request("http://localhost/not-ops"),
      new URL("http://localhost/not-ops"),
    );

    expect(response).toBeNull();
  });
});
