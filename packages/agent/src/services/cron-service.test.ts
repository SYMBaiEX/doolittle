import { describe, expect, it } from "vitest";
import { CronService } from "./cron/service";

describe("CronService compatibility surface", () => {
  it("does not start a local scheduler or persist automation jobs", () => {
    const service = new CronService("/unused", "/unused", 1);
    service.start();
    service.stop();
    expect(service.list()).toEqual([]);
    expect(service.recentRuns()).toEqual([]);
    expect(() =>
      service.create({ name: "old", prompt: "old", schedule: "every 1m" }),
    ).toThrow("Eliza Trigger runtime service");
  });
});
