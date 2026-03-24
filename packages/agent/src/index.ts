#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureOnboarded,
  loadLocalRuntimeEnv,
  runOnboardingWizard,
} from "@/cli/startup";

function repoRoot(): string {
  // packages/agent/src/index.ts → ../../../ = repo root
  return fileURLToPath(new URL("../../../", import.meta.url));
}

// ---------------------------------------------------------------------------
// Subcommand routing — previously handled by the bash wrapper
// ---------------------------------------------------------------------------

type Subcommand =
  | "start"
  | "setup"
  | "install"
  | "doctor"
  | "dev"
  | "api"
  | "gateway"
  | "plain";

function resolveSubcommand(): { command: Subcommand; rest: string[] } {
  // The first non-flag argument after the script path is the subcommand.
  // Bun.argv = [bunPath, scriptPath, ...userArgs]
  const userArgs = Bun.argv.slice(2);

  // Legacy flag-based invocation from the old bash wrapper
  if (userArgs.includes("--cli")) {
    return {
      command: "start",
      rest: userArgs.filter((a) => a !== "--cli"),
    };
  }
  if (userArgs.includes("--plain-cli")) {
    return {
      command: "plain",
      rest: userArgs.filter((a) => a !== "--plain-cli"),
    };
  }
  if (userArgs.includes("--api-only")) {
    return {
      command: "api",
      rest: userArgs.filter((a) => a !== "--api-only"),
    };
  }
  if (userArgs.includes("--gateway")) {
    return {
      command: "gateway",
      rest: userArgs.filter((a) => a !== "--gateway"),
    };
  }

  const first = userArgs[0] ?? "start";
  const rest = userArgs.slice(1);

  const aliases: Record<string, Subcommand> = {
    start: "start",
    setup: "setup",
    onboard: "setup",
    bootstrap: "setup",
    install: "install",
    doctor: "doctor",
    check: "doctor",
    dev: "dev",
    api: "api",
    gateway: "gateway",
    plain: "plain",
    "plain-cli": "plain",
  };

  return {
    command: aliases[first] ?? "start",
    rest: aliases[first] ? rest : userArgs,
  };
}

function formatTopLevelError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return String(error);
}

function isRecoverableTopLevelRuntimeError(error: unknown): boolean {
  const normalized = formatTopLevelError(error).toLowerCase();
  return [
    "cannot connect to api",
    "unable to connect",
    "failedtoopensocket",
    "connectionrefused",
    "rate limit",
    "unauthorized",
    "no output generated",
    "database is shutting down",
    "operation rejected",
    "pglite startup failed after automatic recovery",
  ].some((fragment) => normalized.includes(fragment));
}

function sanitizeBootLogLine(text: string): string {
  const esc = String.fromCharCode(27);
  const bel = String.fromCharCode(7);
  const controlChars = new RegExp(
    `[${[
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0c, 0x0d,
      0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
      0x1a, 0x1c, 0x1d, 0x1e, 0x1f, 0x7f,
    ]
      .map((value) => `\\x${value.toString(16).padStart(2, "0")}`)
      .join("")}]`,
    "g",
  );

  return text
    .replace(new RegExp(`${esc}\\[[0-?]*[ -/]*[@-~]`, "g"), "")
    .replace(new RegExp(`${esc}\\][^${bel}]*(?:${bel}|${esc}\\\\)`, "g"), "")
    .replace(controlChars, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function captureBootLogs<T>(
  enabled: boolean,
  task: () => Promise<T>,
): Promise<{
  result: T;
  logs: Array<{ source: "stdout" | "stderr"; text: string }>;
}> {
  if (!enabled) {
    return {
      result: await task(),
      logs: [],
    };
  }

  const logs: Array<{ source: "stdout" | "stderr"; text: string }> = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const intercept =
    (source: "stdout" | "stderr", _original: typeof process.stdout.write) =>
    (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ): boolean => {
      const text =
        typeof chunk === "string"
          ? chunk
          : Buffer.from(chunk).toString(
              typeof encoding === "string" ? encoding : "utf8",
            );
      const sanitized = sanitizeBootLogLine(text);
      if (sanitized) {
        logs.push({ source, text: sanitized });
      }
      if (typeof encoding === "function") {
        encoding();
      }
      callback?.();
      return true;
    };

  process.stdout.write = intercept(
    "stdout",
    originalStdoutWrite,
  ) as typeof process.stdout.write;
  process.stderr.write = intercept(
    "stderr",
    originalStderrWrite,
  ) as typeof process.stderr.write;

  try {
    return {
      result: await task(),
      logs,
    };
  } finally {
    process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
    process.stderr.write = originalStderrWrite as typeof process.stderr.write;
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { command, rest: _rest } = resolveSubcommand();

  // ----- Delegated subcommands that don't need the full runtime -----

  if (command === "setup") {
    await runOnboardingWizard(_rest);
    return;
  }

  if (command === "doctor") {
    await runOnboardingWizard(["--check", ..._rest]);
    return;
  }

  if (command === "install") {
    const root = repoRoot();
    const installScript = resolve(root, "scripts", "install.sh");
    if (!existsSync(installScript)) {
      console.error("Install script not found at scripts/install.sh.");
      process.exit(1);
    }
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("bash", [installScript, ..._rest], {
      stdio: "inherit",
      cwd: root,
    });
    process.exit(result.status ?? 0);
  }

  // ----- Runtime subcommands need env + onboarding -----

  await ensureOnboarded();
  loadLocalRuntimeEnv();
  const shouldUseCliSurface =
    command === "start" || command === "dev" || command === "plain";
  const shouldUseApiSurface = command === "api" || command === "gateway";

  // Show splash for interactive CLI modes
  if (shouldUseCliSurface) {
    const { showBootSplash } = await import("@/cli/splash");
    await showBootSplash();
  }

  const bootstrapModulePromise = import("@/runtime/bootstrap");
  const cliModulePromise = shouldUseCliSurface ? import("@/cli") : undefined;
  const serverModulePromise = shouldUseApiSurface
    ? import("@/server")
    : undefined;

  const [{ getAppContext }, cliModule, serverModule] = await Promise.all([
    bootstrapModulePromise,
    cliModulePromise,
    serverModulePromise,
  ]);
  const startCli = cliModule?.startCli;
  const startApiServer = serverModule?.startApiServer;

  // Ensure ELIZA_AGENT_MODE is set for the runtime
  if (command === "start" || command === "dev" || command === "plain") {
    process.env.ELIZA_AGENT_MODE ??= "cli";
  }

  const startupMode =
    command === "api" || command === "gateway" ? "api" : "cli";
  const eagerDeferredHydration = command === "api" || command === "gateway";
  const { result: context, logs: bootLogs } = await captureBootLogs(
    shouldUseCliSurface,
    async () =>
      getAppContext({
        startupMode,
        eagerDeferredHydration,
      }),
  );
  const wantsCli =
    context.config.mode === "cli" || context.config.mode === "both";
  const wantsApi =
    context.config.mode === "api" || context.config.mode === "both";
  const shouldStartCli =
    command === "start" ||
    command === "dev" ||
    command === "plain" ||
    (wantsCli && process.stdin.isTTY);

  const shouldStartApi = wantsApi || command === "api" || command === "gateway";
  let backgroundServerStarted = false;
  const startServer = async () => {
    try {
      await context.ensureDeferredHydration("api");
      if (!startApiServer) {
        const server = await import("@/server");
        server.startApiServer(context);
      } else {
        startApiServer(context);
      }
      if (!shouldStartCli || command === "api" || command === "gateway") {
        console.log(
          `${context.config.agentName} API listening on http://${context.config.host}:${context.config.port}`,
        );
      }
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "EADDRINUSE" && command !== "api" && command !== "gateway") {
        console.warn(
          `API port ${context.config.port} is already in use. Continuing with local CLI only.`,
        );
      } else {
        throw error;
      }
    }
  };
  const startServerWhenShellReady = () => {
    if (!shouldStartApi || backgroundServerStarted) {
      return;
    }
    backgroundServerStarted = true;
    void startServer().catch((error) => {
      console.warn(
        `Background API startup failed: ${formatTopLevelError(error)}`,
      );
    });
  };

  if (shouldStartApi) {
    if (command === "api" || command === "gateway" || !shouldStartCli) {
      await startServer();
    }
  }

  if (command === "gateway") {
    await context.gateway.start();
    console.log(`${context.config.agentName} gateway started.`);
  }

  if (shouldStartCli) {
    if (command === "plain") {
      Bun.argv.push("--plain-cli");
    }
    await startCli?.(context, {
      onReady: startServerWhenShellReady,
      bootLogs,
    });
  } else if (!wantsApi && command !== "api") {
    console.log(
      `${context.config.agentName} initialized. Set ELIZA_AGENT_MODE=cli|api|both or use --cli.`,
    );
  }
}

// Bun can exit early from executable entrypoints while long-lived async
// startup is still awaiting TUI/server promises. Keep one lightweight
// handle alive for the lifetime of main().
const entryKeepAlive = setInterval(() => {}, 60_000);

main()
  .catch((error) => {
    if (isRecoverableTopLevelRuntimeError(error)) {
      console.error(formatTopLevelError(error));
    } else {
      console.error(error);
    }
    process.exit(1);
  })
  .finally(() => {
    clearInterval(entryKeepAlive);
  });
