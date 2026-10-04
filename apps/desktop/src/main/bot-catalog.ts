import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  type BotCatalogResponse,
  type BotDefinition,
  type BotModelRoute,
  type BotPermissions,
  type BotSummary,
  type CreateBotInput,
  DEFAULT_MODEL_ROUTE,
  type UpdateBotInput,
} from "@doolittle/contracts";
import type { BackendManager } from "./backend";

const BOT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
// AgentRuntime derives this id from the unmodified Doolittle character name.
const LEGACY_AGENT_ID = "9f21e797-127f-0eba-b547-92f9b113fb1e";
const MAX_NAME_LENGTH = 80;
const MAX_PERSONA_LENGTH = 16_000;
const MAX_CATALOG_BYTES = 2_000_000;

interface StoredBotCatalog {
  version: 1;
  defaultName?: string;
  bots: BotDefinition[];
}

function requiredText(value: unknown, label: string, limit: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > limit ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value.trim();
}

function personaText(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > MAX_PERSONA_LENGTH ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
      );
    })
  ) {
    throw new Error("Bot persona is invalid.");
  }
  return value.trim();
}

function validateWorkspacePath(value: unknown): string {
  const path = requiredText(value, "Bot workspace", 4_096);
  if (!isAbsolute(path)) throw new Error("Bot workspace must be absolute.");
  return resolve(path);
}

function validateStringList(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return [...new Set(value.map((entry) => requiredText(entry, label, 256)))];
}

function normalizeModel(
  value: BotModelRoute | undefined,
  fallback: BotModelRoute,
): BotModelRoute {
  if (!value) return { ...fallback };
  const provider = requiredText(value.provider, "Bot provider", 80);
  const model = requiredText(value.model, "Bot model", 160);
  const reasoningEffort = value.reasoningEffort;
  if (
    reasoningEffort !== undefined &&
    ![
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ].includes(reasoningEffort)
  ) {
    throw new Error("Bot reasoning effort is invalid.");
  }
  return {
    provider,
    model,
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

function normalizePermissions(
  value: Partial<BotPermissions> | undefined,
  workspacePath: string,
): BotPermissions {
  const workspacePaths = validateStringList(
    value?.workspacePaths ?? [workspacePath],
    "Bot workspace permissions",
  ).map(validateWorkspacePath);
  if (!workspacePaths.includes(workspacePath)) {
    throw new Error("Bot workspace is not included in its permissions.");
  }
  return {
    connectionIds: validateStringList(
      value?.connectionIds ?? [],
      "Bot connection references",
    ),
    workspacePaths,
    toolIds: validateStringList(value?.toolIds ?? [], "Bot tool permissions"),
    allowMutation: value?.allowMutation === true,
    allowDelegation: value?.allowDelegation === true,
  };
}

function isStoredBotDefinition(value: unknown): value is BotDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const bot = value as Partial<BotDefinition>;
  if (
    typeof bot.id !== "string" ||
    !BOT_ID_PATTERN.test(bot.id) ||
    bot.id === "default" ||
    typeof bot.agentId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      bot.agentId,
    ) ||
    bot.isDefault !== false ||
    typeof bot.createdAt !== "string" ||
    typeof bot.updatedAt !== "string" ||
    (bot.archivedAt !== undefined && typeof bot.archivedAt !== "string")
  )
    return false;
  try {
    requiredText(bot.name, "Bot name", MAX_NAME_LENGTH);
    personaText(bot.persona);
    const workspacePath = validateWorkspacePath(bot.workspacePath);
    if (workspacePath !== bot.workspacePath) return false;
    if (!bot.model || !bot.permissions) return false;
    normalizeModel(bot.model, DEFAULT_MODEL_ROUTE);
    const permissions = normalizePermissions(bot.permissions, workspacePath);
    if (
      !Array.isArray(bot.permissions.connectionIds) ||
      !Array.isArray(bot.permissions.workspacePaths) ||
      !Array.isArray(bot.permissions.toolIds) ||
      typeof bot.permissions.allowMutation !== "boolean" ||
      typeof bot.permissions.allowDelegation !== "boolean" ||
      permissions.workspacePaths.length !==
        bot.permissions.workspacePaths.length
    )
      return false;
    if (bot.avatar !== undefined) requiredText(bot.avatar, "Bot avatar", 80);
    if (bot.projectId !== undefined)
      requiredText(bot.projectId, "Bot project", 128);
    return true;
  } catch {
    return false;
  }
}

function publicState(
  definition: BotDefinition,
  backend?: BackendManager,
): BotSummary {
  const state = backend?.getState();
  return {
    ...definition,
    state: definition.archivedAt
      ? "archived"
      : state?.phase === "ready"
        ? "ready"
        : state?.phase === "booting"
          ? "starting"
          : state?.phase === "degraded"
            ? "error"
            : "stopped",
    activeRunCount: 0,
    ...(state?.phase === "degraded"
      ? { error: "This bot could not start. Check its connection and retry." }
      : {}),
  };
}

/** Main-process-owned, additive catalog. The legacy default is synthesized. */
export class BotCatalog {
  private readonly filePath: string;
  private stored: StoredBotCatalog;

  constructor(
    dataDir: string,
    private readonly defaultBackend: BackendManager,
    private readonly defaultWorkspacePath: string,
  ) {
    this.filePath = resolve(dataDir, "bots", "catalog.json");
    this.stored = this.load();
  }

  private load(): StoredBotCatalog {
    if (!existsSync(this.filePath)) return { version: 1, bots: [] };
    const raw = readFileSync(this.filePath, "utf8");
    if (Buffer.byteLength(raw) > MAX_CATALOG_BYTES) {
      throw new Error("The bot catalog exceeds its supported size.");
    }
    const value = JSON.parse(raw) as StoredBotCatalog;
    if (
      value.version !== 1 ||
      !Array.isArray(value.bots) ||
      value.bots.some((bot) => !isStoredBotDefinition(bot)) ||
      new Set(value.bots.map((bot) => bot.id)).size !== value.bots.length
    ) {
      throw new Error("The bot catalog is invalid.");
    }
    return value;
  }

  private save(): void {
    mkdirSync(resolve(this.filePath, ".."), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.stored), { mode: 0o600 });
    renameSync(temporary, this.filePath);
  }

  defaultBot(): BotDefinition {
    const state = this.defaultBackend.getState();
    const agentId = state.agentId ?? LEGACY_AGENT_ID;
    const workspacePath =
      this.defaultBackend.getWorkspaceDirectory() || this.defaultWorkspacePath;
    return {
      id: agentId,
      agentId,
      name: this.stored.defaultName ?? state.name ?? "Doolittle",
      persona: "Doolittle",
      model: { ...DEFAULT_MODEL_ROUTE },
      permissions: {
        connectionIds: [],
        workspacePaths: [workspacePath],
        toolIds: [],
        allowMutation: true,
        allowDelegation: true,
      },
      workspacePath,
      isDefault: true,
      createdAt: "",
      updatedAt: "",
    };
  }

  get(id: string): BotDefinition | undefined {
    return id === "default" || id === this.defaultBot().id
      ? this.defaultBot()
      : this.stored.bots.find((bot) => bot.id === id);
  }

  list(backends: ReadonlyMap<string, BackendManager>): BotCatalogResponse {
    const defaultBot = this.defaultBot();
    return {
      version: 1,
      defaultBotId: defaultBot.id,
      bots: [
        publicState(defaultBot, this.defaultBackend),
        ...this.stored.bots.map((bot) =>
          publicState(bot, backends.get(bot.id)),
        ),
      ],
    };
  }

  create(input: CreateBotInput): BotDefinition {
    const name = requiredText(input.name, "Bot name", MAX_NAME_LENGTH);
    const persona = personaText(input.persona);
    const workspacePath = validateWorkspacePath(
      input.workspacePath ?? this.defaultBackend.getWorkspaceDirectory(),
    );
    const now = new Date().toISOString();
    const definition: BotDefinition = {
      id: randomUUID(),
      agentId: randomUUID(),
      name,
      persona,
      ...(input.avatar
        ? { avatar: requiredText(input.avatar, "Bot avatar", 80) }
        : {}),
      model: normalizeModel(input.model, DEFAULT_MODEL_ROUTE),
      permissions: normalizePermissions(input.permissions, workspacePath),
      workspacePath,
      ...(input.projectId
        ? { projectId: requiredText(input.projectId, "Bot project", 128) }
        : {}),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    this.stored.bots.push(definition);
    this.save();
    return definition;
  }

  update(id: string, input: UpdateBotInput): BotDefinition {
    const existing = this.get(id);
    if (!existing || existing.archivedAt) throw new Error("Bot not found.");
    if (existing.isDefault) {
      if (Object.keys(input).some((key) => key !== "name")) {
        throw new Error("The lead bot only supports display-name changes.");
      }
      this.stored.defaultName = requiredText(
        input.name,
        "Bot name",
        MAX_NAME_LENGTH,
      );
      this.save();
      return this.defaultBot();
    }
    const workspacePath = input.workspacePath
      ? validateWorkspacePath(input.workspacePath)
      : existing.workspacePath;
    const updated: BotDefinition = {
      ...existing,
      ...(input.name
        ? { name: requiredText(input.name, "Bot name", MAX_NAME_LENGTH) }
        : {}),
      ...(input.persona
        ? {
            persona: personaText(input.persona),
          }
        : {}),
      ...(input.avatar
        ? { avatar: requiredText(input.avatar, "Bot avatar", 80) }
        : {}),
      model: normalizeModel(input.model, existing.model),
      permissions: input.permissions
        ? normalizePermissions(
            { ...existing.permissions, ...input.permissions },
            workspacePath,
          )
        : existing.permissions,
      workspacePath,
      ...(input.projectId
        ? { projectId: requiredText(input.projectId, "Bot project", 128) }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    this.stored.bots = this.stored.bots.map((bot) =>
      bot.id === id ? updated : bot,
    );
    this.save();
    return updated;
  }

  archive(id: string): BotDefinition {
    if (this.get(id)?.isDefault)
      throw new Error("The lead bot cannot be archived.");
    const existing = this.get(id);
    if (!existing) throw new Error("Bot not found.");
    if (existing.archivedAt) return existing;
    const now = new Date().toISOString();
    const archived = { ...existing, archivedAt: now, updatedAt: now };
    this.stored.bots = this.stored.bots.map((bot) =>
      bot.id === id ? archived : bot,
    );
    this.save();
    return archived;
  }
}
