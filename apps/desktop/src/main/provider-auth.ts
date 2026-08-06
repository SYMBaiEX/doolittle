import { homedir } from "node:os";
import { delimiter, resolve } from "node:path";
import type {
  FlowState,
  OAuthFlowHandle,
} from "@elizaos/agent/auth/oauth-flow";
import type {
  ProviderAuthProvider,
  ProviderAuthStartOptions,
  ProviderAuthState,
} from "../shared/contracts";

const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/u;
const MAX_AUTH_CODE_LENGTH = 8_192;

const PROVIDERS = {
  codex: {
    executable: "codex",
    label: "Codex",
  },
  "claude-code": {
    executable: "claude",
    label: "Claude",
  },
} as const;

type StartProviderFlow = (options: {
  label: string;
  accountId?: string;
}) => Promise<OAuthFlowHandle>;

export interface ProviderAuthFlowDependencies {
  startCodex: StartProviderFlow;
  startAnthropic: StartProviderFlow;
  subscribe: (
    sessionId: string,
    listener: (state: FlowState) => void,
  ) => () => void;
  cancel: (sessionId: string, reason?: string) => boolean;
  submitCode: (sessionId: string, code: string) => boolean;
}

export interface ProviderAuthControllerDependencies {
  openExternal: (url: string) => Promise<unknown>;
  readClipboardText: () => string;
  now?: () => Date;
  flows?: ProviderAuthFlowDependencies;
}

interface ActiveProviderAuth {
  sessionId: string;
  needsCodeSubmission: boolean;
  flows: ProviderAuthFlowDependencies;
  unsubscribe: () => void;
}

let officialProviderAuthFlows:
  | Promise<ProviderAuthFlowDependencies>
  | undefined;

function loadOfficialProviderAuthFlows(): Promise<ProviderAuthFlowDependencies> {
  officialProviderAuthFlows ??= import("@elizaos/agent/auth/oauth-flow").then(
    (module) => ({
      startCodex: module.startCodexOAuthFlow,
      startAnthropic: module.startAnthropicOAuthFlow,
      subscribe: module.subscribeFlow,
      cancel: module.cancelFlow,
      submitCode: module.submitFlowCode,
    }),
  );
  return officialProviderAuthFlows;
}

function executableName(name: string, platform: NodeJS.Platform): string {
  return platform === "win32" ? `${name}.exe` : name;
}

/**
 * Provider subprocess discovery remains shared with the backend because
 * Codex/Claude coding agents still launch their official CLIs after the SDK
 * OAuth flow has persisted credentials for the selected account.
 */
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

function normalizedStartOptions(
  provider: ProviderAuthProvider,
  options: ProviderAuthStartOptions = {},
): { label: string; accountId?: string } {
  const accountId = options.accountId?.trim();
  const label =
    options.label?.trim() || `${PROVIDERS[provider].label} desktop account`;
  if (accountId && !ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error(
      "Account ID must contain 1 to 120 letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (label.length > 120) {
    throw new Error("Account label must contain at most 120 characters.");
  }
  return { label, ...(accountId ? { accountId } : {}) };
}

function isAnthropicCode(value: string): boolean {
  if (!value || value.length > MAX_AUTH_CODE_LENGTH) return false;
  const separator = value.indexOf("#");
  return separator > 0 && separator < value.length - 1;
}

export class ProviderAuthController {
  private readonly openExternal: (url: string) => Promise<unknown>;
  private readonly readClipboardText: () => string;
  private readonly now: () => Date;
  private readonly loadFlows: () => Promise<ProviderAuthFlowDependencies>;
  private readonly active = new Map<ProviderAuthProvider, ActiveProviderAuth>();
  private readonly states = new Map<ProviderAuthProvider, ProviderAuthState>();
  private readonly starting = new Set<ProviderAuthProvider>();

  constructor(dependencies: ProviderAuthControllerDependencies) {
    this.openExternal = dependencies.openExternal;
    this.readClipboardText = dependencies.readClipboardText;
    this.now = dependencies.now ?? (() => new Date());
    const injectedFlows = dependencies.flows;
    this.loadFlows = injectedFlows
      ? async () => injectedFlows
      : loadOfficialProviderAuthFlows;
  }

  getState(provider: ProviderAuthProvider): ProviderAuthState {
    return (
      this.states.get(provider) ?? {
        provider,
        phase: "idle",
        message: `${PROVIDERS[provider].label} is ready to sign in.`,
        browserOpened: false,
        needsCodeSubmission: false,
        codeSubmitted: false,
        updatedAt: this.now().toISOString(),
      }
    );
  }

  async start(
    provider: ProviderAuthProvider,
    options: ProviderAuthStartOptions = {},
  ): Promise<ProviderAuthState> {
    if (this.active.has(provider) || this.starting.has(provider)) {
      return this.getState(provider);
    }

    const flowOptions = normalizedStartOptions(provider, options);
    this.starting.add(provider);
    this.update(provider, {
      phase: "launching",
      message: `Starting ${PROVIDERS[provider].label} sign in…`,
      browserOpened: false,
      needsCodeSubmission: false,
      codeSubmitted: false,
      startedAt: this.now().toISOString(),
    });

    try {
      const flows = await this.loadFlows();
      if (this.getState(provider).phase === "cancelled") {
        return this.getState(provider);
      }
      const startFlow =
        provider === "codex" ? flows.startCodex : flows.startAnthropic;
      const handle = await startFlow(flowOptions);
      void handle.completion.catch(() => undefined);

      if (this.getState(provider).phase === "cancelled") {
        handle.cancel("Cancelled in Doolittle");
        return this.getState(provider);
      }

      const active: ActiveProviderAuth = {
        sessionId: handle.sessionId,
        needsCodeSubmission: handle.needsCodeSubmission,
        flows,
        unsubscribe: () => undefined,
      };
      this.active.set(provider, active);
      const unsubscribe = flows.subscribe(handle.sessionId, (state) =>
        this.applyFlowState(provider, state),
      );
      active.unsubscribe = unsubscribe;
      if (!this.active.has(provider)) unsubscribe();
      if (!this.active.has(provider)) return this.getState(provider);

      try {
        await this.openExternal(handle.authUrl);
      } catch {
        flows.cancel(
          handle.sessionId,
          "Doolittle could not open the authorization page.",
        );
        return this.finish(provider, {
          phase: "failed",
          message: `${PROVIDERS[provider].label} sign in could not open the authorization page.`,
        });
      }

      if (this.active.has(provider)) {
        this.update(provider, {
          phase: "waiting",
          message: handle.needsCodeSubmission
            ? `Finish signing in to ${PROVIDERS[provider].label}, copy the returned code, then choose Use copied code.`
            : `Finish signing in to ${PROVIDERS[provider].label} in your browser.`,
          browserOpened: true,
          needsCodeSubmission: handle.needsCodeSubmission,
          codeSubmitted: false,
        });
      }
      return this.getState(provider);
    } catch {
      if (this.getState(provider).phase === "cancelled") {
        return this.getState(provider);
      }
      return this.finish(provider, {
        phase: "failed",
        message: `${PROVIDERS[provider].label} sign in could not be started.`,
      });
    } finally {
      this.starting.delete(provider);
    }
  }

  submitCodeFromClipboard(provider: ProviderAuthProvider): ProviderAuthState {
    const active = this.active.get(provider);
    if (!active?.needsCodeSubmission) {
      throw new Error(
        `${PROVIDERS[provider].label} is not waiting for an authorization code.`,
      );
    }
    const code = this.readClipboardText().trim();
    if (!isAnthropicCode(code)) {
      throw new Error(
        "Copy the complete Claude authorization value in code#state format, then try again.",
      );
    }
    if (!active.flows.submitCode(active.sessionId, code)) {
      throw new Error("The Claude authorization flow is no longer active.");
    }
    return this.update(provider, {
      phase: "waiting",
      message: `Verifying ${PROVIDERS[provider].label} authorization…`,
      codeSubmitted: true,
    });
  }

  cancel(provider: ProviderAuthProvider): ProviderAuthState {
    const active = this.active.get(provider);
    if (active) {
      active.flows.cancel(active.sessionId, "Cancelled in Doolittle");
      active.unsubscribe();
      this.active.delete(provider);
    }
    if (!active && !this.starting.has(provider)) return this.getState(provider);
    return this.update(provider, {
      phase: "cancelled",
      message: `${PROVIDERS[provider].label} sign in was cancelled.`,
    });
  }

  acknowledge(provider: ProviderAuthProvider): ProviderAuthState {
    const current = this.getState(provider);
    if (current.phase === "launching" || current.phase === "waiting") {
      return current;
    }
    return this.update(provider, {
      phase: "idle",
      message: `${PROVIDERS[provider].label} is ready to sign in.`,
      browserOpened: false,
      needsCodeSubmission: false,
      codeSubmitted: false,
      startedAt: undefined,
    });
  }

  dispose(): void {
    for (const provider of new Set([
      ...this.active.keys(),
      ...this.starting.keys(),
    ])) {
      this.cancel(provider);
    }
  }

  private applyFlowState(
    provider: ProviderAuthProvider,
    state: FlowState,
  ): void {
    switch (state.status) {
      case "success":
        this.finish(provider, {
          phase: "succeeded",
          message: `${PROVIDERS[provider].label} sign in completed and the account was saved by Eliza.`,
        });
        return;
      case "error":
      case "timeout":
        this.finish(provider, {
          phase: "failed",
          message: `${PROVIDERS[provider].label} sign in failed. Please try again.`,
        });
        return;
      case "cancelled":
        this.finish(provider, {
          phase: "cancelled",
          message: `${PROVIDERS[provider].label} sign in was cancelled.`,
        });
        return;
      case "pending":
        return;
    }
  }

  private finish(
    provider: ProviderAuthProvider,
    changes: Partial<ProviderAuthState>,
  ): ProviderAuthState {
    const active = this.active.get(provider);
    active?.unsubscribe();
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
