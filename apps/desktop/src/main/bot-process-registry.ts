import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
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
import type {
  BackendLaunchTarget,
  BackendManager,
  BackendManagerOptions,
} from "./backend";
import {
  BotAcpSessionLedger,
  type BoundAcpSession,
} from "./bot-acp-session-ledger";
import {
  type AutomationNativeConsent,
  BotAutomationBroker,
} from "./bot-automation-broker";
import { BotCatalog } from "./bot-catalog";
import {
  BotConsultationBroker,
  type BotConsultationDispatchInput,
  effectivePermissions,
} from "./bot-consultation-broker";
import {
  BotConversationLedger,
  type BoundConversation,
} from "./bot-conversation-ledger";
import { BotKnowledgeBroker } from "./bot-knowledge-broker";
import {
  BotProjectAccessStore,
  permissionsFingerprint,
} from "./bot-project-access";
import { BotTeamCatalog } from "./bot-team-catalog";
import { EngineBotBackend } from "./engine-bot-backend";
import type { DesktopExecutionAdmission } from "./execution-admission";
import {
  type ForegroundParentWitness,
  matchesAutomaticAcpParent,
  sameExecutionWorkspace,
} from "./execution-parent-witness";
import { releaseAbandonedExecutionClaim } from "./execution-receipt";
import { readBoundedResponseText } from "./ipc/runtime-http";
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
  confirmAutomation?: (request: AutomationNativeConsent) => Promise<boolean>;
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

export class BotActivationCancelledError extends Error {
  constructor() {
    super(
      "Bot activation was cancelled or its approved configuration changed.",
    );
    this.name = "BotActivationCancelledError";
  }
}

/** Shared engine lifecycle; each named SDK runtime retains an isolated context. */
export class BotProcessRegistry {
  readonly catalog: BotCatalog;
  readonly projectAccess: BotProjectAccessStore;
  readonly conversations: BotConversationLedger;
  readonly acpSessions: BotAcpSessionLedger;
  readonly consultations: BotConsultationBroker;
  readonly knowledge: BotKnowledgeBroker;
  readonly automations: BotAutomationBroker;
  readonly teams: BotTeamCatalog;
  private readonly backends = new Map<string, BackendManager>();
  private readonly activeRuns = new Map<string, Set<string>>();
  private runsRefresh: Promise<void> | null = null;
  private readonly activationGeneration = new Map<string, number>();
  private readonly activations = new Map<string, Promise<BotSummary>>();
  private readonly archiving = new Set<string>();
  private readonly stops = new Map<string, Promise<BotSummary>>();
  private fleetStop: Promise<void> | null = null;
  private executionStop: Promise<void> | null = null;
  // Grant checks precede runtime creation. Expose their real lifecycle without
  // persisting startup failures or manufacturing a ready backend.
  private readonly activationStates = new Map<string, "starting" | "error">();
  private readonly tokenResolver: TokenResolver;
  private readonly subscriptionStatus: () => SubscriptionAccountStatus[];
  private readonly invokeClaudeCli: typeof invokeClaudeCodeCliPrint;
  private readonly runtimeFetch: typeof fetch;
  private readonly admission?: DesktopExecutionAdmission;
  private readonly usesSharedEngine: boolean;
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
    this.projectAccess = new BotProjectAccessStore(dataDir);
    this.conversations = new BotConversationLedger(dataDir);
    this.acpSessions = new BotAcpSessionLedger(dataDir);
    this.teams = new BotTeamCatalog(dataDir, (id) => this.get(id));
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
    this.automations = new BotAutomationBroker(
      this,
      dataDir,
      options.runtimeFetch ?? fetch,
      options.confirmAutomation,
    );
    this.tokenResolver = options.tokenResolver ?? officialTokenResolver;
    this.subscriptionStatus =
      options.subscriptionStatus ?? getSubscriptionStatus;
    this.invokeClaudeCli = options.invokeClaudeCli ?? invokeClaudeCodeCliPrint;
    this.runtimeFetch = options.runtimeFetch ?? fetch;
    this.admission = options.admission;
    this.usesSharedEngine = !options.createBackend;
    this.createBackend =
      options.createBackend ??
      ((
        launchTarget,
        botDataDir,
        workspacePath,
        runtimeFetch,
        managerOptions,
      ) =>
        new EngineBotBackend(
          launchTarget,
          botDataDir,
          workspacePath,
          runtimeFetch,
          managerOptions,
          () => this.defaultBackend.getEngineClient(),
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
    if (!bot.isDefault) {
      const existing = this.conversations.get(sessionId);
      if (!existing && projectId)
        throw new Error(
          "Project access requires a confirmed conversation grant.",
        );
      if (!existing) return this.bindConversationWorkspace(botId, sessionId);
    }
    return this.conversations.bind(canonicalId, sessionId, projectId);
  }

  private scratchWorkspace(botId: string): string {
    const dataRoot = realpathSync(this.dataDir);
    const path = resolve(dataRoot, "bot-workspaces", botId);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    const canonical = realpathSync(path);
    const part = relative(dataRoot, canonical);
    if (canonical !== path || part.startsWith("..") || isAbsolute(part))
      throw new Error("Private bot workspace is unavailable.");
    return canonical;
  }

  /** Host-owned startup/job root; legacy catalog paths confer no chat access. */
  privateBotWorkspace(botId: string): string {
    const bot = this.get(botId);
    if (bot.isDefault)
      throw new Error("The lead does not use a named-bot scratch root.");
    return this.scratchWorkspace(bot.id);
  }

  /** Read only the lead-owned project, never copy it into a worker store. */
  async readLeadProject(projectId: string): Promise<{
    id: string;
    name: string;
    description?: string;
    instructions?: string;
    workspacePath: string;
  }> {
    if (!/^[a-zA-Z0-9:_-]{1,128}$/u.test(projectId))
      throw new Error("Project ID is invalid.");
    const state = this.defaultBackend.getState();
    if (state.phase !== "ready" || !state.url)
      throw new Error("The lead runtime is not ready.");
    const signal = AbortSignal.timeout(10_000);
    const response = await this.runtimeFetch(
      `${state.url}/projects/${encodeURIComponent(projectId)}`,
      { signal },
    );
    if (!response.ok) throw new Error("Selected project is unavailable.");
    const body = await readBoundedResponseText(response, 20_000, signal);
    const project = (JSON.parse(body) as { project?: Record<string, unknown> })
      .project;
    if (
      !project ||
      project.id !== projectId ||
      typeof project.name !== "string" ||
      !project.name.trim() ||
      project.name.length > 1_200 ||
      typeof project.primaryPath !== "string" ||
      !isAbsolute(project.primaryPath) ||
      Array.from(project.primaryPath).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      project.archivedAt ||
      (project.description !== undefined &&
        (typeof project.description !== "string" ||
          project.description.length > 1_200)) ||
      (project.instructions !== undefined &&
        (typeof project.instructions !== "string" ||
          project.instructions.length > 1_200))
    )
      throw new Error("Selected project has no available canonical root.");
    const workspacePath = realpathSync(project.primaryPath);
    if (!statSync(workspacePath).isDirectory())
      throw new Error("Selected project root must be a directory.");
    return {
      id: projectId,
      name: project.name,
      ...(project.description
        ? { description: project.description as string }
        : {}),
      ...(project.instructions
        ? { instructions: project.instructions as string }
        : {}),
      workspacePath,
    };
  }

  /** Called only after main-process native confirmation for project grants. */
  bindConversationWorkspace(
    botId: string,
    sessionId: string,
    project?: Awaited<ReturnType<BotProcessRegistry["readLeadProject"]>>,
  ): BoundConversation {
    const bot = this.get(botId);
    const root = project?.workspacePath ?? this.scratchWorkspace(bot.id);
    if (!statSync(root).isDirectory() || realpathSync(root) !== root)
      throw new Error("Selected project root changed.");
    return this.conversations.bind(
      bot.id,
      sessionId,
      project?.id,
      root,
      project
        ? {
            name: project.name,
            ...(project.description
              ? { description: project.description }
              : {}),
            ...(project.instructions
              ? { instructions: project.instructions }
              : {}),
          }
        : undefined,
    );
  }

  /** A dispatch-only child receives the origin chat root, never catalog membership. */
  async bindConsultationConversation(
    botId: string,
    sessionId: string,
    origin: BoundConversation & { workspacePath: string },
  ): Promise<BoundConversation> {
    const verified = await this.resolveVerifiedConversationWorkspace(
      origin.botId,
      origin.sessionId,
    );
    if (
      verified.workspacePath !== origin.workspacePath ||
      verified.projectId !== origin.projectId
    )
      throw new Error("Consultation origin workspace changed.");
    return this.conversations.bind(
      this.get(botId).id,
      sessionId,
      origin.projectId,
      origin.workspacePath,
      origin.projectContext,
    );
  }

  forkConversationWorkspace(
    botId: string,
    sourceSessionId: string,
    targetSessionId: string,
  ): BoundConversation {
    if (
      sourceSessionId.startsWith("consult:") ||
      sourceSessionId.startsWith("automation:")
    )
      throw new Error(
        "Transient execution scopes cannot be forked into ordinary chats.",
      );
    const source = this.assertConversationOwner(botId, sourceSessionId);
    return this.conversations.bind(
      source.botId,
      targetSessionId,
      source.projectId,
      source.workspacePath,
      source.projectContext,
    );
  }

  /** A historical root cannot be reconstructed from today's mutable catalog. */
  resolveConversationWorkspace(
    botId: string,
    sessionId: string,
  ): BoundConversation & { workspacePath: string } {
    const owner = this.assertConversationOwner(botId, sessionId);
    const workspace = owner.workspacePath;
    if (!workspace)
      throw new Error(
        "This historical chat has no verified workspace. Start a new chat with explicit project access.",
      );
    if (
      !existsSync(workspace) ||
      realpathSync(workspace) !== workspace ||
      !statSync(workspace).isDirectory()
    )
      throw new Error("Conversation workspace is unavailable or changed.");
    return { ...owner, workspacePath: workspace };
  }

  async resolveVerifiedConversationWorkspace(
    botId: string,
    sessionId: string,
  ): Promise<BoundConversation & { workspacePath: string }> {
    const owner = this.resolveConversationWorkspace(botId, sessionId);
    if (sessionId.startsWith("consult:")) {
      const grant = this.consultations.ledger.get(
        sessionId.slice("consult:".length),
      );
      if (
        !grant ||
        grant.targetSessionId !== sessionId ||
        grant.targetBotId !== owner.botId ||
        grant.workspacePath !== owner.workspacePath ||
        grant.origin.projectId !== owner.projectId ||
        !["prepared", "accepted"].includes(grant.status) ||
        Date.parse(grant.deadline) <= Date.now()
      )
        throw new Error("Consultation workspace grant expired or was revoked.");
      const source = await this.resolveVerifiedConversationWorkspace(
        grant.origin.botId,
        grant.origin.sessionId,
      );
      if (
        source.workspacePath !== owner.workspacePath ||
        source.projectId !== owner.projectId
      )
        throw new Error("Consultation source workspace changed.");
      const originBot = this.get(grant.origin.botId);
      if (
        !originBot.permissions.allowDelegation ||
        JSON.stringify(
          effectivePermissions(
            originBot,
            this.get(owner.botId),
            owner.workspacePath,
          ),
        ) !== JSON.stringify(grant.permissions)
      )
        throw new Error("Consultation capability grant changed.");
    }
    if (sessionId.startsWith("automation:") && !this.get(botId).isDefault) {
      const fire = this.automations.ledger
        .list()
        .find((row) => row.sessionId === sessionId);
      const approval =
        fire && this.automations.ledger.approval(fire.approvalId);
      if (
        !fire ||
        !approval?.workspacePath ||
        fire.targetBotId !== owner.botId ||
        approval.workspacePath !== owner.workspacePath ||
        owner.projectId ||
        !["prepared", "accepted"].includes(fire.status)
      )
        throw new Error(
          "Named automation workspace grant expired or was revoked.",
        );
    }
    if (owner.projectId) {
      const project = await this.readLeadProject(owner.projectId);
      if (project.workspacePath !== owner.workspacePath)
        throw new Error(
          "Conversation project root changed; repair is required.",
        );
    }
    return owner;
  }

  /** Legacy lead scheduler room: verify its live SDK job before first binding. */
  async ensureDefaultAutomationConversation(sessionId: string): Promise<void> {
    const match = /^automation:([0-9a-f-]{36})$/iu.exec(sessionId);
    if (!match) throw new Error("Automation room identity is invalid.");
    const state = this.defaultBackend.getState();
    if (state.phase !== "ready" || !state.url)
      throw new Error("The application scheduler is unavailable.");
    const response = await this.runtimeFetch(`${state.url}/cron/jobs`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error("The application scheduler is unavailable.");
    const raw = await readBoundedResponseText(
      response,
      2_000_000,
      AbortSignal.timeout(10_000),
    );
    const jobs = (
      JSON.parse(raw) as { jobs?: Array<{ id?: string; targetBotId?: string }> }
    ).jobs;
    if (
      !Array.isArray(jobs) ||
      jobs.length > 5_000 ||
      !jobs.some(
        (job) =>
          job?.id === match[1] &&
          (job.targetBotId === undefined || job.targetBotId === "default"),
      )
    )
      throw new Error("Automation room has no live default scheduler job.");
    if (!this.conversations.get(sessionId))
      this.bindConversationWorkspace("default", sessionId);
    await this.resolveVerifiedConversationWorkspace("default", sessionId);
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

  assertConversationWorkspace(
    botId: string,
    sessionId: string,
    requestedPath: string,
  ): string {
    if (typeof requestedPath !== "string" || !requestedPath)
      throw new Error("Conversation workspace is required.");
    const owner = this.resolveConversationWorkspace(botId, sessionId);
    if (
      realpathSync(requestedPath) !== owner.workspacePath ||
      requestedPath !== owner.workspacePath
    )
      throw new Error(
        "Requested workspace does not belong to this conversation.",
      );
    return owner.workspacePath;
  }

  bindAcpSession(
    botId: string,
    originConversationId: string,
    workspacePath: string,
    sessionId: string,
  ): BoundAcpSession {
    const owner = this.assertConversationOwner(botId, originConversationId);
    const actual = this.assertConversationWorkspace(
      botId,
      originConversationId,
      workspacePath,
    );
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
    this.assertConversationWorkspace(
      botId,
      owner.originConversationId,
      owner.workspacePath,
    );
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
        const state =
          bot.state === "archived" || bot.state === "ready"
            ? bot.state
            : (this.activationStates.get(bot.id) ?? bot.state);
        return {
          ...bot,
          activeRunCount,
          state:
            activeRunCount > 0 && state === "ready" ? ("busy" as const) : state,
          error:
            state === "error"
              ? (bot.error ??
                "This bot could not start. Check its connection and retry.")
              : undefined,
        };
      }),
    };
  }

  /** Reconcile display counts from runtime receipts, never renderer subscriptions. */
  refreshActiveRuns(): Promise<void> {
    if (this.runsRefresh) return this.runsRefresh;
    const refresh = this.refreshRunReceipts().finally(() => {
      if (this.runsRefresh === refresh) this.runsRefresh = null;
    });
    this.runsRefresh = refresh;
    return refresh;
  }

  private async refreshRunReceipts(): Promise<void> {
    const bots = this.catalog.list(this.backends).bots;
    const receipts = new Map<string, Set<string>>();
    let next = 0;
    const poll = async () => {
      while (next < bots.length) {
        const bot = bots[next++];
        if (!bot) continue;
        const backend = bot.isDefault
          ? this.defaultBackend
          : this.backends.get(bot.id);
        const state = backend?.getState();
        if (state?.phase !== "ready" || !state.url) {
          receipts.set(bot.id, new Set());
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
        // Do not reintroduce a stopped or replaced runtime's stale receipts.
        const current = backend?.getState();
        receipts.set(
          bot.id,
          current?.phase === "ready" && current.url === state.url
            ? active
            : new Set(),
        );
      }
    };
    // Bound fleet polling independently of execution slots. Concurrent callers
    // share this sweep; one failed runtime still fails the catalog closed.
    const outcomes = await Promise.allSettled(
      Array.from({ length: Math.min(8, bots.length) }, poll),
    );
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") throw outcome.reason;
    }
    for (const [botId, active] of receipts) {
      if (active.size > 0) this.activeRuns.set(botId, active);
      else this.activeRuns.delete(botId);
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
    const ownedBackend = this.backends.get(existing.id);
    const running = ownedBackend?.getState().phase;
    if (
      !existing.isDefault &&
      (ownedBackend?.hasLiveRuntime?.() ||
        (running && running !== "stopped" && running !== "degraded"))
    ) {
      throw new Error(
        "Stop this bot before editing its configuration. The current turn will not be interrupted.",
      );
    }
    const definition = this.catalog.update(id, input, (next) => {
      // Revocation must commit before any new capabilities are published.
      if (
        permissionsFingerprint(existing.permissions) !==
        permissionsFingerprint(next.permissions)
      )
        this.projectAccess.forgetBot(next.id);
    });
    this.invalidateActivation(definition.id);
    // An obsolete asynchronous grant may still be pending. A new Start must
    // create its own promise instead of inheriting that stale grant.
    this.activations.delete(definition.id);
    return this.summary(definition.id);
  }

  async archive(id: string): Promise<BotSummary> {
    const botId = this.get(id).id;
    this.archiving.add(botId);
    this.invalidateActivation(botId);
    try {
      await this.stop(botId);
      this.projectAccess.forgetBot(botId);
      this.catalog.archive(botId);
      this.invalidateActivation(botId);
      return this.summary(botId);
    } finally {
      this.archiving.delete(botId);
    }
  }

  activate(botId: string): Promise<BotSummary> {
    const definition = this.get(botId);
    const id = definition.id;
    if (this.archiving.has(id))
      return Promise.reject(new BotActivationCancelledError());
    const generation = this.activationGeneration.get(id) ?? 0;
    const stopping = this.fleetStop ?? this.executionStop ?? this.stops.get(id);
    if (stopping)
      return stopping.then(() => {
        if (generation !== (this.activationGeneration.get(id) ?? 0))
          throw new BotActivationCancelledError();
        return this.activate(id);
      });
    const pending = this.activations.get(id);
    if (pending) return pending;
    if (!definition.isDefault) this.activationStates.set(id, "starting");
    const activation = this.activateRuntime(id)
      .then((summary) => {
        if (generation !== (this.activationGeneration.get(id) ?? 0))
          throw new BotActivationCancelledError();
        this.activationStates.delete(id);
        return summary;
      })
      .catch((error: unknown) => {
        const current = this.catalog.get(id);
        if (
          generation !== (this.activationGeneration.get(id) ?? 0) ||
          current?.updatedAt !== definition.updatedAt ||
          current.archivedAt
        ) {
          if (generation === (this.activationGeneration.get(id) ?? 0))
            this.activationStates.delete(id);
          throw new BotActivationCancelledError();
        }
        if (!definition.isDefault) this.activationStates.set(id, "error");
        throw error;
      })
      .finally(() => {
        if (this.activations.get(id) === activation)
          this.activations.delete(id);
      });
    this.activations.set(id, activation);
    return activation;
  }

  private async activateRuntime(botId: string): Promise<BotSummary> {
    const definition = this.get(botId);
    const generation = this.activationGeneration.get(definition.id) ?? 0;
    if (definition.isDefault) {
      await this.defaultBackend.start();
      return this.summary(botId);
    }
    const existing = this.backends.get(botId);
    if (existing?.getState().phase === "ready") return this.summary(botId);
    if (existing) {
      await existing.stop();
      if (this.backends.get(botId) === existing) this.backends.delete(botId);
    }

    if (this.usesSharedEngine) {
      const engineState = await this.defaultBackend.start();
      if (engineState.phase !== "ready") {
        throw new Error("The shared agent engine is not ready.");
      }
    }

    const grant = await this.resolveProviderGrant(definition);
    if (
      generation !== (this.activationGeneration.get(definition.id) ?? 0) ||
      this.get(definition.id).updatedAt !== definition.updatedAt
    )
      throw new BotActivationCancelledError();
    // Bootstrap never loads a legacy project's skills or instructions. Actual
    // file access is supplied exclusively by the host's conversation grants.
    const workspacePath = this.scratchWorkspace(definition.id);

    const botDataDir = resolve(this.dataDir, "bots", definition.id);
    mkdirSync(botDataDir, { recursive: true, mode: 0o700 });
    const environment = this.workerEnvironment(definition, botDataDir, grant);
    const foregroundParents = new Map<string, ForegroundParentWitness>();
    const backend = this.createBackend(
      this.target,
      botDataDir,
      workspacePath,
      this.runtimeFetch,
      {
        isolatedEnvironment: environment,
        expectedBotId: definition.id,
        expectedAgentId: definition.agentId,
        workerHostHandler: this.hostHandler(
          definition,
          grant,
          foregroundParents,
        ),
        onHostDisconnect: () => {
          foregroundParents.clear();
          this.admission?.releaseBot(definition.id);
        },
        workerHostOnAbandonedResult: (request, result) =>
          releaseAbandonedExecutionClaim(
            this.admission,
            definition.id,
            request,
            result,
          ),
      },
    );
    this.backends.set(botId, backend);
    const state = await backend.start();
    if (generation !== (this.activationGeneration.get(definition.id) ?? 0)) {
      // A completed Stop already drained and detached this backend. Its late
      // startup result must not stop or detach a replacement generation.
      if (this.backends.get(botId) === backend) {
        await backend.stop();
        if (this.backends.get(botId) === backend) this.backends.delete(botId);
      }
      throw new BotActivationCancelledError();
    }
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
    if (this.backends.get(definition.id)?.getState().phase !== "ready") {
      await this.activate(definition.id);
    }
    const backend = this.backends.get(definition.id);
    if (backend?.getState().phase !== "ready")
      throw new Error("The named bot could not become ready.");
    return backend;
  }

  /** Inspect an already-running bot without activating a stopped worker. */
  readyBackendFor(botId?: string): BackendManager | null {
    const definition = this.get(botId);
    const backend = definition.isDefault
      ? this.defaultBackend
      : this.backends.get(definition.id);
    return backend?.getState().phase === "ready" ? backend : null;
  }

  async stop(id: string): Promise<BotSummary> {
    const definition = this.get(id);
    if (definition.isDefault) {
      // A bot-card stop is not allowed to tear down the legacy desktop host.
      throw new Error("The lead runtime stays owned by the desktop host.");
    }
    this.invalidateActivation(definition.id);
    const pending = this.stops.get(definition.id);
    if (pending) return pending;
    const stopping = this.stopRuntime(definition).finally(() => {
      if (this.stops.get(definition.id) === stopping)
        this.stops.delete(definition.id);
    });
    this.stops.set(definition.id, stopping);
    return stopping;
  }

  private async stopRuntime(definition: BotDefinition): Promise<BotSummary> {
    try {
      await this.automations.cancelForBot(definition.id);
      await this.consultations.cancelForBot(definition.id);
    } finally {
      const backend = this.backends.get(definition.id);
      if (backend) {
        await backend.stop();
        if (this.backends.get(definition.id) === backend)
          this.backends.delete(definition.id);
      }
    }
    // Grant resolution can outlive a confirmed Stop. Release the old pending
    // intent now; its identity/generation guards cannot clear a later Start.
    this.activations.delete(definition.id);
    this.activeRuns.delete(definition.id);
    return this.summary(definition.id);
  }

  private invalidateActivation(botId: string): void {
    this.activationGeneration.set(
      botId,
      (this.activationGeneration.get(botId) ?? 0) + 1,
    );
    this.activationStates.delete(botId);
  }

  async stopAll(): Promise<void> {
    for (const bot of this.catalog.list(this.backends).bots)
      this.invalidateActivation(bot.id);
    if (this.fleetStop) return this.fleetStop;
    const stopping = this.stopAllRuntimes().finally(() => {
      this.activations.clear();
      if (this.fleetStop === stopping) this.fleetStop = null;
    });
    this.fleetStop = stopping;
    return stopping;
  }

  private async stopAllRuntimes(): Promise<void> {
    try {
      await this.automations.cancelAll();
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
    for (const bot of this.catalog.list(this.backends).bots)
      this.invalidateActivation(bot.id);
    if (this.executionStop) return this.executionStop;
    const stopping = this.stopOwnedExecutions().finally(() => {
      this.activations.clear();
      if (this.executionStop === stopping) this.executionStop = null;
    });
    this.executionStop = stopping;
    return stopping;
  }

  private async stopOwnedExecutions(): Promise<void> {
    const bookkeeping = await Promise.allSettled([
      this.automations.cancelAll(),
      this.consultations.cancelAll(),
    ]);
    const owned = [this.defaultBackend, ...this.backends.values()].filter(
      (backend) =>
        backend.hasLiveRuntime?.() || backend.getState().phase === "ready",
    );
    const outcomes = await Promise.allSettled(
      owned.map((backend) => backend.stopAllOwnedExecutions()),
    );
    if (outcomes.some((outcome) => outcome.status === "rejected"))
      throw new Error("Some runtime execution stops could not be confirmed.");
    for (const outcome of bookkeeping) {
      if (outcome.status === "rejected") throw outcome.reason;
    }
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

  /** Fresh application-owned connection check; credentials never enter receipts. */
  async validateAutomationConnection(botId: string): Promise<void> {
    const definition = this.get(botId);
    await this.resolveProviderGrant(definition);
    if (this.get(botId).updatedAt !== definition.updatedAt)
      throw new Error("The automation bot's connection grant changed.");
  }

  private hostHandler(
    definition: BotDefinition,
    grant: ProviderGrant,
    foregroundParents: Map<string, ForegroundParentWitness>,
  ): WorkerHostHandler {
    const generation = this.activationGeneration.get(definition.id) ?? 0;
    return async (request, signal) => {
      const current = this.catalog.get(definition.id);
      if (
        !current ||
        current.archivedAt ||
        current.updatedAt !== definition.updatedAt ||
        (this.activationGeneration.get(definition.id) ?? 0) !== generation
      ) {
        throw new Error("The bot configuration changed. Reactivate it.");
      }
      const resolveSessionWorkspace = async (sessionId: unknown) => {
        if (typeof sessionId !== "string")
          throw new Error("Conversation scope is required.");
        const owner = await this.resolveVerifiedConversationWorkspace(
          definition.id,
          sessionId,
        );
        if (signal.aborted) throw new Error("Host request was cancelled.");
        return owner;
      };
      if (request.operation === "workspace.resolve") {
        const payload = request.payload as {
          sessionId?: unknown;
          acpSessionId?: unknown;
        } | null;
        if (
          !payload ||
          Object.keys(payload).some(
            (key) => key !== "sessionId" && key !== "acpSessionId",
          ) ||
          (payload.acpSessionId !== undefined &&
            typeof payload.acpSessionId !== "string")
        )
          throw new Error("Conversation scope request is invalid.");
        const scope = await resolveSessionWorkspace(payload.sessionId);
        if (payload.acpSessionId !== undefined) {
          const owner = this.assertAcpSessionOwner(
            definition.id,
            payload.acpSessionId,
          );
          if (
            owner.originConversationId !== payload.sessionId ||
            owner.workspacePath !== scope.workspacePath
          )
            throw new Error(
              "ACP session does not belong to this conversation workspace.",
            );
        }
        return scope;
      }
      if (
        request.operation === "execution.claim" ||
        request.operation === "execution.release"
      ) {
        if (!this.admission) {
          throw new Error("Global execution admission is unavailable.");
        }
        const payload = request.payload as {
          sessionId?: unknown;
          runId?: unknown;
          leaseId?: unknown;
          parentRunId?: unknown;
          kind?: unknown;
          yielding?: unknown;
        } | null;
        const scope =
          request.operation === "execution.claim"
            ? await resolveSessionWorkspace(payload?.sessionId)
            : null;
        const mutationRoot =
          definition.permissions.allowMutation && scope
            ? scope.workspacePath
            : undefined;
        const parentMatches = (candidate: typeof scope) =>
          matchesAutomaticAcpParent(
            payload?.parentRunId,
            candidate,
            definition.id,
            foregroundParents,
            (runId) => this.conversations.getRun(runId),
          );
        if (
          request.operation === "execution.claim" &&
          payload?.kind === "automatic-acp" &&
          !parentMatches(scope)
        )
          throw new Error(
            "An active, matching foreground run is required for ACP execution.",
          );
        const effectivePayload =
          request.operation === "execution.claim"
            ? this.automations.admission(
                definition.id,
                this.consultations.admission(definition.id, request.payload),
              )
            : request.payload;
        const result = await this.admission.handle(
          definition.id,
          request.operation,
          effectivePayload,
          { mutationRoot },
          signal,
        );
        if (
          request.operation === "execution.claim" &&
          (result as { accepted?: boolean }).accepted === true
        ) {
          const leaseId = (result as { leaseId: string }).leaseId;
          try {
            const fresh = await resolveSessionWorkspace(payload?.sessionId);
            if (
              !sameExecutionWorkspace(scope, fresh) ||
              (this.activationGeneration.get(definition.id) ?? 0) !==
                generation ||
              this.catalog.get(definition.id)?.updatedAt !==
                definition.updatedAt
            )
              throw new Error(
                "Conversation workspace changed while awaiting execution admission.",
              );
            if (payload?.kind === "automatic-acp" && !parentMatches(fresh))
              throw new Error(
                "The ACP parent run expired while awaiting execution admission.",
              );
            if (payload?.kind === "foreground") {
              if (typeof payload.runId !== "string")
                throw new Error("Foreground run identity is invalid.");
              this.bindRun(definition.id, fresh.sessionId, payload.runId);
              foregroundParents.set(payload.runId, {
                sessionId: fresh.sessionId,
                workspacePath: fresh.workspacePath,
                projectId: fresh.projectId,
                leaseId,
              });
            }
          } catch (error) {
            await this.admission.handle(definition.id, "execution.release", {
              runId: payload?.runId,
              leaseId,
            });
            throw error;
          }
        }
        if (
          request.operation === "execution.release" &&
          payload?.yielding !== true &&
          typeof payload?.runId === "string" &&
          foregroundParents.get(payload.runId)?.leaseId === payload.leaseId
        )
          foregroundParents.delete(payload.runId);
        return result;
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
          typeof input.sessionId !== "string" ||
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
        const scope = await resolveSessionWorkspace(input.sessionId);
        return this.invokeClaudeCli({
          prompt: input.prompt,
          model: input.model,
          systemPrompt: input.systemPrompt as string | undefined,
          effort: input.effort as string | undefined,
          jsonSchema: input.jsonSchema as Record<string, unknown> | undefined,
          cwd: scope.workspacePath,
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
