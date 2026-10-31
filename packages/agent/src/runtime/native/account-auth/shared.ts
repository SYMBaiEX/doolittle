import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { resolveShellExecutionMode } from "@elizaos/agent/services/shell-execution-router";
import {
  readJsonFileSync,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import { sanitizeSpawnEnv } from "@elizaos/core";

export const DEFAULT_REFRESH_SKEW_SECONDS = 120;
const COMMAND_CACHE_TTL_MS = 1_000;
const commandCache = new Map<
  string,
  {
    capturedAt: number;
    result: SpawnSyncReturns<string>;
  }
>();

export function resolveHome(homePath?: string): string {
  return homePath?.trim() || process.env.HOME?.trim() || homedir();
}

export function commandExists(command: string): boolean {
  const candidates =
    isAbsolute(command) || command.includes("/")
      ? [command]
      : (process.env.PATH ?? "")
          .split(delimiter)
          .filter(Boolean)
          .flatMap((entry) =>
            process.platform === "win32"
              ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT")
                  .split(";")
                  .map((extension) => join(entry, `${command}${extension}`))
              : [join(entry, command)],
          );
  return candidates.some((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function readCommandText(
  command: string,
  args: string[],
  homePath?: string,
): string {
  try {
    const result = runCachedCommand(command, args, homePath);
    return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  } catch {
    return "";
  }
}

function runCachedCommand(
  command: string,
  args: string[],
  homePath: string | undefined,
) {
  // Local credential probes must never turn restricted execution into host access.
  if (resolveShellExecutionMode() !== "local-yolo")
    throw new Error("Local account CLI probes require host execution.");
  const home = resolveHome(homePath);
  const key = JSON.stringify([command, args, home]);
  const cached = commandCache.get(key);
  if (cached && Date.now() - cached.capturedAt < COMMAND_CACHE_TTL_MS) {
    return cached.result;
  }
  const result = spawnSync(command, args, {
    env: { ...sanitizeSpawnEnv(process.env), HOME: home },
    timeout: 10_000,
    killSignal: "SIGKILL",
    maxBuffer: 2 * 1024 * 1024,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  commandCache.set(key, {
    capturedAt: Date.now(),
    result,
  });
  return result;
}

export function readCommandJson(
  command: string,
  args: string[],
  homePath?: string,
): unknown {
  let result: SpawnSyncReturns<string>;
  try {
    result = runCachedCommand(command, args, homePath);
  } catch {
    return undefined;
  }
  if (result.status !== 0 || !result.stdout.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

export function readJson(path: string): unknown {
  return readJsonFileSync(path) ?? undefined;
}

export function readJsonIfExists(
  path: string,
  readJsonValue: (path: string) => unknown = readJson,
): unknown {
  return existsSync(path) ? readJsonValue(path) : undefined;
}

export function writeJson(path: string, value: unknown): void {
  writeJsonAtomicSync(path, value, { trailingNewline: true });
}

export function decodeJwtPayload(
  token?: string,
): Record<string, unknown> | undefined {
  const parts = token?.split(".");
  if (!parts || parts.length < 2) {
    return undefined;
  }
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}

export function isUnixSecondsExpiring(
  expiresAtSeconds?: number,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  if (!expiresAtSeconds || !Number.isFinite(expiresAtSeconds)) {
    return false;
  }
  return Date.now() >= expiresAtSeconds * 1000 - skewSeconds * 1000;
}

export function isUnixMillisecondsExpiring(
  expiresAtMs?: number,
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  if (!expiresAtMs || !Number.isFinite(expiresAtMs)) {
    return false;
  }
  return Date.now() >= expiresAtMs - skewSeconds * 1000;
}
