import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { runTextProcessSync } from "@/services/process-execution";

export const DEFAULT_REFRESH_SKEW_SECONDS = 120;
const COMMAND_CACHE_TTL_MS = 1_000;
const commandCache = new Map<
  string,
  {
    capturedAt: number;
    result: ReturnType<typeof runTextProcessSync>;
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
    const result = runCachedCommand(command, args, homePath, "command-text");
    return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  } catch {
    return "";
  }
}

function runCachedCommand(
  command: string,
  args: string[],
  homePath: string | undefined,
  purpose: string,
) {
  const home = resolveHome(homePath);
  const key = JSON.stringify([command, args, home]);
  const cached = commandCache.get(key);
  if (cached && Date.now() - cached.capturedAt < COMMAND_CACHE_TTL_MS) {
    return cached.result;
  }
  const result = runTextProcessSync(command, args, {
    env: {
      HOME: home,
    },
    timeoutMs: 10_000,
    toolName: `doolittle.account-auth.${purpose}`,
  });
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
  let result: ReturnType<typeof runTextProcessSync>;
  try {
    result = runCachedCommand(command, args, homePath, "command-json");
  } catch {
    return undefined;
  }
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function readJsonIfExists(
  path: string,
  readJsonValue: (path: string) => unknown = readJson,
): unknown {
  return existsSync(path) ? readJsonValue(path) : undefined;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
