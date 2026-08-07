import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addLogListener } from "@elizaos/logger";
import { beforeEach, describe, expect, it } from "vitest";
import { LoggerService } from "@/services/logger-service";

describe("LoggerService", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "doolittle-logger-"));
  });

  it("writes structured scoped log records", () => {
    const officialEntries: string[] = [];
    const removeListener = addLogListener((entry) => {
      officialEntries.push(entry.msg);
    });
    const logger = new LoggerService(dataDir, {
      minLevel: "debug",
      traceEnabled: true,
    }).child("cli");

    try {
      logger.info("booted", {
        mode: "plain",
        sessionId: "session-123",
        tokenCount: 42,
        token: "private-token",
        nested: { password: "private-password" },
      });
      logger.trace("panels:refresh", "width=120");
    } finally {
      removeListener();
    }

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
        mode: "plain",
        sessionId: "session-123",
        tokenCount: 42,
        token: "[REDACTED]",
        nested: { password: "[REDACTED]" },
      },
    });
    expect(records[1]).toMatchObject({
      level: "trace",
      scope: "doolittle.cli",
      message: "panels:refresh",
      detail: "width=120",
    });
    expect(
      officialEntries.some(
        (message) =>
          message.includes("#doolittle.cli") && message.includes("booted"),
      ),
    ).toBe(true);
    expect(officialEntries.join("\n")).not.toContain("private-token");
    expect(officialEntries.join("\n")).not.toContain("private-password");
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
