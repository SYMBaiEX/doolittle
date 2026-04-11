import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleDelegationMutationRoutes } from "./delegation-mutations";

function createContext(): AppContext {
  return {
    runtime: {},
    services: {
      delegation: {
        addNote: (id: string, note: string) => ({ id, note, status: "noted" }),
        markRunning: (id: string) => ({ id, status: "running" }),
        requeue: (
          id: string,
          note?: string,
          options?: Record<string, unknown>,
        ) => ({ id, note, options, status: "queued" }),
        cancel: (
          id: string,
          note?: string,
          options?: Record<string, unknown>,
        ) => ({ id, note, options, status: "cancelled" }),
        complete: (id: string, note?: string) => ({
          id,
          note,
          status: "completed",
        }),
        fail: (
          id: string,
          note: string,
          options?: Record<string, unknown>,
        ) => ({
          id,
          note,
          options,
          status: "failed",
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleDelegationMutationRoutes", () => {
  it("handles note, run, complete, and fail transitions", async () => {
    const context = createContext();
    const note = await handleDelegationMutationRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1/note", {
        method: "POST",
        body: JSON.stringify({ note: "hello" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-1/note"),
    );
    const run = await handleDelegationMutationRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1/run", {
        method: "POST",
      }),
      new URL("http://localhost/delegation/tasks/task-1/run"),
    );
    const complete = await handleDelegationMutationRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1/complete", {
        method: "POST",
        body: JSON.stringify({ note: "done" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-1/complete"),
    );
    const fail = await handleDelegationMutationRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1/fail", {
        method: "POST",
        body: JSON.stringify({ note: "boom", cascadeChildren: true }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-1/fail"),
    );

    await expect(note?.json()).resolves.toEqual({
      task: { id: "task-1", note: "hello", status: "noted" },
    });
    await expect(run?.json()).resolves.toEqual({
      task: { id: "task-1", status: "running" },
    });
    await expect(complete?.json()).resolves.toEqual({
      task: { id: "task-1", note: "done", status: "completed" },
    });
    await expect(fail?.json()).resolves.toEqual({
      task: {
        id: "task-1",
        note: "boom",
        options: { cascadeChildren: true },
        status: "failed",
      },
    });
  });

  it("handles retry and cancel flows through effective helpers", async () => {
    const context = createContext();
    const retry = await handleDelegationMutationRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1/retry", {
        method: "POST",
        body: JSON.stringify({ note: "retry it" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-1/retry"),
    );
    const cancel = await handleDelegationMutationRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1/cancel", {
        method: "POST",
        body: JSON.stringify({ note: "stop", cascadeChildren: true }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-1/cancel"),
    );

    await expect(retry?.json()).resolves.toEqual({
      task: {
        id: "task-1",
        note: "retry it",
        options: undefined,
        status: "queued",
      },
    });
    await expect(cancel?.json()).resolves.toEqual({
      task: {
        id: "task-1",
        note: "stop",
        options: { cascadeChildren: true },
        status: "cancelled",
      },
    });
  });

  it("validates action routes and preserves 404 behavior", async () => {
    const missing = await handleDelegationMutationRoutes(
      createContext(),
      new Request("http://localhost/delegation/tasks/", {
        method: "POST",
      }),
      new URL("http://localhost/delegation/tasks/"),
    );
    const unknown = await handleDelegationMutationRoutes(
      createContext(),
      new Request("http://localhost/delegation/tasks/task-1/unknown", {
        method: "POST",
      }),
      new URL("http://localhost/delegation/tasks/task-1/unknown"),
    );

    expect(missing?.status).toBe(400);
    await expect(missing?.json()).resolves.toEqual({
      error: "task id and action are required",
    });
    expect(unknown?.status).toBe(404);
    await expect(unknown?.json()).resolves.toEqual({
      error: "unknown delegation action",
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleDelegationMutationRoutes(
      createContext(),
      new Request("http://localhost/not-delegation"),
      new URL("http://localhost/not-delegation"),
    );

    expect(response).toBeNull();
  });
});
