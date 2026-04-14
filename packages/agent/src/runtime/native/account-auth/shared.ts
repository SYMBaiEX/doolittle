import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

export const DEFAULT_REFRESH_SKEW_SECONDS = 120;

export function resolveHome(homePath?: string): string {
  return homePath?.trim() || process.env.HOME?.trim() || homedir();
}

export function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

export function readCommandText(
  command: string,
  args: string[],
  homePath?: string,
): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: resolveHome(homePath),
    },
  });
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

export function readCommandJson(
  command: string,
  args: string[],
  homePath?: string,
): unknown {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: resolveHome(homePath),
    },
  });
  if (result.status !== 0 || !result.stdout?.trim()) {
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
