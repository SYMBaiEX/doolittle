import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { BackendState } from "../shared/contracts";
import { BackendUrlParser } from "./backend-url";

const STARTUP_TIMEOUT_MS = 45_000;
const HEALTH_POLL_MS = 250;
const STARTUP_OUTPUT_LIMIT = 16_000;

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
  return {
    ...baseEnvironment,
    DOOLITTLE_REPO_ROOT: repoRoot,
    DOOLITTLE_HOST: "127.0.0.1",
    DOOLITTLE_PORT: "0",
    DOOLITTLE_MODE: "api",
    DOOLITTLE_OFFLINE_BOOTSTRAP:
      baseEnvironment.DOOLITTLE_OFFLINE_BOOTSTRAP || "true",
    DOOLITTLE_USE_LINKED_DEVIN_AUTH:
      baseEnvironment.DOOLITTLE_USE_LINKED_DEVIN_AUTH || "false",
    DOOLITTLE_DATA_DIR: runtimeDataDir,
    DOOLITTLE_SKILLS_DIR: resolve(repoRoot, "packages", "skills"),
    ELIZAOS_BUNDLED_SKILLS_DIR: resolve(repoRoot, "packages", "skills"),
    DOOLITTLE_WORKSPACE_DIR: workspaceDir,
    DOOLITTLE_CRON_OUTPUT_DIR: resolve(runtimeDataDir, "cron-output"),
    DOOLITTLE_GATEWAY_DATA_DIR: resolve(runtimeDataDir, "gateway"),
    DOOLITTLE_HOOKS_DIR: resolve(runtimeDataDir, "hooks"),
    PGLITE_DATA_DIR: resolve(runtimeDataDir, "pglite"),
    DATABASE_URL: "",
    POSTGRES_URL: "",
  };
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
}

export function findPackagedRuntime(
  resourcesPath: string,
): BackendLaunchTarget | null {
  const runtimeRoot = resolve(resourcesPath, "runtime");
  const executable = resolve(
    runtimeRoot,
    "bin",
    process.platform === "win32"
      ? "doolittle-runtime.exe"
      : "doolittle-runtime",
  );
  return existsSync(executable)
    ? { executable, args: ["api"], repoRoot: runtimeRoot }
    : null;
}

export function sourceRuntimeTarget(repoRoot: string): BackendLaunchTarget {
  return {
    executable: resolveBunExecutable(),
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

  constructor(
    private readonly target: BackendLaunchTarget,
    private readonly runtimeDataDir: string,
    private workspaceDir: string,
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
    if (this.state.phase === "ready") return Promise.resolve(this.getState());
    if (this.startup) return this.startup;
    this.startup = this.startImpl().finally(() => {
      this.startup = null;
    });
    return this.startup;
  }

  async restart(): Promise<BackendState> {
    await this.stop();
    const pendingStartup = this.startup;
    if (pendingStartup) await pendingStartup;
    return this.start();
  }

  async switchWorkspace(workspaceDir: string): Promise<BackendState> {
    const nextWorkspace = resolve(workspaceDir);
    if (nextWorkspace === this.workspaceDir) return this.getState();
    this.workspaceDir = nextWorkspace;
    return this.restart();
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
      const detail = `Runtime exited (${signal ?? `code ${code ?? "unknown"}`}).`;
      rejectUrl?.(new Error(detail));
      if (!this.stopping) {
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
      await this.stop();
      const detail = error instanceof Error ? error.message : String(error);
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
        const response = await fetch(`${url}/health`, {
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

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    this.child = null;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolvePromise) =>
        child.once("exit", () => resolvePromise()),
      ),
      new Promise<void>((resolvePromise) =>
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null)
            child.kill("SIGKILL");
          resolvePromise();
        }, 3_000),
      ),
    ]);
    this.update({ phase: "stopped", message: "The local runtime is stopped." });
  }

  private update(state: BackendState): void {
    this.state = state;
    for (const listener of this.listeners) listener(this.getState());
  }
}

function resolveBunExecutable(): string {
  if (process.env.DOOLITTLE_BUN_PATH) return process.env.DOOLITTLE_BUN_PATH;
  const executable = process.platform === "win32" ? "bun.exe" : "bun";
  const candidates = [
    resolve(homedir(), ".bun/bin", executable),
    ...(process.platform === "darwin"
      ? ["/opt/homebrew/bin/bun", "/usr/local/bin/bun"]
      : []),
  ];
  return candidates.find(existsSync) ?? executable;
}
