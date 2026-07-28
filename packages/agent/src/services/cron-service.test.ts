import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CronService } from "./cron/service";

describe("CronService", () => {
  it("creates jobs with skills and runtime overrides", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-cron-"));
    const service = new CronService(
      join(root, "data"),
      join(root, "output"),
      30,
      "America/Chicago",
    );

    try {
      const job = service.create({
        name: "nightly-review",
        prompt: "Summarize recent deployment changes.",
        schedule: "every 2h",
        skills: ["automation/reports", "productivity/repo-ops"],
        runtime: {
          provider: "openai",
          model: "gpt-4.1-mini",
          baseUrl: "https://api.openai.com/v1",
          temperature: 0.2,
          maxTokens: 900,
          personalityId: "focused",
        },
      });

      expect(job.skills).toEqual([
        "automation/reports",
        "productivity/repo-ops",
      ]);
      expect(job.runtime?.model).toBe("gpt-4.1-mini");
      expect(job.runtime?.personalityId).toBe("focused");
      expect(job.nextRunAt).toBeDefined();
      expect(service.get(job.id)?.name).toBe("nightly-review");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("pauses one-shot jobs after they run", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-cron-oneshot-"));
    const service = new CronService(
      join(root, "data"),
      join(root, "output"),
      30,
      "America/Chicago",
    );

    service.setExecutor(async () => "completed");

    try {
      const job = service.create({
        name: "one-off",
        prompt: "Run once and stop.",
        schedule: "2h",
      });

      service.runNow(job.id);
      await service.tick();

      const updated = service.get(job.id);
      expect(updated?.status).toBe("paused");
      expect(updated?.nextRunAt).toBeUndefined();
      expect(service.runs(1)[0]?.jobId).toBe(job.id);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("updates existing jobs and can clear runtime overrides", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-cron-update-"));
    const service = new CronService(
      join(root, "data"),
      join(root, "output"),
      30,
      "America/Chicago",
    );

    try {
      const job = service.create({
        name: "job-a",
        prompt: "Initial prompt",
        schedule: "every 1h",
        runtime: {
          model: "gpt-4.1-mini",
          personalityId: "default",
        },
      });

      const updated = service.updateConfig(job.id, {
        name: "job-b",
        prompt: "Updated prompt",
        schedule: "every 4h",
        skills: ["generated/status-audit"],
        delivery: "home",
        runtime: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          personalityId: "focused",
        },
      });

      expect(updated.name).toBe("job-b");
      expect(updated.prompt).toBe("Updated prompt");
      expect(updated.schedule).toBe("every 4h");
      expect(updated.skills).toEqual(["generated/status-audit"]);
      expect(updated.delivery).toBe("home");
      expect(updated.runtime?.provider).toBe("anthropic");
      expect(updated.runtime?.personalityId).toBe("focused");
      expect(updated.nextRunAt).toBeDefined();

      const cleared = service.updateConfig(job.id, {
        clearRuntime: true,
      });
      expect(cleared.runtime).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses autonomous cron scheduling for 5-field cron expressions", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-cron-cronexpr-"));
    const service = new CronService(
      join(root, "data"),
      join(root, "output"),
      30,
      "America/Chicago",
    );

    try {
      const job = service.create({
        name: "weekday-report",
        prompt: "Send the daily operator summary.",
        schedule: "15 9 * * 1-5",
      });

      expect(job.nextRunAt).toBeDefined();
      const nextRun = new Date(job.nextRunAt ?? "");
      expect(Number.isNaN(nextRun.getTime())).toBe(false);
      expect(nextRun.getUTCMinutes()).toBe(15);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("executes manual workflows with condition and trace receipts", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-cron-manual-"));
    const service = new CronService(
      join(root, "data"),
      join(root, "output"),
      30,
      "America/Chicago",
    );
    const executions: string[] = [];
    service.setExecutor(async (job, context) => {
      executions.push(`${job.id}:${context.source}`);
      return "agent completed the workflow";
    });

    try {
      const job = service.create({
        name: "release-ready",
        trigger: { type: "manual" },
        condition: {
          type: "payload",
          path: "release.status",
          operator: "equals",
          value: "ready",
        },
        action: {
          type: "run-agent",
          prompt: "Prepare the release receipt.",
        },
      });

      const skipped = await service.triggerNow(job.id, "manual", {
        release: { status: "draft" },
      });
      const completed = await service.triggerNow(job.id, "manual", {
        release: { status: "ready" },
      });

      expect(skipped.status).toBe("skipped");
      expect(skipped.trace?.map((step) => step.phase)).toEqual([
        "trigger",
        "condition",
      ]);
      expect(completed.status).toBe("completed");
      expect(completed.triggerType).toBe("manual");
      expect(completed.actionType).toBe("run-agent");
      expect(completed.trace?.map((step) => step.phase)).toEqual([
        "trigger",
        "condition",
        "action",
        "delivery",
      ]);
      expect(executions).toEqual([`${job.id}:manual`]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses stable capability tokens for webhook triggers", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-cron-webhook-"));
    const service = new CronService(
      join(root, "data"),
      join(root, "output"),
      30,
      "UTC",
    );
    service.setExecutor(async (_job, context) =>
      String(context.payload?.event),
    );

    try {
      const job = service.create({
        name: "incoming-build",
        trigger: { type: "webhook" },
        action: {
          type: "prompt",
          prompt: "Review the incoming build event.",
        },
      });
      expect(job.trigger?.type).toBe("webhook");
      const token =
        job.trigger?.type === "webhook" ? job.trigger.token : "missing";

      const run = await service.triggerWebhook(token, { event: "build.done" });
      expect(run.output).toBe("build.done");
      expect(run.triggerType).toBe("webhook");

      const updated = service.updateConfig(job.id, {
        condition: { type: "always" },
        action: {
          type: "webhook",
          method: "POST",
          url: "https://example.com/hooks/build",
        },
      });
      expect(updated.trigger).toEqual(job.trigger);
      expect(updated.action).toEqual({
        type: "webhook",
        method: "POST",
        url: "https://example.com/hooks/build",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects incomplete or credential-bearing webhook definitions", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-cron-validation-"));
    const service = new CronService(
      join(root, "data"),
      join(root, "output"),
      30,
      "UTC",
    );

    try {
      expect(() =>
        service.create({
          name: "missing-prompt",
          trigger: { type: "manual" },
          action: { type: "prompt", prompt: " " },
        }),
      ).toThrow("prompt actions require a prompt");
      expect(() =>
        service.create({
          name: "unsafe-webhook",
          trigger: { type: "manual" },
          action: {
            type: "webhook",
            method: "POST",
            url: "https://user:password@example.com/hook",
          },
        }),
      ).toThrow("without embedded credentials");
      expect(() =>
        service.create({
          name: "unsupported-action",
          trigger: { type: "manual" },
          action: {
            type: "webhook",
            method: "GET",
            url: "https://example.com/hook",
          } as never,
        }),
      ).toThrow("support POST only");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
