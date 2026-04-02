import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCrashFileTransport,
  createJsonlFileTransport,
  createLogger,
  createMemoryTransport,
  readJsonlTail,
} from "./index";

describe("@doolittle/logger transports", () => {
  it("writes JSONL event records and reads them back", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-logger-package-"));
    const logPath = join(dataDir, "events.jsonl");
    const logger = createLogger({
      scope: "doolittle.test",
      minLevel: "debug",
      transports: [createJsonlFileTransport({ path: logPath })],
    });

    logger.debug("booted", { mode: "test" });
    logger.warn("slow", { ms: 42 });

    const records = readJsonlTail(logPath, 10);
    expect(records).toHaveLength(2);
    expect(records[0]?.message).toBe("booted");
    expect(records[1]?.fields).toMatchObject({ ms: 42 });
  });

  it("writes crash blocks into the crash transport output", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-logger-package-"));
    const crashPath = join(dataDir, "crash.log");
    const logger = createLogger({
      scope: "doolittle.test",
      transports: [
        createCrashFileTransport({ path: crashPath, includeFields: true }),
      ],
    });

    logger.recordCrash("fatal-path", "kaboom", { jobId: "123" });

    const content = readFileSync(crashPath, "utf8");
    expect(content).toContain("fatal-path");
    expect(content).toContain("kaboom");
    expect(content).toContain('"jobId": "123"');
  });

  it("retains only the configured number of memory records", () => {
    const memory = createMemoryTransport({ limit: 2 });
    const logger = createLogger({
      scope: "doolittle.memory",
      transports: [memory],
    });

    logger.info("one");
    logger.info("two");
    logger.info("three");

    expect(memory.records().map((record) => record.message)).toEqual([
      "two",
      "three",
    ]);
  });
});
