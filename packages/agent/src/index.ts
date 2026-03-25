#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHelpText } from "@/cli/help-text";
import {
  appendCliJobEvent,
  attachCliJob,
  cancelCliJob,
  cliJobStatusSummary,
  finalizeCliJob,
  getCliJob,
  launchCliBackgroundJob,
  markCliJobStarted,
  renderCliJobReplay,
  summarizeCliJob,
} from "@/cli/jobs";
import {
  restoreTerminalState,
  sanitizeSingleLineTerminalText,
} from "@/cli/render-utils";
import {
  ensureOnboarded,
  loadLocalRuntimeEnv,
  runOnboardingWizard,
} from "@/cli/startup";
import { encodeCliTurnEvent, renderCliTurnEvent } from "@/cli/turn-events";
import { loadConfig } from "@/config/env";
import { renderCommandCatalog } from "@/runtime/command-catalog";

function repoRoot(): string {
  // packages/agent/src/index.ts → ../../../ = repo root
  return fileURLToPath(new URL("../../../", import.meta.url));
}

// ---------------------------------------------------------------------------
// Subcommand routing — previously handled by the bash wrapper
// ---------------------------------------------------------------------------

type Subcommand =
  | "help"
  | "commands"
  | "start"
  | "cockpit"
  | "setup"
  | "install"
  | "doctor"
  | "dev"
  | "api"
  | "gateway"
  | "plain"
  | "exec"
  | "jobs";

interface OneShotOptions {
  prompt?: string;
  json: boolean;
  jsonStream: boolean;
  background: boolean;
  jobId?: string;
  sessionId?: string;
}

interface StaticResult {
  text: string;
  tone?: "info" | "success" | "warning" | "error" | "agent";
  shouldExit?: boolean;
}

function printOneShotResult(result: StaticResult, json: boolean): void {
  if (json) {
    console.log(
      JSON.stringify({
        ok: !result.shouldExit,
        tone: result.tone ?? "info",
        text: result.text,
      }),
    );
    return;
  }

  if (result.text) {
    console.log(result.text);
  }
}

function printCliJobRecord(
  job: ReturnType<typeof getCliJob> | ReturnType<typeof launchCliBackgroundJob>,
  json: boolean,
): void {
  if (!job) {
    return;
  }

  if (json) {
    console.log(JSON.stringify(job));
    return;
  }

  console.log(summarizeCliJob(job));
}

async function emitStaticPromptEvents(
  prompt: string,
  result: StaticResult,
  options?: {
    sessionId?: string;
  },
): Promise<void> {
  const timestamp = new Date().toISOString();
  const sessionId = options?.sessionId?.trim() || `static:${Date.now()}`;
  process.stdout.write(
    encodeCliTurnEvent({
      type: "start",
      timestamp,
      sessionId,
      command: prompt,
    }),
  );
  process.stdout.write(
    encodeCliTurnEvent({
      type: "result",
      timestamp: new Date().toISOString(),
      text: result.text,
      tone: result.tone ?? "info",
      shouldExit: result.shouldExit ?? false,
    }),
  );
  process.stdout.write(
    encodeCliTurnEvent({
      type: "completed",
      timestamp: new Date().toISOString(),
      status: result.shouldExit ? "cancelled" : "completed",
    }),
  );
}

function resolveSubcommand(): { command: Subcommand; rest: string[] } {
  // The first non-flag argument after the script path is the subcommand.
  // Bun.argv = [bunPath, scriptPath, ...userArgs]
  const userArgs = Bun.argv.slice(2);

  // Legacy flag-based invocation from the old bash wrapper
  if (userArgs.includes("--cli")) {
    return {
      command: "cockpit",
      rest: userArgs.filter((a) => a !== "--cli"),
    };
  }
  if (userArgs.includes("--help") || userArgs.includes("-h")) {
    return {
      command: "help",
      rest: userArgs.filter((a) => a !== "--help" && a !== "-h"),
    };
  }
  if (userArgs.includes("--cockpit")) {
    return {
      command: "cockpit",
      rest: userArgs.filter((a) => a !== "--cockpit"),
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
    help: "help",
    commands: "commands",
    cockpit: "cockpit",
    tui: "cockpit",
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
    exec: "exec",
    run: "exec",
    jobs: "jobs",
  };

  return {
    command: aliases[first] ?? "start",
    rest: aliases[first] ? rest : userArgs,
  };
}

function renderTopLevelHelp(): string {
  return [
    "Eliza Agent",
    "",
    "Terminal-first ElizaOS-native coding agent.",
    "",
    "Usage:",
    "  eliza-agent                 Start the plain interactive shell",
    "  eliza-agent commands        Browse slash commands and bundled workflows",
    "  eliza-agent cockpit         Open the fullscreen observability cockpit",
    '  eliza-agent exec -p "..."   Run one prompt and exit',
    '  eliza-agent exec -p "..." --json-stream',
    '  eliza-agent exec -p "..." --background',
    "  eliza-agent jobs list      Inspect background jobs",
    "  eliza-agent setup           Run onboarding",
    "  eliza-agent doctor          Check readiness and local setup",
    "",
    "Examples:",
    '  eliza-agent exec -p "summarize this repo"',
    '  eliza-agent exec -p "/status" --json',
    '  eliza-agent exec -p "review the repo" --background',
    "  eliza-agent jobs attach <job-id>",
    "  eliza-agent cockpit",
    "",
    "Legacy aliases:",
    "  eliza-agent plain",
    "  eliza-agent --cockpit",
    "  eliza-agent --plain-cli",
  ].join("\n");
}

function parseOneShotOptions(args: string[]): OneShotOptions {
  let prompt: string | undefined;
  let json = false;
  let jsonStream = false;
  let background = false;
  let jobId: string | undefined;
  let sessionId: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--json") {
      json = true;
      continue;
    }
    if (value === "--json-stream") {
      jsonStream = true;
      continue;
    }
    if (value === "--background") {
      background = true;
      continue;
    }
    if (value === "--prompt" || value === "-p") {
      prompt = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (value === "--job-id") {
      jobId = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (value === "--session-id") {
      sessionId = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    positional.push(value);
  }

  if (!prompt && positional.length > 0) {
    prompt = positional.join(" ");
  }

  return { prompt, json, jsonStream, background, jobId, sessionId };
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

async function readStdinText(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function resolveStaticPrompt(
  prompt: string | undefined,
  agentName: string,
  workspaceDir = repoRoot(),
): StaticResult | undefined {
  const trimmed = prompt?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === "/help") {
    return { text: buildHelpText(agentName) };
  }
  if (trimmed === "/commands") {
    return { text: renderCommandCatalog(undefined, 80, workspaceDir) };
  }
  if (trimmed.startsWith("/commands search ")) {
    const query = trimmed.replace("/commands search ", "").trim();
    return {
      text: query
        ? renderCommandCatalog(query, 80, workspaceDir)
        : "Usage: /commands search <query>",
    };
  }

  if (trimmed === "exit" || trimmed === "quit") {
    return { text: "Closing Eliza Agent.", shouldExit: true };
  }

  return undefined;
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
  return sanitizeSingleLineTerminalText(text);
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
  const shellIsInteractive = process.stdin.isTTY && process.stdout.isTTY;
  const oneShot = command === "exec" ? parseOneShotOptions(_rest) : undefined;
  const pipedPrompt =
    !shellIsInteractive && (command === "start" || command === "plain")
      ? await readStdinText()
      : undefined;
  const immediatePrompt = command === "exec" ? oneShot?.prompt : pipedPrompt;
  const staticPromptResult = resolveStaticPrompt(
    immediatePrompt,
    process.env.ELIZA_AGENT_NAME?.trim() || "Eliza",
    repoRoot(),
  );
  const jobControlDir = process.env.ELIZA_AGENT_JOB_CONTROL_DIR?.trim();

  if (command === "help") {
    console.log(renderTopLevelHelp());
    return;
  }

  if (command === "commands") {
    console.log(
      renderCommandCatalog(_rest.join(" ").trim() || undefined, 80, repoRoot()),
    );
    return;
  }

  if (
    command === "jobs" ||
    (command === "exec" && oneShot?.background) ||
    (command === "exec" && oneShot?.jsonStream)
  ) {
    loadLocalRuntimeEnv();
  }

  if (command === "jobs") {
    const config = loadConfig();
    const dataDir = jobControlDir || config.dataDir;
    const jobCommand = _rest[0] ?? "list";
    const jobArgs = _rest.slice(1);

    if (jobCommand === "list") {
      console.log(cliJobStatusSummary(dataDir));
      return;
    }

    if (jobCommand === "show") {
      const jobId = jobArgs[0]?.trim();
      if (!jobId) {
        console.error("Usage: eliza-agent jobs show <job-id>");
        process.exit(1);
      }
      const job = getCliJob(dataDir, jobId);
      if (!job) {
        console.error(`Background job not found: ${jobId}`);
        process.exit(1);
      }
      console.log(renderCliJobReplay(dataDir, jobId));
      return;
    }

    if (jobCommand === "attach") {
      const jobId = jobArgs[0]?.trim();
      if (!jobId) {
        console.error("Usage: eliza-agent jobs attach <job-id>");
        process.exit(1);
      }
      const job = await attachCliJob(dataDir, jobId, {
        onEvent: (event) => {
          process.stdout.write(`${renderCliTurnEvent(event)}\n`);
        },
      });
      if (!job) {
        console.error(`Background job not found: ${jobId}`);
        process.exit(1);
      }
      return;
    }

    if (jobCommand === "cancel") {
      const jobId = jobArgs[0]?.trim();
      if (!jobId) {
        console.error("Usage: eliza-agent jobs cancel <job-id>");
        process.exit(1);
      }
      const job = cancelCliJob(dataDir, jobId);
      if (!job) {
        console.error(`Background job not found: ${jobId}`);
        process.exit(1);
      }
      console.log(`Cancelled background job ${job.id}.`);
      return;
    }

    console.error("Usage: eliza-agent jobs <list|show|attach|cancel> [job-id]");
    process.exit(1);
  }

  if (staticPromptResult && !(command === "exec" && oneShot?.background)) {
    if (command === "exec" && oneShot?.jsonStream) {
      const activeJobId = oneShot.jobId?.trim() || undefined;
      await emitStaticPromptEvents(immediatePrompt ?? "", staticPromptResult, {
        sessionId: oneShot.sessionId,
      });
      if (activeJobId) {
        finalizeCliJob(
          jobControlDir || loadConfig().dataDir,
          activeJobId,
          staticPromptResult.shouldExit ? "cancelled" : "completed",
          0,
        );
      }
      return;
    }
    printOneShotResult(
      staticPromptResult,
      command === "exec" && !!oneShot?.json,
    );
    return;
  }

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

  if (command === "exec" && oneShot?.background) {
    if (!immediatePrompt?.trim()) {
      console.error(
        'Usage: eliza-agent exec --prompt "your request" --background',
      );
      process.exit(1);
    }
    if (oneShot.jsonStream) {
      console.error("Cannot combine --background with --json-stream.");
      process.exit(1);
    }
    await ensureOnboarded();
    loadLocalRuntimeEnv();
    const config = loadConfig();
    const launcherPath = Bun.argv[1];
    if (!launcherPath) {
      console.error("The launcher path is unavailable for background runs.");
      process.exit(1);
    }
    const job = launchCliBackgroundJob({
      config: {
        ...config,
        dataDir: jobControlDir || config.dataDir,
      },
      launcherPath,
      prompt: immediatePrompt,
      sessionId: oneShot.sessionId,
    });
    if (oneShot.json) {
      printCliJobRecord(job, true);
    } else {
      console.log(
        `Started background job ${job.id}. Use "eliza-agent jobs attach ${job.id}" to follow it live.`,
      );
    }
    return;
  }

  // ----- Runtime subcommands need env + onboarding -----

  if (command === "exec" && !immediatePrompt?.trim()) {
    console.error('Usage: eliza-agent exec --prompt "your request" [--json]');
    process.exit(1);
  }

  await ensureOnboarded();
  loadLocalRuntimeEnv();
  const shouldUseCliSurface =
    command === "start" ||
    command === "cockpit" ||
    command === "dev" ||
    command === "plain" ||
    command === "exec";
  const shouldUseApiSurface = command === "api" || command === "gateway";
  const shouldUseCockpitSurface = command === "cockpit";

  if (shouldUseCockpitSurface) {
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
  const runCliPrompt = cliModule?.runCliPrompt;
  const runCliPromptWithEvents = cliModule?.runCliPromptWithEvents;
  const startApiServer = serverModule?.startApiServer;

  // Ensure ELIZA_AGENT_MODE is set for the runtime
  if (
    command === "start" ||
    command === "cockpit" ||
    command === "dev" ||
    command === "plain" ||
    command === "exec"
  ) {
    process.env.ELIZA_AGENT_MODE ??= "cli";
  }

  const startupMode =
    command === "api" || command === "gateway" ? "api" : "cli";
  const eagerDeferredHydration = command === "api" || command === "gateway";
  const shouldCaptureBootLogs =
    command === "cockpit" ||
    ((command === "start" || command === "plain") && shellIsInteractive);
  const { result: context, logs: bootLogs } = await captureBootLogs(
    shouldCaptureBootLogs,
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
    shellIsInteractive &&
    (command === "start" ||
      command === "cockpit" ||
      command === "dev" ||
      command === "plain" ||
      (wantsCli && process.stdin.isTTY));

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

  if (
    (command === "exec" || (!shellIsInteractive && immediatePrompt?.trim())) &&
    immediatePrompt?.trim()
  ) {
    const controlDataDir = jobControlDir || context.config.dataDir;

    if (command === "exec" && oneShot?.jsonStream) {
      if (!runCliPromptWithEvents) {
        process.exit(1);
      }
      const sessionController = new AbortController();
      const activeJobId = oneShot.jobId?.trim() || undefined;
      if (activeJobId) {
        markCliJobStarted(controlDataDir, activeJobId, {
          pid: process.pid,
          sessionId: oneShot.sessionId,
        });
      }
      const writeEvent = (event: Parameters<typeof encodeCliTurnEvent>[0]) => {
        if (activeJobId) {
          appendCliJobEvent(controlDataDir, activeJobId, event);
        }
        process.stdout.write(encodeCliTurnEvent(event));
      };
      const finalizeActiveJob = (
        status: "completed" | "failed" | "cancelled",
        exitCode?: number,
      ) => {
        if (!activeJobId) {
          return;
        }
        finalizeCliJob(controlDataDir, activeJobId, status, exitCode);
      };
      try {
        await runCliPromptWithEvents(
          context,
          immediatePrompt,
          {
            onEvent: async (event) => {
              writeEvent(event);
            },
          },
          {
            abortSignal: sessionController.signal,
            sessionId: oneShot.sessionId,
          },
        );
        finalizeActiveJob("completed", 0);
      } catch (_error) {
        finalizeActiveJob(
          sessionController.signal.aborted ? "cancelled" : "failed",
          1,
        );
        process.exitCode = 1;
        return;
      }
      return;
    }

    const result = await runCliPrompt?.(context, immediatePrompt, {
      sessionId: oneShot?.sessionId,
    });
    if (!result) {
      process.exit(1);
    }
    printOneShotResult(result, command === "exec" && !!oneShot?.json);
    return;
  }

  if (shouldStartCli) {
    if (command === "plain") {
      Bun.argv.push("--plain-cli");
    } else if (command === "cockpit") {
      Bun.argv.push("--cockpit");
    }
    await startCli?.(context, {
      onReady: startServerWhenShellReady,
      bootLogs,
    });
  } else if (!wantsApi && command !== "api") {
    console.log(
      `${context.config.agentName} initialized. Set ELIZA_AGENT_MODE=cli|api|both or launch the plain shell/cockpit explicitly.`,
    );
  }
}

// Bun can exit early from executable entrypoints while long-lived async
// startup is still awaiting TUI/server promises. Keep one lightweight
// handle alive for the lifetime of main().
const entryKeepAlive = setInterval(() => {}, 60_000);

main()
  .catch((error) => {
    restoreTerminalState();
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
