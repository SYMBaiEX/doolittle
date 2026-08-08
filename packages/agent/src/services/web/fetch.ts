import { lookup } from "node:dns/promises";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import {
  fetchWithSsrfGuard,
  type LookupFn,
  type SsrfPolicy,
} from "@elizaos/core";
import { runTextProcess } from "@/services/process-execution";
import type { BrowserConfig } from "./service-types";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface BasicFetchDependencies {
  fetchImpl?: FetchLike;
  lookupFn?: LookupFn;
}

const nodeLookup: LookupFn = async (hostname) =>
  lookup(hostname, { all: true });

export function resolveBasicFetchPolicy(url: URL): SsrfPolicy | undefined {
  return url.hostname.toLowerCase() === "localhost"
    ? { allowedHostnames: ["localhost"] }
    : undefined;
}

async function runCommand(
  cmd: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { stdout, stderr, exitCode } = await runTextProcess(
    cmd[0] ?? "",
    cmd.slice(1),
    {
      timeoutMs,
      toolName: "doolittle.web.lightpanda",
    },
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
  dependencies: BasicFetchDependencies = {},
): Promise<{ body: string; contentType: string }> {
  const parsed = new URL(url);
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;

  if (parsed.protocol === "data:") {
    const response = await fetchImpl(url);
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

  const guarded = await fetchWithSsrfGuard({
    url,
    fetchImpl,
    lookupFn: dependencies.lookupFn ?? nodeLookup,
    policy: resolveBasicFetchPolicy(parsed),
    timeoutMs: 20_000,
  });
  try {
    if (!guarded.response.ok) {
      throw new Error(
        `Web fetch failed (${guarded.response.status}): ${await guarded.response.text()}`,
      );
    }
    return {
      body: await guarded.response.text(),
      contentType: guarded.response.headers.get("content-type") ?? "text/plain",
    };
  } finally {
    await guarded.release();
  }
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
