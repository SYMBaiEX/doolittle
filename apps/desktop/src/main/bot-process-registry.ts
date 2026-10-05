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
  invokeClaudeCodeCliPrint,
  resolveClaudeCliModel,
} from "@doolittle/plugin-claude-code";
import {
  getAccessToken,
  getSubscriptionStatus,
  type SubscriptionAccountStatus,
} from "@elizaos/agent/auth/credentials";
import {
  type BackendLaunchTarget,
  BackendManager,
  type BackendManagerOptions,
} from "./backend";
import {
  BotAcpSessionLedger,
  type BoundAcpSession,
} from "./bot-acp-session-ledger";
import { BotCatalog } from "./bot-catalog";
import {
  BotConsultationBroker,
  type BotConsultationDispatchInput,
} from "./bot-consultation-broker";
import {
  BotConversationLedger,
  type BoundConversation,
} from "./bot-conversation-ledger";
import { BotKnowledgeBroker } from "./bot-knowledge-broker";
import type { DesktopExecutionAdmission } from "./execution-admission";
import type { WorkerHostHandler } from "./worker-host-rpc";

const CONNECTION_ID_PATTERN =
  /^(openai-api|anthropic-api|openai-codex|anthropic-subscription):([a-zA-Z0-9][a-zA-Z0-9._-]{0,119})$/u;

type TokenResolver = (
  provider: "openai-api" | "anthropic-api" | "openai-codex",
  accountId: string,
) => Promise<string | null>;

async function officialTokenResolver(
  provider: "openai-api" | "anthropic-api" | "openai-codex",
  accountId: string,
): Promise<string | null> {
  return getAccessToken(provider, accountId);
}

type ProviderGrant =
  | { kind: "offline" }
  | { kind: "direct"; provider: "openai-api" | "anthropic-api"; token: string }
  | {
      kind: "native";
      provider: "openai-codex" | "anthropic-subscription";
      accountId: string;
    };

function codexAccountId(accessToken: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;
    const auth = payload["https://api.openai.com/auth"];
    if (auth && typeof auth === "object") {
      const id = (auth as Record<string, unknown>).chatgpt_account_id;
      if (typeof id === "string" && id.length > 0) return id;
    }
  } catch {
    // A malformed token must never be used against an unscoped account.
  }
  throw new Error("The selected Codex account is unavailable.");
}

export interface BotProcessRegistryOptions {
  admission?: DesktopExecutionAdmission;
  tokenResolver?: TokenResolver;
  subscriptionStatus?: () => SubscriptionAccountStatus[];
  invokeClaudeCli?: typeof invokeClaudeCodeCliPrint;
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
  readonly conversations: BotConversationLedger;
  readonly acpSessions: BotAcpSessionLedger;
  readonly consultations: BotConsultationBroker;
  readonly knowledge: BotKnowledgeBroker;
  private readonly backends = new Map<string, BackendManager>();
  private readonly activeRuns = new Map<string, Set<string>>();
  private readonly tokenResolver: TokenResolver;
  private readonly subscriptionStatus: () => SubscriptionAccountStatus[];
  private readonly invokeClaudeCli: typeof invokeClaudeCodeCliPrint;
  private readonly runtimeFetch: typeof fetch;
  private readonly admission?: DesktopExecutionAdmission;
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
    this.conversations = new BotConversationLedger(dataDir);
    this.acpSessions = new BotAcpSessionLedger(dataDir);
    this.knowledge = new BotKnowledgeBroker(
      this,
      target,
      dataDir,
      options.runtimeFetch ?? fetch,
    );
    this.consultations = new BotConsultationBroker(
      this,
      dataDir,
      options.runtimeFetch ?? fetch,
    );
    this.tokenResolver = options.tokenResolver ?? officialTokenResolver;
    this.subscriptionStatus =
      options.subscriptionStatus ?? getSubscriptionStatus;
    this.invokeClaudeCli = options.invokeClaudeCli ?? invokeClaudeCodeCliPrint;
    this.runtimeFetch = options.runtimeFetch ?? fetch;
    this.admission = options.admission;
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

  dataDirectory(botId?: string): string {
    const definition = this.get(botId);
    return definition.isDefault
      ? this.dataDir
      : resolve(this.dataDir, "bots", definition.id);
  }

  bindConversation(
    botId: string,
    sessionId: string,
    projectId?: string,
  ): BoundConversation {
    const bot = this.get(botId);
    const canonicalId = bot.isDefault
      ? this.catalog.stableDefaultBotId()
      : bot.id;
    if (bot.projectId && bot.projectId !== projectId) {
      throw new Error("Conversation project does not match its bot.");
    }
    return this.conversations.bind(canonicalId, sessionId, projectId);
  }

  resolveSavedConversationOwner(sessionId: string): BoundConversation | null {
    return this.conversations.get(sessionId);
  }

  assertConversationOwner(
    botId: string,
    sessionId: string,
    projectId?: string,
  ): BoundConversation {
    const bot = this.get(botId);
    const canonicalId = bot.isDefault
      ? this.catalog.stableDefaultBotId()
      : bot.id;
    const owner = this.conversations.get(sessionId);
    if (!owner) {
      throw new Error(
        "This conversation is not bound to its bot. Restore or create its owner first.",
      );
    }
    if (
      owner.botId !== canonicalId ||
      (projectId !== undefined && owner.projectId !== projectId)
    ) {
      throw new Error("Conversation belongs to a different bot or project.");
    }
    return owner;
  }

  async ensureConversationOwner(
    botId: string,
    sessionId: string,
  ): Promise<BoundConversation> {
    const existing = this.conversations.get(sessionId);
    if (existing) return this.assertConversationOwner(botId, sessionId);
    const bot = this.get(botId);
    if (!bot.isDefault)
      throw new Error("This named conversation is not bound to its bot.");
    const summary = await this.readLeadSessionSummary(sessionId);
    if (summary.messageCount === 0 && !summary.projectId && !summary.title) {
      throw new Error("Conversation is not present in the lead runtime.");
    }
    return this.bindConversation("default", sessionId, summary.projectId);
  }

  private async readLeadSessionSummary(sessionId: string): Promise<{
    sessionId: string;
    projectId?: string;
    title?: string;
    messageCount: number;
  }> {
    const state = this.defaultBackend.getState();
    if (state.phase !== "ready" || !state.url)
      throw new Error("The lead runtime is not ready.");
    const response = await this.runtimeFetch(
      `${state.url}/sessions/summary?sessionId=${encodeURIComponent(sessionId)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok)
      throw new Error("Conversation is unavailable in the lead runtime.");
    const body = await response.text();
    if (body.length > 2_000_000)
      throw new Error("Conversation summary is invalid.");
    const parsed = JSON.parse(body) as {
      summary?: {
        sessionId?: unknown;
        projectId?: unknown;
        title?: unknown;
        messageCount?: unknown;
      };
    };
    if (
      parsed.summary?.sessionId !== sessionId ||
      (parsed.summary.projectId !== undefined &&
        typeof parsed.summary.projectId !== "string") ||
      (parsed.summary.title !== undefined &&
        typeof parsed.summary.title !== "string") ||
      typeof parsed.summary.messageCount !== "number" ||
      !Number.isSafeInteger(parsed.summary.messageCount) ||
      parsed.summary.messageCount < 0
    ) {
      throw new Error("Conversation summary is invalid.");
    }
    return parsed.summary as {
      sessionId: string;
      projectId?: string;
      title?: string;
      messageCount: number;
    };
  }

  bindProject(botId: string, projectId: string): void {
    const bot = this.get(botId);
    if (bot.projectId && bot.projectId !== projectId) {
      throw new Error("Project does not match this bot's approved project.");
    }
    const canonicalId = bot.isDefault
      ? this.catalog.stableDefaultBotId()
      : bot.id;
    this.conversations.bindProject(canonicalId, projectId);
  }

  assertProjectOwner(botId: string, projectId: string): void {
    const bot = this.get(botId);
    if (bot.projectId && bot.projectId !== projectId) {
      throw new Error("Project does not match this bot's approved project.");
    }
    const canonicalId = bot.isDefault
      ? this.catalog.stableDefaultBotId()
      : bot.id;
    const owner = this.conversations.getProject(projectId);
    if (!owner || owner.botId !== canonicalId) {
      throw new Error("Project is not owned by this bot.");
    }
  }

  async ensureProjectOwner(botId: string, projectId: string): Promise<void> {
    const owner = this.conversations.getProject(projectId);
    if (owner) return this.assertProjectOwner(botId, projectId);
    const bot = this.get(botId);
    if (!bot.isDefault) throw new Error("Project is not owned by this bot.");
    const state = this.defaultBackend.getState();
    if (state.phase !== "ready" || !state.url)
      throw new Error("The lead runtime is not ready.");
    const response = await this.runtimeFetch(
      `${state.url}/projects/${encodeURIComponent(projectId)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok)
      throw new Error("Project is unavailable in the lead runtime.");
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error("Project receipt is invalid.");
    const payload = JSON.parse(body) as {
      project?: { id?: unknown; resources?: unknown };
    };
    if (payload.project?.id !== projectId)
      throw new Error("Project receipt is invalid.");
    this.bindProject("default", projectId);
    if (Array.isArray(payload.project.resources)) {
      for (const entry of payload.project.resources) {
        if (
          entry &&
          typeof entry === "object" &&
          typeof (entry as { id?: unknown }).id === "string"
        ) {
          this.bindResource("default", projectId, (entry as { id: string }).id);
        }
      }
    }
  }

  bindResource(botId: string, projectId: string, resourceId: string): void {
    const bot = this.get(botId);
    const canonicalId = bot.isDefault
      ? this.catalog.stableDefaultBotId()
      : bot.id;
    this.assertProjectOwner(botId, projectId);
    this.conversations.bindResource(canonicalId, projectId, resourceId);
  }

  async ensureResourceOwner(
    botId: string,
    projectId: string,
    resourceId: string,
  ): Promise<void> {
    await this.ensureProjectOwner(botId, projectId);
    const owner = this.conversations.getResource(resourceId);
    if (owner) {
      const bot = this.get(botId);
      const canonicalId = bot.isDefault
        ? this.catalog.stableDefaultBotId()
        : bot.id;
      if (owner.botId !== canonicalId || owner.projectId !== projectId) {
        throw new Error("Resource belongs to a different bot or project.");
      }
      return;
    }
    const bot = this.get(botId);
    if (!bot.isDefault) throw new Error("Resource is not owned by this bot.");
    const state = this.defaultBackend.getState();
    if (state.phase !== "ready" || !state.url)
      throw new Error("The lead runtime is not ready.");
    const response = await this.runtimeFetch(
      `${state.url}/projects/${encodeURIComponent(projectId)}/resources`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok)
      throw new Error("Resource is unavailable in the lead runtime.");
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error("Resource list is invalid.");
    const payload = JSON.parse(body) as { resources?: unknown };
    if (
      !Array.isArray(payload.resources) ||
      !payload.resources.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry as { id?: unknown }).id === resourceId &&
          (entry as { projectId?: unknown }).projectId === projectId,
      )
    ) {
      throw new Error("Resource is not present in the lead project.");
    }
    this.bindResource("default", projectId, resourceId);
  }

  listConversations(botId: string): BoundConversation[] {
    const bot = this.get(botId);
    return this.conversations.list(
      bot.isDefault ? this.catalog.defaultBot().id : bot.id,
    );
  }

  bindRun(botId: string, sessionId: string, runId: string): void {
    const owner = this.assertConversationOwner(botId, sessionId);
    this.conversations.bindRun(owner.botId, sessionId, runId);
    this.conversations.touch(owner.botId, sessionId);
  }

  assertAcpWorkspace(botId: string, workspacePath: string): string {
    const bot = this.get(botId);
    if (typeof workspacePath !== "string" || !workspacePath)
      throw new Error("ACP workspace is required.");
    const actual = realpathSync(workspacePath);
    const approved = realpathSync(bot.workspacePath);
    if (actual !== approved)
      throw new Error(
        "ACP workspace does not match this bot's approved workspace.",
      );
    return actual;
  }

  bindAcpSession(
    botId: string,
    originConversationId: string,
    workspacePath: string,
    sessionId: string,
  ): BoundAcpSession {
    const owner = this.assertConversationOwner(botId, originConversationId);
    const actual = this.assertAcpWorkspace(botId, workspacePath);
    return this.acpSessions.bind({
      botId: owner.botId,
      originConversationId,
      workspacePath: actual,
      sessionId,
    });
  }

  assertAcpSessionOwner(botId: string, sessionId: string): BoundAcpSession {
    const owner = this.acpSessions.assert(this.get(botId).id, sessionId);
    this.assertConversationOwner(botId, owner.originConversationId);
    this.assertAcpWorkspace(botId, owner.workspacePath);
    return owner;
  }

  async assertRunOwner(botId: string, runId: string): Promise<void> {
    const bot = this.get(botId);
    const canonicalId = bot.isDefault
      ? this.catalog.stableDefaultBotId()
      : bot.id;
    const run = this.conversations.getRun(runId);
    if (!run) {
      if (!bot.isDefault)
        throw new Error("This named run is not bound to its bot.");
      const state = this.defaultBackend.getState();
      if (state.phase !== "ready" || !state.url)
        throw new Error("The lead runtime is not ready.");
      const receiptResponse = await this.runtimeFetch(
        `${state.url}/chat/runs/${encodeURIComponent(runId)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!receiptResponse.ok)
        throw new Error("Run not found in the lead runtime.");
      const receiptText = await receiptResponse.text();
      if (receiptText.length > 2_000_000)
        throw new Error("Run receipt is invalid.");
      const receipt = JSON.parse(receiptText) as {
        run?: { runId?: unknown; sessionId?: unknown };
      };
      if (
        receipt.run?.runId !== runId ||
        typeof receipt.run.sessionId !== "string"
      ) {
        throw new Error("Run receipt is invalid.");
      }
      const sessionId = receipt.run.sessionId;
      const summary = await this.readLeadSessionSummary(sessionId);
      if (this.conversations.get(sessionId)) {
        this.assertConversationOwner("default", sessionId, summary.projectId);
      } else {
        this.bindConversation("default", sessionId, summary.projectId);
      }
      this.conversations.bindRun(canonicalId, sessionId, runId);
      return;
    }
    if (run.botId !== canonicalId)
      throw new Error("Run belongs to a different bot.");
  }

  list(): BotCatalogResponse {
    const catalog = this.catalog.list(this.backends);
    return {
      ...catalog,
      bots: catalog.bots.map((bot) => {
        const activeRunCount = this.activeRuns.get(bot.id)?.size ?? 0;
        return {
          ...bot,
          activeRunCount,
          state:
            activeRunCount > 0 && bot.state === "ready"
              ? ("busy" as const)
              : bot.state,
        };
      }),
    };
  }

  /** Reconcile display counts from runtime receipts, never renderer subscriptions. */
  async refreshActiveRuns(): Promise<void> {
    for (const bot of this.catalog.list(this.backends).bots) {
      const backend = bot.isDefault
        ? this.defaultBackend
        : this.backends.get(bot.id);
      const state = backend?.getState();
      if (state?.phase !== "ready" || !state.url) {
        this.activeRuns.delete(bot.id);
        continue;
      }
      const response = await this.runtimeFetch(
        `${state.url}/chat/runs?limit=100`,
        {
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) throw new Error("Bot run status is unavailable.");
      const payload: unknown = await response.json();
      if (
        !payload ||
        typeof payload !== "object" ||
        !Array.isArray((payload as { runs?: unknown }).runs)
      ) {
        throw new Error("Bot run status is invalid.");
      }
      const active = new Set<string>();
      for (const row of (payload as { runs: unknown[] }).runs) {
        if (!row || typeof row !== "object")
          throw new Error("Bot run status is invalid.");
        const run = row as { runId?: unknown; status?: unknown };
        if (typeof run.runId !== "string" || typeof run.status !== "string") {
          throw new Error("Bot run status is invalid.");
        }
        if (["thinking", "acting", "waiting"].includes(run.status))
          active.add(run.runId);
      }
      if (active.size > 0) this.activeRuns.set(bot.id, active);
      else this.activeRuns.delete(bot.id);
    }
  }

  beginRun(botId: string, runId: string): void {
    const bot = this.get(botId);
    const active = this.activeRuns.get(bot.id) ?? new Set<string>();
    active.add(runId);
    this.activeRuns.set(bot.id, active);
  }

  endRun(botId: string, runId: string): void {
    const id = this.catalog.get(botId)?.id ?? botId;
    const active = this.activeRuns.get(id);
    active?.delete(runId);
    if (active?.size === 0) this.activeRuns.delete(id);
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
        workerHostHandler: this.hostHandler(definition, grant, workspacePath),
        onHostDisconnect: () => this.admission?.releaseBot(definition.id),
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
    try {
      await this.consultations.cancelForBot(definition.id);
    } finally {
      const backend = this.backends.get(id);
      if (backend) {
        await backend.stop();
        this.backends.delete(id);
      }
    }
    this.activeRuns.delete(definition.id);
    return this.summary(id);
  }

  async stopAll(): Promise<void> {
    try {
      await this.consultations.cancelAll();
    } finally {
      await Promise.all(
        [...this.backends.values()]
          .map((backend) => backend.stop())
          .concat(this.knowledge.stop()),
      );
      this.backends.clear();
      this.activeRuns.clear();
    }
  }

  /** Host emergency action across the lead and every running worker. */
  async stopAllOwnedExecutions(): Promise<void> {
    await this.consultations.cancelAll();
    const ready = [this.defaultBackend, ...this.backends.values()].filter(
      (backend) => backend.getState().phase === "ready",
    );
    await Promise.all(ready.map((backend) => backend.stopAllOwnedExecutions()));
  }

  private async resolveProviderGrant(
    definition: BotDefinition,
  ): Promise<ProviderGrant> {
    const provider = definition.model.provider;
    if (provider === "offline") return { kind: "offline" };
    const expectedProvider =
      provider === "openai"
        ? "openai-api"
        : provider === "anthropic"
          ? "anthropic-api"
          : provider === "codex"
            ? "openai-codex"
            : provider === "claude-code"
              ? "anthropic-subscription"
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
    if (expectedProvider === "anthropic-subscription") {
      const status = this.subscriptionStatus().find(
        (row) =>
          row.provider === "anthropic-subscription" &&
          row.accountId === matches[0]?.accountId &&
          row.source === "claude-code-cli" &&
          row.configured &&
          row.valid &&
          row.available !== false,
      );
      if (!status)
        throw new Error("The selected Claude Code CLI account is unavailable.");
      return {
        kind: "native",
        provider: expectedProvider,
        accountId: matches[0].accountId,
      };
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
    if (expectedProvider === "openai-codex") {
      codexAccountId(token);
      return {
        kind: "native",
        provider: expectedProvider,
        accountId: matches[0].accountId,
      };
    }
    return { kind: "direct", provider: expectedProvider, token };
  }

  private hostHandler(
    definition: BotDefinition,
    grant: ProviderGrant,
    workspacePath: string,
  ): WorkerHostHandler {
    return async (request, signal) => {
      const current = this.catalog.get(definition.id);
      if (
        !current ||
        current.archivedAt ||
        current.updatedAt !== definition.updatedAt
      ) {
        throw new Error("The bot configuration changed. Reactivate it.");
      }
      if (
        request.operation === "execution.claim" ||
        request.operation === "execution.release"
      ) {
        if (!this.admission) {
          throw new Error("Global execution admission is unavailable.");
        }
        const mutationRoot = definition.permissions.allowMutation
          ? realpathSync(workspacePath)
          : undefined;
        return this.admission.handle(
          definition.id,
          request.operation,
          request.payload,
          { mutationRoot },
        );
      }
      if (request.operation === "consult.dispatch") {
        return this.consultations.dispatch(
          definition.id,
          request.payload as BotConsultationDispatchInput,
          signal,
        );
      }
      if (
        request.operation === "consult.wait" ||
        request.operation === "consult.cancel"
      ) {
        const payload = request.payload as { dispatchId?: unknown } | null;
        if (
          !payload ||
          typeof payload.dispatchId !== "string" ||
          !/^[0-9a-f-]{36}$/iu.test(payload.dispatchId)
        )
          throw new Error("Consultation ID is invalid.");
        return request.operation === "consult.wait"
          ? this.consultations.wait(definition.id, payload.dispatchId, signal)
          : this.consultations.cancel(definition.id, payload.dispatchId);
      }
      if (
        request.operation === "codex.auth" &&
        grant.kind === "native" &&
        grant.provider === "openai-codex"
      ) {
        const token = await this.tokenResolver("openai-codex", grant.accountId);
        if (signal.aborted || !token)
          throw new Error("The selected Codex account is unavailable.");
        return { accessToken: token, accountId: codexAccountId(token) };
      }
      if (
        request.operation === "claude.invoke" &&
        grant.kind === "native" &&
        grant.provider === "anthropic-subscription"
      ) {
        const status = this.subscriptionStatus().find(
          (row) =>
            row.provider === "anthropic-subscription" &&
            row.accountId === grant.accountId &&
            row.source === "claude-code-cli" &&
            row.configured &&
            row.valid &&
            row.available !== false,
        );
        if (!status)
          throw new Error(
            "The selected Claude Code CLI account is unavailable.",
          );
        const payload = request.payload;
        if (!payload || typeof payload !== "object" || Array.isArray(payload))
          throw new Error("Invalid Claude request.");
        const input = payload as Record<string, unknown>;
        if (
          typeof input.prompt !== "string" ||
          input.prompt.length > 250_000 ||
          typeof input.model !== "string" ||
          input.model !== resolveClaudeCliModel(definition.model.model) ||
          (input.systemPrompt !== undefined &&
            (typeof input.systemPrompt !== "string" ||
              input.systemPrompt.length > 100_000)) ||
          (input.effort !== undefined && typeof input.effort !== "string") ||
          (input.jsonSchema !== undefined &&
            (typeof input.jsonSchema !== "object" ||
              input.jsonSchema === null ||
              Array.isArray(input.jsonSchema)))
        ) {
          throw new Error("Invalid Claude request.");
        }
        return this.invokeClaudeCli({
          prompt: input.prompt,
          model: input.model,
          systemPrompt: input.systemPrompt as string | undefined,
          effort: input.effort as string | undefined,
          jsonSchema: input.jsonSchema as Record<string, unknown> | undefined,
          cwd: workspacePath,
          signal,
        });
      }
      throw new Error("The bot is not approved for this host operation.");
    };
  }

  private workerEnvironment(
    definition: BotDefinition,
    botDataDir: string,
    grant: ProviderGrant,
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
      CODEX_HOME: resolve(botDataDir, "codex-home"),
      CLAUDE_CONFIG_DIR: resolve(botDataDir, "claude-config"),
      DOOLITTLE_NAME: definition.name,
      DOOLITTLE_BOT_RUNTIME: "worker",
      DOOLITTLE_BOT_PROFILE: JSON.stringify(definition),
      DOOLITTLE_OFFLINE_BOOTSTRAP:
        definition.model.provider === "offline" ? "true" : "false",
      ...(this.target.environment?.ELECTRON_RUN_AS_NODE
        ? { ELECTRON_RUN_AS_NODE: this.target.environment.ELECTRON_RUN_AS_NODE }
        : {}),
    };
    if (grant.kind === "direct") {
      environment[
        grant.provider === "openai-api" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"
      ] = grant.token;
    }
    return environment;
  }
}
