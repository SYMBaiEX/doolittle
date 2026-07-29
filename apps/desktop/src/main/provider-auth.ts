import {
  type ChildProcess,
  spawn as nodeSpawn,
  type SpawnOptions,
} from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";
import type {
  ProviderAuthProvider,
  ProviderAuthState,
} from "../shared/contracts";

const AUTH_URL_PATTERN = /https:\/\/[^\s<>"']+/giu;
const AUTH_TIMEOUT_MS = 10 * 60 * 1_000;

const PROVIDERS = {
  codex: {
    executable: "codex",
    args: ["login"],
    label: "Codex",
  },
  "claude-code": {
    executable: "claude",
    args: ["auth", "login", "--claudeai"],
    label: "Claude",
  },
} as const;

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface ProviderAuthControllerDependencies {
  spawn?: SpawnProcess;
  openExternal: (url: string) => Promise<unknown>;
  now?: () => Date;
  environment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
}

interface ActiveProviderAuth {
  child: ChildProcess;
  timeout: ReturnType<typeof setTimeout>;
}

function executableName(name: string, platform: NodeJS.Platform): string {
  return platform === "win32" ? `${name}.exe` : name;
}

export function providerAuthExecutableCandidates(
  provider: ProviderAuthProvider,
  options: {
    environment?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    homeDirectory?: string;
  } = {},
): string[] {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? homedir();
  const command = PROVIDERS[provider].executable;
  const executable = executableName(command, platform);
  const pathCandidates = (environment.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => resolve(directory, executable));

  if (platform === "win32") {
    const appData = environment.APPDATA;
    const localAppData = environment.LOCALAPPDATA;
    return [
      ...pathCandidates,
      ...(appData
        ? [
            resolve(appData, "npm", `${command}.cmd`),
            resolve(appData, "npm", executable),
          ]
        : []),
      ...(localAppData
        ? [
            resolve(localAppData, "Programs", command, executable),
            resolve(localAppData, command, executable),
          ]
        : []),
    ];
  }

  return [
    ...pathCandidates,
    resolve(homeDirectory, ".local", "bin", command),
    resolve(homeDirectory, ".npm-global", "bin", command),
    resolve(homeDirectory, ".bun", "bin", command),
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/usr/bin/${command}`,
  ];
}

export function resolveProviderAuthExecutable(
  provider: ProviderAuthProvider,
  options: {
    environment?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    homeDirectory?: string;
  } = {},
): string | null {
  return (
    providerAuthExecutableCandidates(provider, options).find((candidate) =>
      existsSync(candidate),
    ) ?? null
  );
}

export function isTrustedProviderAuthUrl(
  provider: ProviderAuthProvider,
  value: string,
): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const trusted =
      provider === "codex"
        ? ["openai.com", "chatgpt.com"]
        : ["claude.ai", "anthropic.com"];
    return trusted.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function providerAuthUrls(
  provider: ProviderAuthProvider,
  output: string,
): string[] {
  return [...output.matchAll(AUTH_URL_PATTERN)]
    .map(([url]) => url.replace(/[),.;]+$/u, ""))
    .filter((url) => isTrustedProviderAuthUrl(provider, url));
}

export class ProviderAuthController {
  private readonly spawn: SpawnProcess;
  private readonly openExternal: (url: string) => Promise<unknown>;
  private readonly now: () => Date;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly homeDirectory: string;
  private readonly active = new Map<ProviderAuthProvider, ActiveProviderAuth>();
  private readonly states = new Map<ProviderAuthProvider, ProviderAuthState>();

  constructor(dependencies: ProviderAuthControllerDependencies) {
    this.spawn = dependencies.spawn ?? nodeSpawn;
    this.openExternal = dependencies.openExternal;
    this.now = dependencies.now ?? (() => new Date());
    this.environment = dependencies.environment ?? process.env;
    this.platform = dependencies.platform ?? process.platform;
    this.homeDirectory = dependencies.homeDirectory ?? homedir();
  }

  getState(provider: ProviderAuthProvider): ProviderAuthState {
    return (
      this.states.get(provider) ?? {
        provider,
        phase: "idle",
        message: `${PROVIDERS[provider].label} is ready to sign in.`,
        browserOpened: false,
        updatedAt: this.now().toISOString(),
      }
    );
  }

  start(provider: ProviderAuthProvider): ProviderAuthState {
    if (this.active.has(provider)) return this.getState(provider);

    const executable = resolveProviderAuthExecutable(provider, {
      environment: this.environment,
      platform: this.platform,
      homeDirectory: this.homeDirectory,
    });
    if (!executable) {
      return this.update(provider, {
        phase: "failed",
        message: `${PROVIDERS[provider].label} CLI is not installed or could not be found.`,
        browserOpened: false,
      });
    }

    const startedAt = this.now().toISOString();
    this.update(provider, {
      phase: "launching",
      message: `Starting ${PROVIDERS[provider].label} sign in…`,
      browserOpened: false,
      startedAt,
    });

    const child = this.spawn(executable, PROVIDERS[provider].args, {
      cwd: this.homeDirectory,
      env: {
        ...this.environment,
        PATH: providerAuthExecutableCandidates(provider, {
          environment: this.environment,
          platform: this.platform,
          homeDirectory: this.homeDirectory,
        })
          .map((candidate) => resolve(candidate, ".."))
          .concat((this.environment.PATH ?? "").split(delimiter))
          .filter(Boolean)
          .join(delimiter),
      },
      shell: this.platform === "win32" && executable.endsWith(".cmd"),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    });

    const timeout = setTimeout(() => {
      child.kill();
      this.active.delete(provider);
      this.update(provider, {
        phase: "failed",
        message: `${PROVIDERS[provider].label} sign in timed out. Please try again.`,
      });
    }, AUTH_TIMEOUT_MS);
    this.active.set(provider, { child, timeout });

    let browserOpened = false;
    const consume = (chunk: Buffer | string) => {
      if (browserOpened) return;
      const url = providerAuthUrls(provider, chunk.toString())[0];
      if (!url) return;
      browserOpened = true;
      void this.openExternal(url).catch(() => undefined);
      this.update(provider, {
        phase: "waiting",
        message: `Finish signing in to ${PROVIDERS[provider].label} in your browser.`,
        browserOpened: true,
      });
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    child.once("spawn", () => {
      this.update(provider, {
        phase: "waiting",
        message: `Finish signing in to ${PROVIDERS[provider].label} in your browser.`,
      });
    });
    child.once("error", () => {
      this.finish(provider, {
        phase: "failed",
        message: `${PROVIDERS[provider].label} sign in could not be started.`,
      });
    });
    child.once("exit", (code, signal) => {
      if (!this.active.has(provider)) return;
      if (code === 0) {
        this.finish(provider, {
          phase: "succeeded",
          message: `${PROVIDERS[provider].label} sign in completed.`,
        });
        return;
      }
      this.finish(provider, {
        phase: signal ? "cancelled" : "failed",
        message: signal
          ? `${PROVIDERS[provider].label} sign in was cancelled.`
          : `${PROVIDERS[provider].label} sign in exited before completing.`,
      });
    });

    return this.getState(provider);
  }

  cancel(provider: ProviderAuthProvider): ProviderAuthState {
    const active = this.active.get(provider);
    if (!active) return this.getState(provider);
    this.active.delete(provider);
    clearTimeout(active.timeout);
    active.child.kill();
    return this.update(provider, {
      phase: "cancelled",
      message: `${PROVIDERS[provider].label} sign in was cancelled.`,
    });
  }

  dispose(): void {
    for (const provider of this.active.keys()) this.cancel(provider);
  }

  private finish(
    provider: ProviderAuthProvider,
    changes: Partial<ProviderAuthState>,
  ): ProviderAuthState {
    const active = this.active.get(provider);
    if (active) clearTimeout(active.timeout);
    this.active.delete(provider);
    return this.update(provider, changes);
  }

  private update(
    provider: ProviderAuthProvider,
    changes: Partial<ProviderAuthState>,
  ): ProviderAuthState {
    const next = {
      ...this.getState(provider),
      ...changes,
      provider,
      updatedAt: this.now().toISOString(),
    };
    this.states.set(provider, next);
    return next;
  }
}
