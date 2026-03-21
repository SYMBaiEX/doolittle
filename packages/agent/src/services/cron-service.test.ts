import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CronService } from "./cron-service";

describe("CronService", () => {
  it("creates jobs with skills and runtime overrides", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-cron-"));
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

  it("updates existing jobs and can clear runtime overrides", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-cron-update-"));
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
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-cron-cronexpr-"));
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
});
