import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnTextProcess } from "@/services/process-execution";
import type { BrowserConfig } from "./service-types";

async function runCommand(
  cmd: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { child, completed } = spawnTextProcess(cmd[0] ?? "", cmd.slice(1));
  const timer = setTimeout(() => child.kill(), timeoutMs);
  const { stdout, stderr, exitCode } = await completed.finally(() =>
    clearTimeout(timer),
  );

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

export function resolveBrowserCommand(binary: string): string | null {
  if (!binary.trim()) {
    return null;
  }

  if (binary.includes("/")) {
    try {
      accessSync(binary, constants.X_OK);
      return binary;
    } catch {
      return null;
    }
  }

  for (const pathEntry of (process.env.PATH ?? "").split(delimiter)) {
    if (!pathEntry) {
      continue;
    }
    try {
      const candidate = join(pathEntry, binary);
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue scanning PATH entries until we find an executable match.
    }
  }

  return null;
}

export async function browserCommandExists(binary: string): Promise<boolean> {
  return resolveBrowserCommand(binary) !== null;
}

export async function fetchWithBasic(
  url: string,
): Promise<{ body: string; contentType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Web fetch failed (${response.status}): ${await response.text()}`,
    );
  }
  return {
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "text/plain",
  };
}

export async function fetchWithLightpanda(
  url: string,
  config: BrowserConfig,
): Promise<{ body: string; contentType: string }> {
  const resolvedCommand = resolveBrowserCommand(config.command);
  if (!resolvedCommand) {
    throw new Error(`Lightpanda command is not available: ${config.command}.`);
  }

  const args = [
    resolvedCommand,
    "fetch",
    ...(config.obeyRobots ? ["--obey_robots"] : []),
    url,
  ];

  const result = await runCommand(args, 20_000);
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr ||
        `Lightpanda fetch failed with exit code ${result.exitCode}.`,
    );
  }

  return {
    body: result.stdout,
    contentType: "text/html; charset=utf-8",
  };
}
