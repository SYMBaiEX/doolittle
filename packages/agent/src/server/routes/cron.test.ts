import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleCronRoutes } from "./cron";

function createContext(): AppContext {
  return {
    runtime: {},
    services: {
      cron: {
        list: () => [{ id: "job-1" }],
        recentRuns: (limit: number) => [{ id: `run:${limit}` }],
        create: (input: Record<string, unknown>) => ({
          id: "job-new",
          ...input,
        }),
        updateConfig: (id: string, patch: Record<string, unknown>) => ({
          id,
          ...patch,
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleCronRoutes", () => {
  it("returns cron job and run summaries", async () => {
    const context = createContext();
    const jobs = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs"),
      new URL("http://localhost/cron/jobs"),
    );
    const runs = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/runs"),
      new URL("http://localhost/cron/runs"),
    );

    await expect(jobs?.json()).resolves.toEqual({
      jobs: [{ id: "job-1" }],
    });
    await expect(runs?.json()).resolves.toEqual({
      runs: [{ id: "run:50" }],
    });
  });

  it("validates required cron job inputs", async () => {
    const response = await handleCronRoutes(
      createContext(),
      new Request("http://localhost/cron/jobs", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/cron/jobs"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "schedule and prompt are required",
    });
  });

  it("creates and updates cron jobs", async () => {
    const context = createContext();
    const create = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs", {
        method: "POST",
        body: JSON.stringify({
          name: "Nightly",
          schedule: "0 0 * * *",
          prompt: "Summarize changes",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/cron/jobs"),
    );
    const update = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs/job-1", {
        method: "PATCH",
        body: JSON.stringify({ prompt: "Updated summary" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/cron/jobs/job-1"),
    );

    await expect(create?.json()).resolves.toEqual({
      job: {
        id: "job-new",
        name: "Nightly",
        schedule: "0 0 * * *",
        prompt: "Summarize changes",
        skills: [],
        delivery: "local",
        runtime: undefined,
      },
    });
    await expect(update?.json()).resolves.toEqual({
      job: {
        id: "job-1",
        name: undefined,
        prompt: "Updated summary",
        schedule: undefined,
        skills: undefined,
        delivery: undefined,
        clearRuntime: undefined,
        runtime: undefined,
      },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleCronRoutes(
      createContext(),
      new Request("http://localhost/not-cron"),
      new URL("http://localhost/not-cron"),
    );

    expect(response).toBeNull();
  });
});
