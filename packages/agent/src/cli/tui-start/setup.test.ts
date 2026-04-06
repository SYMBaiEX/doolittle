import { describe, expect, it } from "bun:test";
import type { AppLogger } from "@/logging/logger";
import { createTuiStartFatalLogger } from "./boot/fatal-logger";

function createLogger(): AppLogger {
  return {
    child: () => createLogger(),
    captureError: (_label: string, error: unknown) =>
      error instanceof Error ? error.message : String(error),
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    event: () => {},
    measure: async () => undefined,
    flush: async () => undefined,
    bind: () => createLogger(),
  } as unknown as AppLogger;
}

describe("createTuiStartFatalLogger", () => {
  it("writes to the response pane while the screen is alive", () => {
    const entries: string[] = [];
    const logger = createLogger();
    const fatal = createTuiStartFatalLogger({
      logger,
      output: {
        write: (chunk: string) => {
          entries.push(chunk);
        },
      } as never,
      crashLogPath: "/tmp/crash.log",
      tuiState: { screenDestroyed: false } as never,
      appendActivity: (_kind, message) => {
        entries.push(message);
      },
      pushResponseEntry: (_label, body) => {
        entries.push(body);
      },
      truncate: (text) => text,
    });

    fatal("renderFailure", new Error("boom"));

    expect(entries).toEqual(["Error: boom", "boom"]);
  });

  it("writes to the crash log when the screen is destroyed", () => {
    const entries: string[] = [];
    const logger = createLogger();
    const fatal = createTuiStartFatalLogger({
      logger,
      output: {
        write: (chunk: string) => {
          entries.push(chunk);
        },
      } as never,
      crashLogPath: "/tmp/crash.log",
      tuiState: { screenDestroyed: true } as never,
      appendActivity: () => {
        entries.push("unexpected");
      },
      pushResponseEntry: () => {
        entries.push("unexpected");
      },
      truncate: (text) => text,
    });

    fatal("renderFailure", new Error("boom"));

    expect(entries).toEqual([
      "\nrenderFailure: boom\nCrash log: /tmp/crash.log\n",
    ]);
  });
});
