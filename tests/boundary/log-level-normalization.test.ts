import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { getEntrypointLogger } from "../../packages/agent/src/logging/entrypoint-logger";
import type { AppLogLevel } from "../../packages/agent/src/logging/logger";
import { LoggerService } from "../../packages/agent/src/services/logger-service";

afterEach(() => {
  vi.unstubAllEnvs();
});

it.each([
  ["warn", "warn"],
  ["WARN", "warn"],
  [" warn ", "warn"],
  [" TrAcE ", "trace"],
  [" DEBUG ", "debug"],
  [" INFO ", "info"],
  [" ERROR ", "error"],
  [" FATAL ", "fatal"],
  [undefined, "info"],
  ["", "info"],
  ["   ", "info"],
  ["invalid", "info"],
] as const)("logs with LOG_LEVEL=%j as %s", async (value, expected) => {
  vi.stubEnv("LOG_LEVEL", value);
  const dataDir = await mkdtemp(join(tmpdir(), "doolittle-log-level-"));
  try {
    const direct = new LoggerService(dataDir);
    const entrypointDir = join(dataDir, "entrypoint");
    const entrypoint = getEntrypointLogger("level-test", {
      dataDir: entrypointDir,
    });
    const levels: AppLogLevel[] = [
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ];
    for (const logger of [direct, entrypoint]) {
      for (const [index, level] of levels.entries()) {
        expect(logger.isLevelEnabled(level)).toBe(
          index >= levels.indexOf(expected),
        );
      }
      logger.fatal("log-level fixture");
    }
    expect(direct.list().map((record) => record.message)).toEqual([
      "log-level fixture",
    ]);
    expect(
      new LoggerService(entrypointDir).list().map((record) => record.message),
    ).toEqual(["log-level fixture"]);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
