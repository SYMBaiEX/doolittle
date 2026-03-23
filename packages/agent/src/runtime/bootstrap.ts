import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAgentEventService } from "@elizaos/autonomous/runtime/agent-event-service";
import {
  AgentRuntime,
  ApprovalService,
  EventType,
  ToolPolicyService,
} from "@elizaos/core";
import character from "@/character";
import { loadConfig } from "@/config/env";
import { featureMap } from "@/config/feature-map";
import { GatewayRunner } from "@/gateway/gateway-runner";
import {
  getLinkedClaudeCodeCredentials,
  getLinkedCodexCredentials,
  getLinkedElizaCloudCredentials,
} from "@/runtime/native/account-auth";
import { describeAutonomousAlignment } from "@/runtime/native/autonomous-stack";
import { createMemoryStorageRuntimeService } from "@/runtime/native/memory-storage-runtime";
import { buildNativePluginAssembly } from "@/runtime/native/plugin-registry";
import { type AppServices, createServices } from "@/services";
import type { EnvConfig } from "@/types";

export interface AppContext {
  config: EnvConfig;
  services: AppServices;
  runtime: AgentRuntime;
  gateway: GatewayRunner;
  ensureDeferredHydration(reason?: string): Promise<void>;
}

export interface AppContextOptions {
  startupMode?: "cli" | "api" | "worker";
  eagerDeferredHydration?: boolean;
}

type RuntimeBindableServices = AppServices & {
  __bindRuntime?: (nextRuntime: AgentRuntime) => void;
};

let contextPromise: Promise<AppContext> | undefined;
let contextValue: AppContext | undefined;

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || String(err);
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function collectErrorMessages(err: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "string") {
      messages.push(current);
      break;
    }
    if (current instanceof Error) {
      if (current.message) {
        messages.push(current.message);
      }
      if (current.stack) {
        messages.push(current.stack);
      }
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    if (typeof current === "object") {
      const maybeError = current as { message?: unknown; cause?: unknown };
      if (typeof maybeError.message === "string" && maybeError.message) {
        messages.push(maybeError.message);
      }
      if (maybeError.cause !== undefined) {
        current = maybeError.cause;
        continue;
      }
    }
    break;
  }

  return messages;
}

function isRecoverablePgliteInitError(err: unknown): boolean {
  const haystack = collectErrorMessages(err).join("\n").toLowerCase();
  if (!haystack) {
    return false;
  }
  const hasAbort = haystack.includes("aborted(). build with -sassertions");
  const hasPglite = haystack.includes("pglite");
  const hasSqlite = haystack.includes("sqlite");
  const hasMigrationsSchema =
    haystack.includes("create schema if not exists migrations") ||
    haystack.includes("failed query: create schema if not exists migrations");
  const hasRecoverableStorageSignal = [
    "database disk image is malformed",
    "file is not a database",
    "malformed database schema",
    "database is locked",
    "lock file already exists",
    "wal file",
    "checkpoint failed",
    "checksum mismatch",
    "corrupt",
  ].some((needle) => haystack.includes(needle));

  if (hasMigrationsSchema) return true;
  if (hasAbort && hasPglite) return true;
  if (hasRecoverableStorageSignal && (hasPglite || hasSqlite)) return true;
  return false;
}

function isPgliteLockError(err: unknown): boolean {
  const haystack = collectErrorMessages(err).join("\n").toLowerCase();
  if (!haystack) {
    return false;
  }
  const hasPglite = haystack.includes("pglite");
  const hasSqlite = haystack.includes("sqlite");
  const hasLockSignal =
    haystack.includes("database is locked") ||
    haystack.includes("lock file already exists");
  return hasLockSignal && (hasPglite || hasSqlite);
}

type PgliteRecoveryAction =
  | "none"
  | "retry-without-reset"
  | "reset-data-dir"
  | "fail-active-lock";

type PglitePidFileStatus =
  | "missing"
  | "active"
  | "active-unconfirmed"
  | "cleared-stale"
  | "cleared-malformed"
  | "check-failed";

function reconcilePglitePidFile(dataDir: string): PglitePidFileStatus {
  const pidPath = join(dataDir, "postmaster.pid");
  if (!existsSync(pidPath)) {
    return "missing";
  }

  try {
    const content = readFileSync(pidPath, "utf-8");
    const firstLine = content.split("\n")[0]?.trim();
    const pid = Number.parseInt(firstLine ?? "", 10);
    if (Number.isNaN(pid) || pid <= 0) {
      unlinkSync(pidPath);
      return "cleared-malformed";
    }

    try {
      process.kill(pid, 0);
      return "active";
    } catch (killErr: unknown) {
      const code = (killErr as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        unlinkSync(pidPath);
        return "cleared-stale";
      }
      return "active-unconfirmed";
    }
  } catch {
    return "check-failed";
  }
}

function getPgliteRecoveryAction(
  err: unknown,
  dataDir: string,
): PgliteRecoveryAction {
  if (!isRecoverablePgliteInitError(err)) {
    return "none";
  }
  if (!isPgliteLockError(err)) {
    return "reset-data-dir";
  }
  const pidStatus = reconcilePglitePidFile(dataDir);
  if (
    pidStatus === "active" ||
    pidStatus === "active-unconfirmed" ||
    pidStatus === "check-failed"
  ) {
    return "fail-active-lock";
  }
  if (pidStatus === "cleared-stale" || pidStatus === "cleared-malformed") {
    return "retry-without-reset";
  }
  return "reset-data-dir";
}

async function resetPgliteDataDir(dataDir: string): Promise<void> {
  const normalized = dataDir;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "")
    .replace("T", "-");
  const backupDir = `${normalized}.corrupt-${stamp}`;
  if (existsSync(normalized)) {
    try {
      renameSync(normalized, backupDir);
    } catch {
      rmSync(normalized, { recursive: true, force: true });
    }
  }
  mkdirSync(normalized, { recursive: true });
}

async function resetPluginSqlPgliteSingleton(): Promise<void> {
  const singletonKey = Symbol.for("@elizaos/plugin-sql/global-singletons");
  const singletons = (
    globalThis as typeof globalThis & {
      [key: symbol]: {
        pgLiteClientManager?: { close?: () => Promise<void> | void };
      };
    }
  )[singletonKey];

  if (!singletons?.pgLiteClientManager) {
    return;
  }

  try {
    await singletons.pgLiteClientManager.close?.();
  } catch {
    // Best effort only. We'll still drop the singleton reference below.
  }

  delete singletons.pgLiteClientManager;
}

function createActivePgliteLockError(dataDir: string, err: unknown): Error {
  return new Error(
    `PGLite data dir is already in use at ${dataDir}. Close the other Eliza Agent process or set a different PGLITE_DATA_DIR before retrying.`,
    { cause: err },
  );
}

async function initializeRuntimeWithRecovery(
  createRuntime: () => AgentRuntime,
  services: AppServices,
  config: EnvConfig,
  pgliteRecoveryAttempted = false,
): Promise<AgentRuntime> {
  let runtime = createRuntime();
  const ensureMemoryStorageReady = async (currentRuntime: AgentRuntime) => {
    await currentRuntime.registerService(
      createMemoryStorageRuntimeService(services.sessions),
    );
    await currentRuntime.getServiceLoadPromise("memoryStorage");
  };

  await ensureMemoryStorageReady(runtime);
  try {
    await runtime.initialize();
    return runtime;
  } catch (err) {
    const pgliteDataDir = join(config.dataDir, "pglite");
    const recoveryAction =
      !pgliteRecoveryAttempted && existsSync(pgliteDataDir)
        ? getPgliteRecoveryAction(err, pgliteDataDir)
        : "none";

    if (recoveryAction === "none") {
      throw err;
    }
    if (recoveryAction === "fail-active-lock") {
      throw createActivePgliteLockError(pgliteDataDir, err);
    }

    console.warn(
      recoveryAction === "retry-without-reset"
        ? `[eliza-agent] PGLite startup failed (${formatError(err)}). Cleared a stale lock in ${pgliteDataDir} and retrying once.`
        : `[eliza-agent] PGLite startup failed (${formatError(err)}). Resetting local DB at ${pgliteDataDir} and retrying once.`,
    );

    if (recoveryAction === "reset-data-dir") {
      await resetPgliteDataDir(pgliteDataDir);
    }

    process.env.PGLITE_DATA_DIR = pgliteDataDir;
    await resetPluginSqlPgliteSingleton();
    runtime = createRuntime();
    await ensureMemoryStorageReady(runtime);
    try {
      await runtime.initialize();
      return runtime;
    } catch (retryErr) {
      void retryErr;
      throw new Error(
        `PGLite startup failed after automatic recovery at ${pgliteDataDir}. Run \`eliza-agent doctor\` or remove the local DB directory if it is still corrupted.`,
      );
    }
  }
}

async function ensureCoreRuntimeServices(runtime: AgentRuntime): Promise<void> {
  if (!runtime.getService(ApprovalService.serviceType)) {
    await runtime.registerService(ApprovalService);
  }
  if (!runtime.getService(ToolPolicyService.serviceType)) {
    await runtime.registerService(ToolPolicyService);
  }
}

function ensureSecretSalt(config: EnvConfig): string {
  const provided =
    process.env.SECRET_SALT?.trim() || process.env.ELIZA_SECRET_SALT?.trim();
  if (provided) {
    return provided;
  }

  const saltPath = join(config.dataDir, "secret-salt");
  try {
    const existing = readFileSync(saltPath, "utf8").trim();
    if (existing) {
      return existing;
    }
  } catch {
    // Fall through and create a stable per-workspace salt.
  }

  const generated = randomUUID().replace(/-/g, "");
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(saltPath, `${generated}\n`, "utf8");
  return generated;
}

function buildPluginSettings(
  config: EnvConfig,
  services: AppServices,
  runtimeSettings: AppServices["settings"]["get"] extends () => infer T
    ? T
    : never,
) {
  const settings: Record<string, string> = {
    featureMap: JSON.stringify(featureMap),
    runtimeSettings: JSON.stringify(runtimeSettings),
    nativeServiceRegistry: JSON.stringify(services.nativeRegistry),
    autonomousAlignment: JSON.stringify(describeAutonomousAlignment(config)),
    ELIZAOS_CLOUD_BASE_URL: config.elizaCloudBaseUrl,
    ELIZAOS_CLOUD_SMALL_MODEL: config.elizaCloudSmallModel,
    ELIZAOS_CLOUD_LARGE_MODEL: config.elizaCloudLargeModel,
    ELIZAOS_CLOUD_ENABLED: String(
      config.elizaCloudEnabled ||
        runtimeSettings.model.provider === "elizacloud",
    ),
    OPENAI_BASE_URL: config.openAiBaseUrl,
    OPENAI_SMALL_MODEL: runtimeSettings.model.model,
    OPENAI_LARGE_MODEL: runtimeSettings.model.model,
    ANTHROPIC_SMALL_MODEL: config.anthropicSmallModel,
    ANTHROPIC_LARGE_MODEL: config.anthropicLargeModel,
    SECRET_SALT: ensureSecretSalt(config),
    PGLITE_DATA_DIR: join(config.dataDir, "pglite"),
    USE_MULTI_STEP: "true",
    MAX_MULTISTEP_ITERATIONS: String(runtimeSettings.agent.maxIterations),
    ELIZA_AGENT_RUN_DEPTH: runtimeSettings.agent.runDepth,
    ELIZA_AGENT_TOOL_PROGRESS: runtimeSettings.agent.toolProgressMode,
  };

  const modelProvider = runtimeSettings.model.provider;
  const linkedCodex =
    config.useLinkedCodexAuth && modelProvider === "codex"
      ? getLinkedCodexCredentials()
      : undefined;
  const linkedElizaCloud =
    modelProvider === "elizacloud"
      ? getLinkedElizaCloudCredentials()
      : undefined;
  const linkedClaudeCode =
    config.useLinkedClaudeCodeAuth && modelProvider === "claude-code"
      ? getLinkedClaudeCodeCredentials()
      : undefined;

  if (linkedElizaCloud?.apiKey) {
    settings.ELIZAOS_CLOUD_API_KEY = linkedElizaCloud.apiKey;
    settings.ELIZAOS_CLOUD_ENABLED = "true";
    settings.ELIZAOS_CLOUD_BASE_URL =
      linkedElizaCloud.baseUrl || config.elizaCloudBaseUrl;
  } else if (config.elizaCloudApiKey) {
    settings.ELIZAOS_CLOUD_API_KEY = config.elizaCloudApiKey;
  }

  if (linkedCodex?.accessToken) {
    settings.OPENAI_API_KEY = linkedCodex.accessToken;
    settings.OPENAI_BASE_URL = "https://chatgpt.com/backend-api/codex";
  } else if (config.openAiApiKey) {
    settings.OPENAI_API_KEY = config.openAiApiKey;
  }

  if (linkedClaudeCode?.accessToken) {
    settings.ANTHROPIC_API_KEY = linkedClaudeCode.accessToken;
  } else if (config.anthropicApiKey) {
    settings.ANTHROPIC_API_KEY = config.anthropicApiKey;
  }

  if (config.anthropicBaseUrl) {
    settings.ANTHROPIC_BASE_URL = config.anthropicBaseUrl;
  }

  if (config.falApiKey) {
    settings.FAL_API_KEY = config.falApiKey;
  }

  settings.E2B_MODE = process.env.E2B_MODE ?? "local";
  settings.NODE_ENV = process.env.NODE_ENV ?? "development";

  if (process.env.E2B_API_KEY) {
    settings.E2B_API_KEY = process.env.E2B_API_KEY;
  }

  if (process.env.GITHUB_TOKEN) {
    settings.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  }

  if (config.telegramBotToken) {
    settings.TELEGRAM_BOT_TOKEN = config.telegramBotToken;
  }

  if (config.telegramApiRoot) {
    settings.TELEGRAM_API_ROOT = config.telegramApiRoot;
  }

  if (config.telegramAllowedChats) {
    settings.TELEGRAM_ALLOWED_CHATS = config.telegramAllowedChats;
  }

  return settings;
}

function buildCronPrompt(
  services: AppServices,
  prompt: string,
  skillSlugs: string[],
): string {
  if (!skillSlugs.length) {
    return prompt;
  }

  const loadedSkills = skillSlugs
    .map((slug) => services.skills.get(slug))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));

  if (!loadedSkills.length) {
    return prompt;
  }

  const skillContext = loadedSkills
    .map(
      (skill) =>
        `## Skill: ${skill.title}\nslug=${skill.slug}\npath=${skill.path}\n\n${skill.content.trim()}`,
    )
    .join("\n\n");

  return [
    "Use the following installed Eliza Agent skills as execution guidance when relevant.",
    skillContext,
    "Task:",
    prompt,
  ].join("\n\n");
}

function formatCronDeliverySummary(
  count: number,
  delivery: "origin" | "local" | "home",
): string {
  if (delivery !== "home") {
    return "";
  }
  return count > 0
    ? `\n\nDelivered to ${count} home channel${count === 1 ? "" : "s"}.`
    : "\n\nNo home channels are configured yet for delivery.";
}

function eventRoomId(payload: unknown): string | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "roomId" in payload &&
    typeof (payload as { roomId?: unknown }).roomId === "string"
  ) {
    return (payload as { roomId: string }).roomId;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message?: { roomId?: unknown } }).message?.roomId ===
      "string"
  ) {
    return (payload as { message: { roomId: string } }).message.roomId;
  }
  return undefined;
}

function eventActionLabel(payload: unknown): string | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "content" in payload &&
    payload.content &&
    typeof payload.content === "object"
  ) {
    const content = payload.content as {
      actions?: unknown;
      text?: unknown;
      actionStatus?: unknown;
    };
    if (
      Array.isArray(content.actions) &&
      typeof content.actions[0] === "string"
    ) {
      return content.actions[0];
    }
    if (typeof content.text === "string" && content.text.trim()) {
      return content.text.trim();
    }
    if (
      typeof content.actionStatus === "string" &&
      content.actionStatus.trim()
    ) {
      return content.actionStatus.trim();
    }
  }
  return undefined;
}

function agentEventLabel(data: Record<string, unknown>): string | undefined {
  if (typeof data.label === "string" && data.label.trim()) {
    return data.label.trim();
  }
  if (typeof data.preview === "string" && data.preview.trim()) {
    return data.preview.trim();
  }
  if (typeof data.text === "string" && data.text.trim()) {
    return data.text.trim();
  }
  return eventActionLabel(data);
}

function attachRunProgressBridge(
  runtime: AgentRuntime,
  services: AppServices,
): void {
  const register = (
    event: string,
    handler: (payload: unknown) => void | Promise<void>,
  ) => {
    runtime.registerEvent(event, async (payload) => {
      await handler(payload);
    });
  };

  register(EventType.RUN_STARTED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.updateRuntimeThinking(roomId);
    }
  });
  register(EventType.RUN_ENDED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (!roomId) {
      return;
    }
    const status =
      payload &&
      typeof payload === "object" &&
      "status" in payload &&
      (payload.status === "completed" || payload.status === "timeout")
        ? "complete"
        : "error";
    const errorMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error
        ? formatError(payload.error)
        : undefined;
    services.runController.finishRuntimeRun(roomId, status, errorMessage);
  });
  register(EventType.ACTION_STARTED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.noteRuntimeActionStarted(
        roomId,
        eventActionLabel(payload) ?? "action",
      );
    }
  });
  register(EventType.ACTION_COMPLETED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.noteRuntimeActionCompleted(
        roomId,
        eventActionLabel(payload),
      );
    }
  });
  register(EventType.MESSAGE_RECEIVED, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.noteRuntimeMessage(roomId);
    }
  });
  register(EventType.MESSAGE_SENT, async (payload) => {
    const roomId = eventRoomId(payload);
    if (roomId) {
      services.runController.updateRuntimeWaiting(roomId);
    }
  });

  const agentEvents = getAgentEventService(runtime);
  if (agentEvents) {
    agentEvents.subscribe((event) => {
      if (!event.roomId) {
        return;
      }
      const roomId = String(event.roomId);
      const label = agentEventLabel(event.data);
      services.runController.noteRuntimeStream(roomId, event.stream, label);
    });

    agentEvents.subscribeHeartbeat((event) => {
      services.runController.noteHeartbeat(
        event.status,
        event.preview,
        event.indicatorType,
      );
    });

    services.runController.markAgentEventBridgeAttached(true);
  }

  // Initialize the self-awareness registry so autonomous consumers can
  // compose truthful self-status from the current runtime, run, and startup
  // state without mutating the transcript.
  services.awareness.initialize(services);

  services.runController.markRuntimeBridgeAttached(true);
}

export async function getAppContext(
  options: AppContextOptions = {},
): Promise<AppContext> {
  const eagerDeferredHydration =
    options.eagerDeferredHydration ?? options.startupMode !== "cli";

  if (contextValue) {
    if (eagerDeferredHydration) {
      await contextValue.ensureDeferredHydration(options.startupMode);
    }
    return contextValue;
  }

  if (contextPromise) {
    const resolved = await contextPromise;
    if (eagerDeferredHydration) {
      await resolved.ensureDeferredHydration(options.startupMode);
    }
    return resolved;
  }

  contextPromise = (async () => {
    const config = loadConfig();
    process.env.LOG_LEVEL ||= "error";
    process.env.DEFAULT_LOG_LEVEL ||= process.env.LOG_LEVEL;
    process.env.SECRET_SALT =
      process.env.SECRET_SALT || ensureSecretSalt(config);
    process.env.PGLITE_DATA_DIR ||= join(config.dataDir, "pglite");
    const services = createServices(config);
    services.startupState.markWarming("runtime", "initializing core runtime");
    services.startupState.markDeferred(
      "gateway",
      "will hydrate when remote transport features are needed",
    );
    services.startupState.markDeferred(
      "cron",
      "will hydrate after the shell is interactive",
    );
    const runtimeSettings = services.settings.get();
    const nativePluginAssembly = await buildNativePluginAssembly(
      services,
      config,
      {
        hotOnly: !eagerDeferredHydration,
      },
    );
    const createRuntime = () =>
      new AgentRuntime({
        character: {
          ...character,
          name: config.agentName,
          // Enable core advanced capabilities at the character level
          advancedMemory: true,
          advancedPlanning: true,
          settings: {
            ...(character.settings ?? {}),
            ...buildPluginSettings(config, services, runtimeSettings),
            nativePluginCatalog: JSON.stringify(nativePluginAssembly.catalog),
          },
        },
        plugins: nativePluginAssembly.initial,
        // Enable advanced providers: knowledge, facts, relationships, contacts, roles, follow-ups
        advancedCapabilities: true,
        enableExtendedCapabilities: true,
      });

    mkdirSync(join(config.dataDir, "pglite"), { recursive: true });
    reconcilePglitePidFile(join(config.dataDir, "pglite"));
    const runtime = await initializeRuntimeWithRecovery(
      createRuntime,
      services,
      config,
    );
    await ensureCoreRuntimeServices(runtime);
    services.nativeOwnership.attachRuntime(runtime, services);
    (services as RuntimeBindableServices).__bindRuntime?.(runtime);
    attachRunProgressBridge(runtime, services);
    services.startupState.markReady("runtime", "runtime ready");

    services.cron.setExecutor(async (job) => {
      const { handleAgentTurn } = await import("@/runtime/chat");
      const output = await handleAgentTurn(
        {
          message: buildCronPrompt(services, job.prompt, job.skills),
          userId: "cron",
          roomId: `cron:${job.id}`,
          source: "cron",
        },
        {
          config,
          services,
          runtime,
        },
        {
          runtimeOverrides: job.runtime,
          personalityId: job.runtime?.personalityId,
        },
      );
      if (job.delivery === "home") {
        const deliveries = await ensureGateway().sendToHomes(output, {
          metadata: {
            cronJobId: job.id,
            cronJobName: job.name,
          },
          name: job.name,
        });
        return `${output}${formatCronDeliverySummary(deliveries.length, job.delivery)}`;
      }
      return output;
    });

    const gatewayService = runtime.getService("eliza_agent_gateway") as {
      runner?: GatewayRunner;
      ensureRunner?: () => GatewayRunner;
    } | null;
    const schedulerService = runtime.getService("eliza_agent_scheduler") as {
      startScheduler?: () => Promise<void>;
    } | null;
    let gatewayInstance = gatewayService?.runner;
    let deferredPluginsRegistered = eagerDeferredHydration;
    const ensureDeferredPlugins = async (): Promise<void> => {
      if (deferredPluginsRegistered) {
        return;
      }
      services.startupState.markWarming(
        "runtime",
        "registering deferred runtime plugins",
      );
      const deferredAssembly = await buildNativePluginAssembly(
        services,
        config,
      );
      for (const plugin of deferredAssembly.deferred) {
        await runtime.registerPlugin(plugin);
      }
      deferredPluginsRegistered = true;
      services.startupState.markReady("runtime", "runtime ready");
    };
    const ensureGateway = (): GatewayRunner => {
      if (!gatewayInstance) {
        services.startupState.markWarming(
          "gateway",
          "preparing messaging gateway",
        );
        gatewayInstance =
          gatewayService?.ensureRunner?.() ??
          new GatewayRunner({
            config,
            services,
            runtime,
            get gateway() {
              return ensureGateway();
            },
            ensureDeferredHydration,
          } as AppContext);
        services.startupState.markReady("gateway", "gateway runner ready");
      }
      return gatewayInstance;
    };
    let deferredHydrationPromise: Promise<void> | undefined;
    const ensureDeferredHydration = async (reason?: string): Promise<void> => {
      if (!deferredHydrationPromise) {
        deferredHydrationPromise = (async () => {
          const phaseSuffix = reason ? ` (${reason})` : "";
          await ensureDeferredPlugins();
          if (
            services.startupState.getSnapshot().phases.gateway.status !==
            "ready"
          ) {
            ensureGateway();
          }
          if (
            services.startupState.getSnapshot().phases.cron.status !== "ready"
          ) {
            services.startupState.markWarming(
              "cron",
              `starting scheduler${phaseSuffix}`,
            );
            if (schedulerService?.startScheduler) {
              await schedulerService.startScheduler();
            } else {
              services.cron.start();
            }
            services.startupState.markReady("cron", "scheduler ready");
          }
          services.diagnostics;
          services.operator;
          services.ecosystem;
          services.skills;
        })().catch((error) => {
          const detail = formatError(error);
          if (
            services.startupState.getSnapshot().phases.gateway.status ===
            "warming"
          ) {
            services.startupState.markError("gateway", detail);
          }
          if (
            services.startupState.getSnapshot().phases.cron.status === "warming"
          ) {
            services.startupState.markError("cron", detail);
          }
          throw error;
        });
      }
      await deferredHydrationPromise;
    };

    const context = {
      config,
      services,
      runtime,
      get gateway() {
        return ensureGateway();
      },
      ensureDeferredHydration,
    } as AppContext;

    if (eagerDeferredHydration) {
      await context.ensureDeferredHydration(options.startupMode);
    }

    contextValue = context;
    return context;
  })();
  try {
    return await contextPromise;
  } catch (error) {
    contextPromise = undefined;
    contextValue = undefined;
    throw error;
  }
}
