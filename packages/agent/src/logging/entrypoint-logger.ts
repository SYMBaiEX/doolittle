import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AppLogger,
  type AppLogLevel,
  createNoopLogger,
} from "@/logging/logger";
import { LoggerService } from "@/services/logger-service";

const loggerCache = new Map<string, AppLogger>();

function defaultRepoRoot(): string {
  return fileURLToPath(new URL("../../../../", import.meta.url));
}

function normalizeMinLevel(value?: string): AppLogLevel {
  switch ((value ?? "").trim().toLowerCase()) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error":
    case "fatal":
      return value as AppLogLevel;
    default:
      return "info";
  }
}

function resolveDataDir(value?: string): string {
  const input =
    value?.trim() || process.env.DOOLITTLE_DATA_DIR?.trim() || ".doolittle";
  return resolve(defaultRepoRoot(), input);
}

function getRootLogger(dataDir?: string, stdoutTransport = false): AppLogger {
  const resolvedDataDir = resolveDataDir(dataDir);
  const cacheKey = `${resolvedDataDir}:${stdoutTransport ? "stdout" : "silent"}`;
  const cached = loggerCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  try {
    const logger = new LoggerService(resolvedDataDir, {
      name: "doolittle",
      scope: "doolittle.entrypoint",
      minLevel: normalizeMinLevel(process.env.DOOLITTLE_LOG_LEVEL),
      traceEnabled: process.env.DOOLITTLE_TUI_TRACE === "1",
      stdoutTransport,
      defaultFields: {
        dataDir: resolvedDataDir,
        entrypoint: true,
      },
      tags: ["doolittle", "entrypoint"],
    });
    loggerCache.set(cacheKey, logger);
    return logger;
  } catch {
    const fallback = createNoopLogger();
    loggerCache.set(cacheKey, fallback);
    return fallback;
  }
}

export function getEntrypointLogger(
  scope: string,
  options?: {
    dataDir?: string;
    stdoutTransport?: boolean;
    defaultFields?: Record<string, unknown>;
    tags?: string[];
  },
): AppLogger {
  let logger = getRootLogger(options?.dataDir, options?.stdoutTransport).child(
    scope,
    options?.defaultFields,
  );
  if (options?.tags?.length) {
    logger = logger.withTags(...options.tags);
  }
  return logger;
}
