import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleCronRoutes } from "./cron";

function createContext(calls: string[] = []): AppContext {
  const cron = {
    list: () => [{ id: "job-1" }],
    runs: (limit: number) => [{ id: `run:${limit}` }],
    create: (input: Record<string, unknown>) => ({ id: "job-new", ...input }),
    update: (id: string, patch: Record<string, unknown>) => ({ id, ...patch }),
    pause: (id: string) => {
      calls.push(`pause:${id}`);
      return { id, status: "paused" };
    },
    resume: (id: string) => {
      calls.push(`resume:${id}`);
      return { id, status: "active" };
    },
    runNow: (id: string) => {
      calls.push(`run:${id}`);
      return { id, status: "queued" };
    },
    triggerNow: (
      id: string,
      source: string,
      payload: Record<string, unknown>,
    ) => {
      calls.push(`trigger:${id}:${source}`);
      return Promise.resolve({
        id: "run-manual",
        jobId: id,
        payload,
        status: "completed",
      });
    },
    triggerWebhook: (token: string, payload: Record<string, unknown>) => {
      calls.push(`webhook:${token}`);
      return Promise.resolve({
        id: "run-webhook",
        token,
        payload,
        status: "completed",
      });
    },
    remove: (id: string) => {
      calls.push(`remove:${id}`);
    },
  };
  return {
    runtime: { getService: (name: string) => (name === "cron" ? cron : null) },
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
        pause: (id: string) => {
          calls.push(`pause:${id}`);
          return { id, status: "paused" };
        },
        resume: (id: string) => {
          calls.push(`resume:${id}`);
          return { id, status: "active" };
        },
        runNow: (id: string) => {
          calls.push(`run:${id}`);
          return { id, status: "queued" };
        },
        triggerNow: (
          id: string,
          source: string,
          payload: Record<string, unknown>,
        ) => {
          calls.push(`trigger:${id}:${source}`);
          return Promise.resolve({
            id: "run-manual",
            jobId: id,
            payload,
            status: "completed",
          });
        },
        triggerWebhook: (token: string, payload: Record<string, unknown>) => {
          calls.push(`webhook:${token}`);
          return Promise.resolve({
            id: "run-webhook",
            token,
            payload,
            status: "completed",
          });
        },
        remove: (id: string) => {
          calls.push(`remove:${id}`);
        },
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

  it("returns stable 400 responses for malformed automation bodies", async () => {
    const malformedCreate = await handleCronRoutes(
      createContext(),
      new Request("http://localhost/cron/jobs", {
        method: "POST",
        body: "{",
      }),
      new URL("http://localhost/cron/jobs"),
    );
    const arrayUpdate = await handleCronRoutes(
      createContext(),
      new Request("http://localhost/cron/jobs/job-1", {
        method: "PATCH",
        body: JSON.stringify([]),
      }),
      new URL("http://localhost/cron/jobs/job-1"),
    );

    expect(malformedCreate?.status).toBe(400);
    await expect(malformedCreate?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(arrayUpdate?.status).toBe(400);
    await expect(arrayUpdate?.json()).resolves.toEqual({
      error: "JSON body must be an object",
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

  it("pauses, resumes, runs, and removes cron jobs", async () => {
    const calls: string[] = [];
    const context = createContext(calls);
    const pause = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs/job-1/pause", {
        method: "POST",
      }),
      new URL("http://localhost/cron/jobs/job-1/pause"),
    );
    const resume = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs/job-1/resume", {
        method: "POST",
      }),
      new URL("http://localhost/cron/jobs/job-1/resume"),
    );
    const run = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs/job-1/run", {
        method: "POST",
      }),
      new URL("http://localhost/cron/jobs/job-1/run"),
    );
    const remove = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs/job-1", {
        method: "DELETE",
      }),
      new URL("http://localhost/cron/jobs/job-1"),
    );

    await expect(pause?.json()).resolves.toEqual({
      job: { id: "job-1", status: "paused" },
    });
    await expect(resume?.json()).resolves.toEqual({
      job: { id: "job-1", status: "active" },
    });
    await expect(run?.json()).resolves.toEqual({
      job: { id: "job-1", status: "queued" },
    });
    await expect(remove?.json()).resolves.toEqual({
      deleted: true,
      id: "job-1",
    });
    expect(calls).toEqual([
      "pause:job-1",
      "resume:job-1",
      "run:job-1",
      "remove:job-1",
    ]);
  });

  it("runs manual and webhook triggers with structured payloads", async () => {
    const calls: string[] = [];
    const context = createContext(calls);
    const manual = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs/job-1/trigger", {
        method: "POST",
        body: JSON.stringify({ release: { status: "ready" } }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/cron/jobs/job-1/trigger"),
    );
    const webhook = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/webhooks/token-1", {
        method: "POST",
        body: JSON.stringify({ event: "build.done" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/cron/webhooks/token-1"),
    );

    await expect(manual?.json()).resolves.toMatchObject({
      run: {
        id: "run-manual",
        jobId: "job-1",
        status: "completed",
      },
    });
    await expect(webhook?.json()).resolves.toMatchObject({
      run: {
        id: "run-webhook",
        token: "token-1",
        status: "completed",
      },
    });
    expect(calls).toEqual(["trigger:job-1:manual", "webhook:token-1"]);
  });

  it("uses native lifecycle methods when available", async () => {
    const localCalls: string[] = [];
    const nativeCalls: string[] = [];
    const context = createContext(localCalls);
    context.runtime = {
      getService: (name: string) =>
        name === "cron"
          ? {
              pause: (id: string) => {
                nativeCalls.push(`pause:${id}`);
                return { id, native: true };
              },
              resume: (id: string) => {
                nativeCalls.push(`resume:${id}`);
                return { id, native: true };
              },
              runNow: (id: string) => {
                nativeCalls.push(`run:${id}`);
                return { id, native: true };
              },
              remove: (id: string) => {
                nativeCalls.push(`remove:${id}`);
              },
            }
          : null,
    } as AppContext["runtime"];

    for (const action of ["pause", "resume", "run"]) {
      const response = await handleCronRoutes(
        context,
        new Request(`http://localhost/cron/jobs/native-job/${action}`, {
          method: "POST",
        }),
        new URL(`http://localhost/cron/jobs/native-job/${action}`),
      );
      const payload = await response?.json();
      expect(payload.job).toEqual({
        id: "native-job",
        native: true,
      });
    }
    const remove = await handleCronRoutes(
      context,
      new Request("http://localhost/cron/jobs/native-job", {
        method: "DELETE",
      }),
      new URL("http://localhost/cron/jobs/native-job"),
    );

    await expect(remove?.json()).resolves.toEqual({
      deleted: true,
      id: "native-job",
    });
    expect(nativeCalls).toEqual([
      "pause:native-job",
      "resume:native-job",
      "run:native-job",
      "remove:native-job",
    ]);
    expect(localCalls).toEqual([]);
  });

  it("rejects lifecycle requests with missing cron job ids", async () => {
    const missingPause = await handleCronRoutes(
      createContext(),
      new Request("http://localhost/cron/jobs//pause", {
        method: "POST",
      }),
      new URL("http://localhost/cron/jobs//pause"),
    );
    const missingDelete = await handleCronRoutes(
      createContext(),
      new Request("http://localhost/cron/jobs", {
        method: "DELETE",
      }),
      new URL("http://localhost/cron/jobs"),
    );

    expect(missingPause?.status).toBe(400);
    await expect(missingPause?.json()).resolves.toEqual({
      error: "cron job id is required",
    });
    expect(missingDelete?.status).toBe(400);
    await expect(missingDelete?.json()).resolves.toEqual({
      error: "cron job id is required",
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
