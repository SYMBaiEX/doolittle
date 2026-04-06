import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSkillSynthesisRoutes } from "./skill-synthesis";

function createContext(options?: { nativePath?: string }): AppContext {
  return {
    runtime: {
      getService: (name: string) =>
        name === "agent_skills" && options?.nativePath
          ? {
              synthesize: async (taskId: string) =>
                `${options.nativePath}:${taskId}`,
            }
          : undefined,
    },
    services: {
      delegation: {
        list: () => [
          { id: "task-1", title: "Investigate" },
          { id: "task-2", title: "Ship" },
        ],
      },
      skillSynthesis: {
        synthesizeFromTask: (task: { id: string }) => `generated:${task.id}`,
      },
    },
  } as unknown as AppContext;
}

describe("handleSkillSynthesisRoutes", () => {
  it("prefers native synthesis and falls back to local task synthesis", async () => {
    const nativeResponse = await handleSkillSynthesisRoutes(
      createContext({ nativePath: "native" }),
      new Request("http://localhost/skills/synthesize", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-1" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/synthesize"),
    );
    const localResponse = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/skills/synthesize", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-2" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/synthesize"),
    );

    await expect(nativeResponse?.json()).resolves.toEqual({
      path: "native:task-1",
    });
    await expect(localResponse?.json()).resolves.toEqual({
      path: "generated:task-2",
    });
  });

  it("validates required task ids and missing tasks", async () => {
    const missingTaskId = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/skills/synthesize", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/synthesize"),
    );
    const missingTask = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/skills/synthesize", {
        method: "POST",
        body: JSON.stringify({ taskId: "missing" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/synthesize"),
    );

    expect(missingTaskId?.status).toBe(400);
    await expect(missingTaskId?.json()).resolves.toEqual({
      error: "taskId is required",
    });
    expect(missingTask?.status).toBe(404);
    await expect(missingTask?.json()).resolves.toEqual({
      error: "Delegation task not found",
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/not-synthesize"),
      new URL("http://localhost/not-synthesize"),
    );

    expect(response).toBeNull();
  });
});
