import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { handleCronCommand } from "./cron-router";

function createContext(): AgentExecutionContext {
  return {
    runtime: {},
    services: {
      cron: {
        list: () => [
          {
            id: "job-1",
            name: "Nightly",
            status: "active",
            schedule: "0 1 * * *",
            nextRunAt: "2026-03-29T01:00:00.000Z",
            skills: ["voice/tts"],
            runtime: { model: "gpt-5.4", personalityId: "focus" },
          },
        ],
        recentRuns: () => [
          {
            jobName: "Nightly",
            createdAt: "2026-03-28T01:00:00.000Z",
            output: "completed successfully",
          },
        ],
        create: (input: Record<string, unknown>) => ({
          id: "job-created",
          nextRunAt: "2026-03-29T02:00:00.000Z",
          ...input,
        }),
        get: (id: string) => (id === "job-1" ? { id, status: "active" } : null),
        updateConfig: (id: string, input: Record<string, unknown>) => ({
          id,
          nextRunAt: "2026-03-29T03:00:00.000Z",
          ...input,
        }),
        pause: (id: string) => ({ id }),
        resume: (id: string) => ({
          id,
          nextRunAt: "2026-03-29T04:00:00.000Z",
        }),
        runNow: (id: string) => ({ id }),
        remove: (_id: string) => undefined,
      },
    },
  } as unknown as AgentExecutionContext;
}

describe("cron command router", () => {
  it("lists jobs and recent runs", async () => {
    const context = createContext();

    const listed = await handleCronCommand(
      {
        message: "/cron",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron",
      context,
    );
    const runs = await handleCronCommand(
      {
        message: "/cron runs",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron runs",
      context,
    );

    expect(listed).toContain("job-1 Nightly [active]");
    expect(runs).toContain("Nightly [2026-03-28T01:00:00.000Z]");
  });

  it("creates jobs with parsed runtime and delivery defaults", async () => {
    const response = await handleCronCommand(
      {
        message:
          "/cron create 0 2 * * * | name:nightly | skills:voice/tts,ops/release | personality:focus | provider:openai | model:gpt-5.4 :: summarize logs",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron create 0 2 * * * | name:nightly | skills:voice/tts,ops/release | personality:focus | provider:openai | model:gpt-5.4 :: summarize logs",
      createContext(),
    );

    expect(response).toContain("Created cron job job-created");
  });

  it("shows, updates, and mutates jobs", async () => {
    const context = createContext();

    const shown = await handleCronCommand(
      {
        message: "/cron show job-1",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron show job-1",
      context,
    );
    const updated = await handleCronCommand(
      {
        message:
          "/cron update job-1 0 3 * * * | name:morning | runtime:default :: check status",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron update job-1 0 3 * * * | name:morning | runtime:default :: check status",
      context,
    );
    const paused = await handleCronCommand(
      {
        message: "/cron pause job-1",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron pause job-1",
      context,
    );
    const resumed = await handleCronCommand(
      {
        message: "/cron resume job-1",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron resume job-1",
      context,
    );
    const runNow = await handleCronCommand(
      {
        message: "/cron run job-1",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron run job-1",
      context,
    );
    const removed = await handleCronCommand(
      {
        message: "/cron remove job-1",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron remove job-1",
      context,
    );

    expect(shown).toContain('"id": "job-1"');
    expect(updated).toContain("Updated cron job job-1");
    expect(paused).toBe("Paused job-1.");
    expect(resumed).toContain("Resumed job-1");
    expect(runNow).toBe("Marked job-1 to run immediately.");
    expect(removed).toBe("Removed job-1.");
  });

  it("returns usage guidance for malformed cron commands", async () => {
    const createUsage = await handleCronCommand(
      {
        message: "/cron create invalid",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron create invalid",
      createContext(),
    );
    const updateUsage = await handleCronCommand(
      {
        message: "/cron update job-1",
        userId: "user-1",
        roomId: "cli:local-user",
        source: "cli",
      },
      "/cron update job-1",
      createContext(),
    );

    expect(createUsage).toContain("Usage: /cron create");
    expect(updateUsage).toContain("Usage: /cron update");
  });
});
