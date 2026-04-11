import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleMemoryRoutes } from "@/server/routes/memory";

function createContext() {
  return {
    runtime: {},
    services: {
      memory: {
        summary: (target: "memory" | "user") => ({
          target,
          count: target === "user" ? 1 : 2,
        }),
        renderSnapshot: (target: "memory" | "user") => `${target} snapshot`,
      },
    },
  } as unknown as AppContext;
}

describe("handleMemoryRoutes", () => {
  it("returns memory snapshots with resolved targets", async () => {
    const response = await handleMemoryRoutes(
      createContext(),
      new Request("http://localhost/memory?target=user"),
      new URL("http://localhost/memory?target=user"),
    );

    await expect(response?.json()).resolves.toEqual({
      target: "user",
      summary: { target: "user", count: 1 },
      snapshot: "user snapshot",
    });
  });

  it("returns memory summaries", async () => {
    const response = await handleMemoryRoutes(
      createContext(),
      new Request("http://localhost/memory/summary"),
      new URL("http://localhost/memory/summary"),
    );

    await expect(response?.json()).resolves.toEqual({
      summary: { target: "memory", count: 2 },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleMemoryRoutes(
      createContext(),
      new Request("http://localhost/not-memory"),
      new URL("http://localhost/not-memory"),
    );

    expect(response).toBeNull();
  });
});
