import { describe, expect, it } from "bun:test";
import {
  createLogger,
  createLoggerPreset,
  createMemoryTransport,
  DOCTOR_LOGGER_CODENAME,
} from "./index";

describe("@doolittle/logger createLogger", () => {
  it("supports child scopes, bound fields, and tags", () => {
    const memory = createMemoryTransport();
    const logger = createLogger({
      name: "doolittle",
      scope: "doolittle",
      minLevel: "debug",
      traceEnabled: true,
      bindings: { runtime: "bun" },
      transports: [memory],
    });

    logger
      .child("cli", { sessionId: "abc123" })
      .withTags("tui", "interactive")
      .info("booted", { mode: "plain" });

    expect(DOCTOR_LOGGER_CODENAME).toBe("Dr. Mochibi");
    expect(memory.records()).toHaveLength(1);
    expect(memory.records()[0]).toMatchObject({
      logger: "doolittle",
      scope: "doolittle.cli",
      level: "info",
      message: "booted",
      tags: ["tui", "interactive"],
      fields: {
        runtime: "bun",
        sessionId: "abc123",
        mode: "plain",
      },
    });
  });

  it("redacts sensitive fields and safely serializes errors", () => {
    const memory = createMemoryTransport();
    const logger = createLogger({
      scope: "doolittle.worker",
      minLevel: "trace",
      traceEnabled: true,
      redact: {
        keys: ["token"],
        pathFragments: ["credentials.secret"],
      },
      transports: [memory],
    });

    logger.error("request failed", {
      token: "abc",
      credentials: { secret: "shh", nested: true },
      err: new Error("boom"),
    });

    const [record] = memory.records();
    expect(record?.fields).toMatchObject({
      token: "[REDACTED]",
      credentials: { secret: "[REDACTED]", nested: true },
    });
    expect((record?.fields?.err as { message?: string }).message).toBe("boom");
  });

  it("records crashes as both event and crash entries", () => {
    const memory = createMemoryTransport();
    const logger = createLogger({
      scope: "doolittle.cli",
      transports: [memory],
    });

    const detail = logger.captureError("uncaughtException", new Error("boom"), {
      source: "test",
    });

    expect(detail).toContain("boom");
    expect(memory.records()).toHaveLength(2);
    expect(memory.records()[0]).toMatchObject({
      kind: "event",
      level: "error",
      message: "uncaughtException",
      fields: {
        source: "test",
        crash: true,
      },
    });
    expect(memory.records()[1]).toMatchObject({
      kind: "crash",
      level: "error",
      message: "uncaughtException",
    });
  });

  it("suppresses trace output when trace logging is disabled", () => {
    const memory = createMemoryTransport();
    const logger = createLogger({
      scope: "doolittle",
      minLevel: "trace",
      traceEnabled: false,
      transports: [memory],
    });

    logger.trace("hidden", "detail");
    logger.info("visible");

    expect(memory.records().map((record) => record.message)).toEqual([
      "visible",
    ]);
  });

  it("normalizes blank names, scopes, and tags", () => {
    const memory = createMemoryTransport();
    const logger = createLogger({
      name: "   ",
      scope: "  ",
      tags: ["  alpha  ", "", "alpha", "beta"],
      transports: [memory],
    });

    logger.info("normalized");

    expect(logger.name).toBe("doolittle");
    expect(logger.scope).toBe("doolittle");
    expect(memory.records()[0]?.tags).toEqual(["alpha", "beta"]);
  });

  it("supports chained presets for shared defaults", () => {
    const memory = createMemoryTransport();
    const preset = createLoggerPreset({
      name: "doolittle",
      scope: "doolittle",
      minLevel: "debug",
      traceEnabled: true,
      transports: [memory],
      tags: ["workspace"],
      bindings: { runtime: "bun" },
    });

    preset
      .child("cli", { sessionId: "abc123" })
      .withTags("interactive", "workspace")
      .create()
      .info("booted", { mode: "plain" });

    expect(preset.name).toBe("doolittle");
    expect(preset.scope).toBe("doolittle");
    expect(memory.records()[0]).toMatchObject({
      scope: "doolittle.cli",
      tags: ["workspace", "interactive"],
      fields: {
        runtime: "bun",
        sessionId: "abc123",
        mode: "plain",
      },
    });
  });
});
