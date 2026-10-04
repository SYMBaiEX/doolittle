import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type {
  BotCatalogResponse,
  BotDefinition,
  BotSummary,
  CreateBotInput,
  UpdateBotInput,
} from "@doolittle/contracts/bots";
import {
  type BackendLaunchTarget,
  BackendManager,
  type BackendManagerOptions,
} from "./backend";
import { BotCatalog } from "./bot-catalog";

const CONNECTION_ID_PATTERN =
  /^(openai-api|anthropic-api|openai-codex|anthropic-subscription):([a-zA-Z0-9][a-zA-Z0-9._-]{0,119})$/u;

type TokenResolver = (
  provider: "openai-api" | "anthropic-api",
  accountId: string,
) => Promise<string | null>;

async function officialTokenResolver(
  provider: "openai-api" | "anthropic-api",
  accountId: string,
): Promise<string | null> {
  const { getAccessToken } = await import("@elizaos/agent/auth/credentials");
  return getAccessToken(provider, accountId);
}

export interface BotProcessRegistryOptions {
  tokenResolver?: TokenResolver;
  runtimeFetch?: typeof fetch;
  createBackend?: (
    target: BackendLaunchTarget,
    dataDir: string,
    workspacePath: string,
    runtimeFetch: typeof fetch,
    options: BackendManagerOptions,
  ) => BackendManager;
}

/** One child process and one SQL/PGlite manager per named bot. */
export class BotProcessRegistry {
  readonly catalog: BotCatalog;
  private readonly backends = new Map<string, BackendManager>();
  private readonly tokenResolver: TokenResolver;
  private readonly runtimeFetch: typeof fetch;
  private readonly createBackend: NonNullable<
    BotProcessRegistryOptions["createBackend"]
  >;

  constructor(
    private readonly target: BackendLaunchTarget,
    private readonly dataDir: string,
    private readonly defaultBackend: BackendManager,
    defaultWorkspacePath: string,
    options: BotProcessRegistryOptions = {},
  ) {
    this.catalog = new BotCatalog(
      dataDir,
      defaultBackend,
      defaultWorkspacePath,
    );
    this.tokenResolver = options.tokenResolver ?? officialTokenResolver;
    this.runtimeFetch = options.runtimeFetch ?? fetch;
    this.createBackend =
      options.createBackend ??
      ((
        launchTarget,
        botDataDir,
        workspacePath,
        runtimeFetch,
        managerOptions,
      ) =>
        new BackendManager(
          launchTarget,
          botDataDir,
          workspacePath,
          runtimeFetch,
          managerOptions,
        ));
  }

  get(botId?: string): BotDefinition {
    const id = botId ?? "default";
    const definition = this.catalog.get(id);
    if (!definition || definition.archivedAt) {
      throw new Error("Bot not found or archived.");
    }
    return definition;
  }

  list(): BotCatalogResponse {
    return this.catalog.list(this.backends);
  }

  summary(botId: string): BotSummary {
    const id = botId === "default" ? this.catalog.defaultBot().id : botId;
    const summary = this.list().bots.find((bot) => bot.id === id);
    if (!summary) throw new Error("Bot not found.");
    return summary;
  }

  create(input: CreateBotInput): BotSummary {
    return this.summary(this.catalog.create(input).id);
  }

  async update(id: string, input: UpdateBotInput): Promise<BotSummary> {
    const existing = this.get(id);
    const running = this.backends.get(existing.id)?.getState().phase;
    if (
      !existing.isDefault &&
      running &&
      running !== "stopped" &&
      running !== "degraded"
    ) {
      throw new Error(
        "Stop this bot before editing its configuration. The current turn will not be interrupted.",
      );
    }
    const definition = this.catalog.update(id, input);
    return this.summary(definition.id);
  }

  async archive(id: string): Promise<BotSummary> {
    await this.stop(id);
    this.catalog.archive(id);
    return this.summary(id);
  }

  async activate(botId: string): Promise<BotSummary> {
    const definition = this.get(botId);
    if (definition.isDefault) {
      await this.defaultBackend.start();
      return this.summary(botId);
    }
    const existing = this.backends.get(botId);
    if (existing?.getState().phase === "ready") return this.summary(botId);
    if (existing) {
      await existing.stop();
      this.backends.delete(botId);
    }

    const grant = await this.resolveProviderGrant(definition);
    if (!existsSync(definition.workspacePath)) {
      throw new Error("The bot workspace is unavailable.");
    }
    const workspacePath = realpathSync(definition.workspacePath);
    const allowedPaths = definition.permissions.workspacePaths.map((path) =>
      realpathSync(path),
    );
    if (!allowedPaths.includes(workspacePath)) {
      throw new Error("The bot workspace is outside its approved paths.");
    }

    const botDataDir = resolve(this.dataDir, "bots", definition.id);
    mkdirSync(botDataDir, { recursive: true, mode: 0o700 });
    const environment = this.workerEnvironment(definition, botDataDir, grant);
    const backend = this.createBackend(
      this.target,
      botDataDir,
      workspacePath,
      this.runtimeFetch,
      {
        isolatedEnvironment: environment,
        expectedBotId: definition.id,
        expectedAgentId: definition.agentId,
      },
    );
    this.backends.set(botId, backend);
    const state = await backend.start();
    if (state.phase !== "ready") {
      throw new Error(
        state.detail ?? "The named bot runtime could not become ready.",
      );
    }
    return this.summary(botId);
  }

  async backendFor(botId?: string): Promise<BackendManager> {
    const definition = this.get(botId);
    if (definition.isDefault) return this.defaultBackend;
    const backend = this.backends.get(definition.id);
    if (backend?.getState().phase !== "ready") {
      throw new Error(
        "The named bot is stopped. Activate it before sending a request.",
      );
    }
    return backend;
  }

  async stop(id: string): Promise<BotSummary> {
    const definition = this.get(id);
    if (definition.isDefault) {
      // A bot-card stop is not allowed to tear down the legacy desktop host.
      throw new Error("The lead runtime stays owned by the desktop host.");
    }
    const backend = this.backends.get(id);
    if (backend) {
      await backend.stop();
      this.backends.delete(id);
    }
    return this.summary(id);
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      [...this.backends.values()].map((backend) => backend.stop()),
    );
    this.backends.clear();
  }

  private async resolveProviderGrant(definition: BotDefinition): Promise<{
    envKey?: "OPENAI_API_KEY" | "ANTHROPIC_API_KEY";
    token?: string;
  }> {
    const provider = definition.model.provider;
    if (provider === "offline") return {};
    const expectedProvider =
      provider === "openai"
        ? "openai-api"
        : provider === "anthropic"
          ? "anthropic-api"
          : null;
    if (!expectedProvider) {
      throw new Error(
        "This model route needs a scoped native provider grant before activation.",
      );
    }
    const references = definition.permissions.connectionIds.map((id) => {
      const match = CONNECTION_ID_PATTERN.exec(id);
      if (!match) throw new Error("A bot connection reference is invalid.");
      return { provider: match[1], accountId: match[2] };
    });
    const matches = references.filter(
      (reference) => reference.provider === expectedProvider,
    );
    if (matches.length !== 1 || !matches[0]?.accountId) {
      throw new Error(
        "Select exactly one approved account for this bot's model provider.",
      );
    }
    const token = await this.tokenResolver(
      expectedProvider,
      matches[0].accountId,
    );
    if (!token) {
      throw new Error(
        "The selected bot connection is unavailable. Reconnect it and retry.",
      );
    }
    return {
      envKey:
        expectedProvider === "openai-api"
          ? "OPENAI_API_KEY"
          : "ANTHROPIC_API_KEY",
      token,
    };
  }

  private workerEnvironment(
    definition: BotDefinition,
    botDataDir: string,
    grant: { envKey?: "OPENAI_API_KEY" | "ANTHROPIC_API_KEY"; token?: string },
  ): NodeJS.ProcessEnv {
    const source = process.env;
    const environment: NodeJS.ProcessEnv = {
      PATH: source.PATH,
      LANG: source.LANG,
      LC_ALL: source.LC_ALL,
      TMPDIR: source.TMPDIR,
      TEMP: source.TEMP,
      TMP: source.TMP,
      SYSTEMROOT: source.SYSTEMROOT,
      WINDIR: source.WINDIR,
      HOME: botDataDir,
      USERPROFILE: botDataDir,
      ELIZA_HOME: botDataDir,
      DOOLITTLE_NAME: definition.name,
      DOOLITTLE_BOT_RUNTIME: "worker",
      DOOLITTLE_BOT_PROFILE: JSON.stringify(definition),
      DOOLITTLE_OFFLINE_BOOTSTRAP:
        definition.model.provider === "offline" ? "true" : "false",
      ...(this.target.environment?.ELECTRON_RUN_AS_NODE
        ? { ELECTRON_RUN_AS_NODE: this.target.environment.ELECTRON_RUN_AS_NODE }
        : {}),
    };
    if (grant.envKey && grant.token) environment[grant.envKey] = grant.token;
    return environment;
  }
}
