import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import type { BackendState } from "../shared/contracts";
import { BackendUrlParser } from "./backend-url";
import { providerAuthExecutableCandidates } from "./provider-auth";

const STARTUP_TIMEOUT_MS = 45_000;
const HEALTH_POLL_MS = 250;
const STARTUP_OUTPUT_LIMIT = 16_000;
const SHUTDOWN_GRACE_MS = 3_000;
const FORCE_EXIT_WAIT_MS = 2_000;
const EXIT_DIAGNOSTIC_LIMIT = 2_000;
const MIN_ENV_SECRET_LENGTH = 8;
const SENSITIVE_ENV_KEY_PATTERN =
  /(?:api[_-]?key|auth|authorization|bearer|cookie|password|secret|access[_-]?token|refresh[_-]?token|id[_-]?token)\b/i;
const AUTHORIZATION_VALUE_PATTERN =
  /(["']?\bauthorization\b["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,;}]+)/giu;
const BEARER_VALUE_PATTERN = /(\bbearer\s+)[a-z0-9._~+/=-]+/giu;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /(["']?(?:[a-z0-9_-]*(?:api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token|id[_-]?token))\b["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/giu;

type StoppableChild = Pick<
  ChildProcess,
  "exitCode" | "signalCode" | "kill" | "once"
>;

async function waitForExit(
  child: StoppableChild,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolvePromise) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise(exited);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", () => finish(true));
  });
}

/** Stop a runtime process without allowing a replacement to overlap it. */
export async function terminateBackendChild(
  child: StoppableChild,
  graceMs = SHUTDOWN_GRACE_MS,
  forceWaitMs = FORCE_EXIT_WAIT_MS,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, graceMs)) return;

  child.kill("SIGKILL");
  if (await waitForExit(child, forceWaitMs)) return;
  throw new Error(
    "The previous Doolittle runtime did not exit after SIGKILL; restart was cancelled to protect the local database.",
  );
}

export function backendExitDetail(
  code: number | null,
  signal: NodeJS.Signals | null,
  output: string,
): string {
  const summary = `Runtime exited (${signal ?? `code ${code ?? "unknown"}`}).`;
  const diagnostic = sanitizeBackendDiagnostic(output);
  return diagnostic
    ? `${summary}\nRecent runtime output:\n${diagnostic}`
    : summary;
}

export function recordUnexpectedBackendExit(
  runtimeDataDir: string,
  detail: string,
  code: number | null,
  signal: NodeJS.Signals | null,
): void {
  try {
    const logDir = resolve(runtimeDataDir, "logs");
    mkdirSync(logDir, { recursive: true });
    appendFileSync(
      resolve(logDir, "desktop-backend.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        event: "runtime-exit",
        code,
        signal,
        detail,
      })}\n`,
      "utf8",
    );
  } catch {
    // The renderer still receives the degraded state below. Diagnostics must
    // never turn one backend failure into a main-process failure.
  }
}

function sanitizeBackendDiagnostic(output: string): string {
  let redacted = output
    .replace(AUTHORIZATION_VALUE_PATTERN, "$1[REDACTED]")
    .replace(BEARER_VALUE_PATTERN, "$1[REDACTED]")
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, "$1[REDACTED]");
  for (const [key, secret] of Object.entries(process.env)) {
    if (
      !SENSITIVE_ENV_KEY_PATTERN.test(key) ||
      !secret ||
      secret.length < MIN_ENV_SECRET_LENGTH
    ) {
      continue;
    }
    redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted.trim().slice(-EXIT_DIAGNOSTIC_LIMIT);
}

export function isRecoverablePgliteStartupFailure(output: string): boolean {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("pglite") &&
    (normalized.includes("aborted()") ||
      normalized.includes("initialization failed") ||
      normalized.includes("startup failed"))
  );
}

export function preserveFailedPgliteDataDir(
  runtimeDataDir: string,
  stamp = Date.now(),
): string | null {
  const dataDir = resolve(runtimeDataDir, "pglite");
  if (!existsSync(dataDir)) return null;

  const backupDir = `${dataDir}.failed-${stamp}`;
  renameSync(dataDir, backupDir);
  mkdirSync(dataDir, { recursive: true });
  return backupDir;
}

export function buildBackendEnvironment(
  runtimeDataDir: string,
  repoRoot: string,
  workspaceDir: string,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const providerPath = Array.from(
    new Set(
      (["codex", "claude-code"] as const)
        .flatMap((provider) =>
          providerAuthExecutableCandidates(provider, {
            environment: baseEnvironment,
          }),
        )
        .map((candidate) => dirname(candidate))
        .concat((baseEnvironment.PATH ?? "").split(delimiter))
        .filter(Boolean),
    ),
  ).join(delimiter);
  const environment: NodeJS.ProcessEnv = {
    ...baseEnvironment,
    PATH: providerPath,
    DOOLITTLE_REPO_ROOT: repoRoot,
    ELIZA_API_BIND: "127.0.0.1",
    ELIZA_API_PORT: "0",
    DOOLITTLE_MODE: "api",
    DOOLITTLE_DESKTOP_RUNTIME: "1",
    DOOLITTLE_OFFLINE_BOOTSTRAP:
      baseEnvironment.DOOLITTLE_OFFLINE_BOOTSTRAP || "true",
    DOOLITTLE_USE_LINKED_DEVIN_AUTH:
      baseEnvironment.DOOLITTLE_USE_LINKED_DEVIN_AUTH || "false",
    // Desktop provider sign-in explicitly supports the official Claude CLI
    // session. Do not let a project-local .env disable that app capability
    // merely because Doolittle was launched from the project directory.
    DOOLITTLE_CLAUDE_CODE_CLI_FALLBACK: "true",
    DOOLITTLE_DATA_DIR: runtimeDataDir,
    // Generated skills and their metadata are mutable. Keep them in the
    // desktop data directory so a packaged, signed application never writes
    // into its sealed Resources tree.
    DOOLITTLE_SKILLS_DIR: resolve(runtimeDataDir, "skills"),
    ELIZAOS_BUNDLED_SKILLS_DIR: resolve(repoRoot, "packages", "skills"),
    DOOLITTLE_WORKSPACE_DIR: workspaceDir,
    DOOLITTLE_GATEWAY_DATA_DIR: resolve(runtimeDataDir, "gateway"),
    DOOLITTLE_HOOKS_DIR: resolve(runtimeDataDir, "hooks"),
    PGLITE_DATA_DIR: resolve(runtimeDataDir, "pglite"),
    DATABASE_URL: "",
    POSTGRES_URL: "",
  };

  // The backend runs through Electron's embedded Node binary. Never forward
  // host loaders or debugger hooks that Electron rejected for its own process.
  delete environment.NODE_OPTIONS;
  return environment;
}

export function findRepoRoot(startPaths: string[]): string {
  for (const startPath of startPaths) {
    let current = resolve(startPath);
    while (dirname(current) !== current) {
      if (existsSync(resolve(current, "packages/agent/src/index.ts")))
        return current;
      current = dirname(current);
    }
  }
  throw new Error("Could not locate the Doolittle repository root.");
}

export interface BackendLaunchTarget {
  executable: string;
  args: string[];
  repoRoot: string;
  environment?: NodeJS.ProcessEnv;
}

export function findPackagedRuntime(
  resourcesPath: string,
): BackendLaunchTarget | null {
  const runtimeRoot = resolve(resourcesPath, "runtime");
  const entry = resolve(runtimeRoot, "bin", "doolittle-runtime.mjs");
  return existsSync(entry)
    ? {
        executable: process.execPath,
        args: [entry, "api"],
        repoRoot: runtimeRoot,
        environment: { ELECTRON_RUN_AS_NODE: "1" },
      }
    : null;
}

export function sourceRuntimeTarget(repoRoot: string): BackendLaunchTarget {
  return {
    executable: resolveNubExecutable(repoRoot),
    args: ["packages/agent/src/index.ts", "api"],
    repoRoot,
  };
}

export class BackendManager {
  private child: ChildProcess | null = null;
  private state: BackendState = {
    phase: "stopped",
    message: "The local runtime is stopped.",
  };
  private readonly listeners = new Set<(state: BackendState) => void>();
  private startup: Promise<BackendState> | null = null;
  private stopping = false;
  private activeStops = 0;

  constructor(
    private readonly target: BackendLaunchTarget,
    private readonly runtimeDataDir: string,
    private workspaceDir: string,
    private readonly runtimeFetch: typeof fetch = fetch,
  ) {}

  getState(): BackendState {
    return { ...this.state };
  }

  getWorkspaceDirectory(): string {
    return this.workspaceDir;
  }

  subscribe(listener: (state: BackendState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): Promise<BackendState> {
    if (this.activeStops > 0) return Promise.resolve(this.getState());
    if (this.state.phase === "ready") return Promise.resolve(this.getState());
    if (this.startup) return this.startup;
    this.startup = this.startImpl().finally(() => {
      this.startup = null;
    });
    return this.startup;
  }

  async restart(
    message = "Restarting the private Doolittle runtime…",
  ): Promise<BackendState> {
    // Publish the transition before terminating the old process. Renderer
    // requests made during a workspace handoff can then wait for the next
    // runtime instead of racing the socket that is about to close.
    this.update({
      phase: "booting",
      message,
    });
    await this.stop(false);
    const pendingStartup = this.startup;
    if (pendingStartup) await pendingStartup;
    return this.start();
  }

  async switchWorkspace(workspaceDir: string): Promise<BackendState> {
    const nextWorkspace = resolve(workspaceDir);
    if (nextWorkspace === this.workspaceDir) return this.getState();

    let state = this.getState();
    if (state.phase !== "ready" || !state.url) {
      if (state.phase === "stopped" || state.phase === "degraded") {
        this.workspaceDir = nextWorkspace;
      }
      state = await this.start();
    }
    if (state.phase !== "ready" || !state.url) {
      throw new Error(
        state.detail ?? "The local runtime was not ready to change workspaces.",
      );
    }

    const response = await this.runtimeFetch(`${state.url}/runtime/workspace`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceDir: nextWorkspace }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : `The runtime rejected the workspace change (${response.status}).`,
      );
    }
    const payload = (await response.json()) as {
      workspaceDir?: unknown;
      processId?: unknown;
    };
    if (
      typeof payload.workspaceDir !== "string" ||
      resolve(payload.workspaceDir) !== nextWorkspace
    ) {
      throw new Error("The runtime did not confirm the selected workspace.");
    }
    if (
      typeof payload.processId !== "number" ||
      !Number.isSafeInteger(payload.processId) ||
      payload.processId <= 0
    ) {
      throw new Error("The runtime returned an invalid process identity.");
    }

    this.workspaceDir = payload.workspaceDir;
    return this.getState();
  }

  private async startImpl(
    pgliteRecoveryAttempted = false,
  ): Promise<BackendState> {
    this.stopping = false;
    this.update({
      phase: "booting",
      message: "Starting the private Doolittle runtime…",
    });

    let recentOutput = "";
    const urlParser = new BackendUrlParser();
    let resolveUrl: ((url: string) => void) | undefined;
    let rejectUrl: ((error: Error) => void) | undefined;
    const urlPromise = new Promise<string>((resolvePromise, rejectPromise) => {
      resolveUrl = resolvePromise;
      rejectUrl = rejectPromise;
    });

    const child = spawn(this.target.executable, this.target.args, {
      cwd: this.target.repoRoot,
      env: buildBackendEnvironment(
        this.runtimeDataDir,
        this.target.repoRoot,
        this.workspaceDir,
        {
          ...process.env,
          ...this.target.environment,
        },
      ),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

    const consume = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      recentOutput = `${recentOutput}${text}`.slice(-STARTUP_OUTPUT_LIMIT);
      const parsed = urlParser.push(text);
      if (parsed) resolveUrl?.(parsed);
    };
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("error", (error) => rejectUrl?.(error));
    child.once("exit", (code, signal) => {
      if (this.child === child) this.child = null;
      const detail = backendExitDetail(code, signal, recentOutput);
      rejectUrl?.(new Error(detail));
      if (!this.stopping) {
        recordUnexpectedBackendExit(this.runtimeDataDir, detail, code, signal);
        this.update({
          phase: "degraded",
          message: "Doolittle’s local runtime stopped unexpectedly.",
          detail,
        });
      }
    });

    const timeout = setTimeout(() => {
      rejectUrl?.(
        new Error(
          `Timed out waiting for the runtime listening URL.${recentOutput ? `\n${recentOutput}` : ""}`,
        ),
      );
    }, STARTUP_TIMEOUT_MS);

    try {
      const url = await urlPromise;
      await this.waitForHealth(url);
      const next: BackendState = {
        phase: "ready",
        url,
        message: "Local runtime ready",
      };
      this.update(next);
      return next;
    } catch (error) {
      // This stop is startup cleanup, not a shutdown request. Preserve an
      // already-requested shutdown so recovery cannot relaunch the backend.
      await this.stopChild(false);
      const detail = error instanceof Error ? error.message : String(error);
      if (this.stopping) return this.getState();
      if (
        !pgliteRecoveryAttempted &&
        isRecoverablePgliteStartupFailure(recentOutput)
      ) {
        try {
          preserveFailedPgliteDataDir(this.runtimeDataDir);
          this.update({
            phase: "booting",
            message: "Recovering the local database and restarting Doolittle…",
          });
          if (this.stopping) return this.getState();
          return this.startImpl(true);
        } catch (recoveryError) {
          const recoveryDetail =
            recoveryError instanceof Error
              ? recoveryError.message
              : String(recoveryError);
          const next: BackendState = {
            phase: "degraded",
            message: "Doolittle could not recover its local database.",
            detail: `${detail} Recovery failed: ${recoveryDetail}`,
          };
          this.update(next);
          return next;
        }
      }
      const next: BackendState = {
        phase: "degraded",
        message: "Doolittle could not start its local runtime.",
        detail,
      };
      this.update(next);
      return next;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async waitForHealth(url: string): Promise<void> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    let lastError = "Health endpoint did not respond.";
    while (Date.now() < deadline) {
      try {
        const response = await this.runtimeFetch(`${url}/health`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (response.ok) return;
        lastError = `Health endpoint returned ${response.status}.`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, HEALTH_POLL_MS),
      );
    }
    throw new Error(`Runtime health check timed out: ${lastError}`);
  }

  async stop(updateState = true): Promise<void> {
    this.stopping = true;
    this.activeStops += 1;
    try {
      await this.stopChild(updateState);
    } finally {
      this.activeStops -= 1;
    }
  }

  private async stopChild(updateState = true): Promise<void> {
    const child = this.child;
    if (!child) {
      if (updateState) {
        this.update({
          phase: "stopped",
          message: "The local runtime is stopped.",
        });
      }
      return;
    }
    try {
      await terminateBackendChild(child);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.update({
        phase: "degraded",
        message: "Doolittle could not stop its previous local runtime.",
        detail,
      });
      throw error;
    }
    if (this.child === child) this.child = null;
    if (updateState) {
      this.update({
        phase: "stopped",
        message: "The local runtime is stopped.",
      });
    }
  }

  private update(state: BackendState): void {
    this.state = state;
    for (const listener of this.listeners) listener(this.getState());
  }
}

function resolveNubExecutable(repoRoot: string): string {
  if (process.env.DOOLITTLE_NUB_PATH) return process.env.DOOLITTLE_NUB_PATH;
  const executable = process.platform === "win32" ? "nub.exe" : "nub";
  const candidates = [
    resolve(repoRoot, "node_modules", ".bin", executable),
    resolve(homedir(), ".nub", "bin", executable),
    resolve(homedir(), ".local", "bin", executable),
    ...(process.platform === "darwin"
      ? ["/opt/homebrew/bin/nub", "/usr/local/bin/nub"]
      : []),
  ];
  return candidates.find(existsSync) ?? executable;
}
