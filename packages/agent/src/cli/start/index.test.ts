import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { resetCliRuntimeInitializationForTests } from "./init";

const warnMessages: string[] = [];

const logger = {
  warn: vi.fn((..._args: unknown[]) => {}),
  child: vi.fn(() => logger),
};

const context = {
  config: {
    agentName: "Doolittle",
  },
  services: {
    logger,
  },
} as unknown as AppContext;

describe("startCli", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    warnMessages.length = 0;
    resetCliRuntimeInitializationForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    resetCliRuntimeInitializationForTests();
  });

  it("uses plain mode without initializing the TUI runtime", async () => {
    const ensureCliRuntimeInitialized = vi.fn(async () => {});
    const startPlainCli = vi.fn(async () => 17);
    const importTui = vi.fn(async () => ({
      startTui: async () => 0,
    }));
    const { startCli } = await import("./index");

    const exitCode = await startCli(context, undefined, {
      argv: ["bun", "index.ts", "--plain-cli"],
      stdinIsTTY: true,
      stdoutIsTTY: true,
      ensureCliRuntimeInitialized,
      startPlainCli,
      importTui,
      warn: (message: unknown) => {
        warnMessages.push(String(message));
      },
    });

    expect(exitCode).toBe(17);
    expect(startPlainCli).toHaveBeenCalledTimes(1);
    expect(ensureCliRuntimeInitialized).not.toHaveBeenCalled();
    expect(importTui).not.toHaveBeenCalled();
    expect(warnMessages).toEqual([]);
  });

  it("initializes the TUI runtime and returns the TUI exit code when cockpit mode succeeds", async () => {
    const ensureCliRuntimeInitialized = vi.fn(async () => {});
    const startPlainCli = vi.fn(async () => 1);
    const importTui = vi.fn(async () => ({
      startTui: async () => 23,
    }));
    const { startCli } = await import("./index");

    const exitCode = await startCli(context, undefined, {
      argv: ["bun", "index.ts", "--cockpit"],
      stdinIsTTY: true,
      stdoutIsTTY: true,
      ensureCliRuntimeInitialized,
      startPlainCli,
      importTui,
      warn: (message: unknown) => {
        warnMessages.push(String(message));
      },
    });

    expect(exitCode).toBe(23);
    expect(ensureCliRuntimeInitialized).toHaveBeenCalledTimes(1);
    expect(importTui).toHaveBeenCalledTimes(1);
    expect(startPlainCli).not.toHaveBeenCalled();
    expect(warnMessages).toEqual([]);
  });

  it("falls back to plain mode when the TUI closes unexpectedly", async () => {
    const startPlainCli = vi.fn(async () => 29);
    const { startCli } = await import("./index");

    const exitCode = await startCli(context, undefined, {
      argv: ["bun", "index.ts", "--cockpit"],
      stdinIsTTY: true,
      stdoutIsTTY: true,
      ensureCliRuntimeInitialized: async () => {},
      startPlainCli,
      importTui: async () => ({
        startTui: async () => "unexpected" as const,
      }),
      warn: (message: unknown) => {
        warnMessages.push(String(message));
      },
    });

    expect(exitCode).toBe(29);
    expect(startPlainCli).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(warnMessages).toEqual([
      "Doolittle TUI closed unexpectedly. Falling back to plain CLI.",
    ]);
  });

  it("falls back to plain mode when the TUI throws during startup", async () => {
    const startPlainCli = vi.fn(async () => 31);
    const { startCli } = await import("./index");

    const exitCode = await startCli(context, undefined, {
      argv: ["bun", "index.ts", "--cockpit"],
      stdinIsTTY: true,
      stdoutIsTTY: true,
      ensureCliRuntimeInitialized: async () => {},
      startPlainCli,
      importTui: async () => ({
        startTui: async () => {
          throw new Error("boom");
        },
      }),
      warn: (message: unknown) => {
        warnMessages.push(String(message));
      },
    });

    expect(exitCode).toBe(31);
    expect(startPlainCli).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(warnMessages).toEqual([
      "Doolittle TUI failed to start (boom). Falling back to plain CLI.",
    ]);
  });
});
