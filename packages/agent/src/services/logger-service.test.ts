import { beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoggerService } from "@/services/logger-service";

describe("LoggerService", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "doolittle-logger-"));
  });

  it("writes structured scoped log records", () => {
    const logger = new LoggerService(dataDir, {
      minLevel: "debug",
      traceEnabled: true,
    }).child("cli");

    logger.info("booted", { mode: "plain" });
    logger.trace("panels:refresh", "width=120");

    const eventLogPath = logger.getEventLogPath();
    const records = readFileSync(eventLogPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      level: "info",
      scope: "doolittle.cli",
      message: "booted",
      fields: {
        codename: "Dr. Mochibi",
        mode: "plain",
      },
    });
    expect(records[1]).toMatchObject({
      level: "trace",
      scope: "doolittle.cli",
      message: "panels:refresh",
      detail: "width=120",
    });
  });

  it("captures errors into both structured and crash logs", () => {
    const logger = new LoggerService(dataDir, { minLevel: "info" }).child(
      "cli.tui",
    );

    const detail = logger.captureError("uncaughtException", new Error("boom"), {
      source: "test",
    });

    expect(detail).toContain("boom");
    expect(readFileSync(logger.getCrashLogPath(), "utf8")).toContain(
      "uncaughtException",
    );
    expect(readFileSync(logger.getEventLogPath(), "utf8")).toContain(
      '"scope":"doolittle.cli.tui"',
    );
    expect(readFileSync(logger.getEventLogPath(), "utf8")).toContain(
      '"message":"uncaughtException"',
    );
  });

  it("suppresses trace records when trace logging is disabled", () => {
    const logger = new LoggerService(dataDir, {
      minLevel: "info",
      traceEnabled: false,
    });

    logger.trace("hidden");
    logger.info("visible");

    const records = logger.list();
    expect(records).toHaveLength(1);
    expect(records[0]?.message).toBe("visible");
  });
});
