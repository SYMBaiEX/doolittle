import { chmodSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

const SESSION_ID = /^[a-zA-Z0-9:_-]{1,128}$/u;
const BOT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const PROJECT_ID = /^[a-zA-Z0-9:_-]{1,128}$/u;
const MAX_LEDGER_BYTES = 4_000_000;

export interface BoundConversation {
  sessionId: string;
  botId: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoundRun {
  runId: string;
  sessionId: string;
  botId: string;
  projectId?: string;
  createdAt: string;
}

export interface BoundProject {
  projectId: string;
  botId: string;
  createdAt: string;
}

export interface BoundResource {
  resourceId: string;
  projectId: string;
  botId: string;
  createdAt: string;
}

interface StoredLedger {
  version: 1;
  conversations: BoundConversation[];
  runs?: BoundRun[];
  projects?: BoundProject[];
  resources?: BoundResource[];
}

function validProject(value: unknown): value is BoundProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<BoundProject>;
  return (
    typeof item.projectId === "string" &&
    PROJECT_ID.test(item.projectId) &&
    typeof item.botId === "string" &&
    BOT_ID.test(item.botId) &&
    typeof item.createdAt === "string" &&
    !Number.isNaN(Date.parse(item.createdAt))
  );
}

function validResource(value: unknown): value is BoundResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<BoundResource>;
  return (
    typeof item.resourceId === "string" &&
    PROJECT_ID.test(item.resourceId) &&
    typeof item.projectId === "string" &&
    PROJECT_ID.test(item.projectId) &&
    typeof item.botId === "string" &&
    BOT_ID.test(item.botId) &&
    typeof item.createdAt === "string" &&
    !Number.isNaN(Date.parse(item.createdAt))
  );
}

function validRun(value: unknown): value is BoundRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<BoundRun>;
  return (
    typeof item.runId === "string" &&
    SESSION_ID.test(item.runId) &&
    typeof item.sessionId === "string" &&
    SESSION_ID.test(item.sessionId) &&
    typeof item.botId === "string" &&
    BOT_ID.test(item.botId) &&
    (item.projectId === undefined ||
      (typeof item.projectId === "string" &&
        PROJECT_ID.test(item.projectId))) &&
    typeof item.createdAt === "string" &&
    !Number.isNaN(Date.parse(item.createdAt))
  );
}

function validConversation(value: unknown): value is BoundConversation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<BoundConversation>;
  return (
    typeof item.sessionId === "string" &&
    SESSION_ID.test(item.sessionId) &&
    typeof item.botId === "string" &&
    BOT_ID.test(item.botId) &&
    (item.projectId === undefined ||
      (typeof item.projectId === "string" &&
        PROJECT_ID.test(item.projectId))) &&
    typeof item.createdAt === "string" &&
    !Number.isNaN(Date.parse(item.createdAt)) &&
    typeof item.updatedAt === "string" &&
    !Number.isNaN(Date.parse(item.updatedAt))
  );
}

function parseLedger(path: string): StoredLedger | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  if (Buffer.byteLength(raw, "utf8") > MAX_LEDGER_BYTES)
    throw new Error("The conversation owner ledger is too large.");
  const value = JSON.parse(raw) as Partial<StoredLedger>;
  if (
    value.version !== 1 ||
    !Array.isArray(value.conversations) ||
    value.conversations.some((item) => !validConversation(item)) ||
    (value.runs !== undefined &&
      (!Array.isArray(value.runs) ||
        value.runs.some((item) => !validRun(item)) ||
        new Set(value.runs.map((item) => item.runId)).size !==
          value.runs.length)) ||
    (value.projects !== undefined &&
      (!Array.isArray(value.projects) ||
        value.projects.some((item) => !validProject(item)) ||
        new Set(value.projects.map((item) => item.projectId)).size !==
          value.projects.length)) ||
    (value.resources !== undefined &&
      (!Array.isArray(value.resources) ||
        value.resources.some((item) => !validResource(item)) ||
        new Set(value.resources.map((item) => item.resourceId)).size !==
          value.resources.length)) ||
    new Set(value.conversations.map((item) => item.sessionId)).size !==
      value.conversations.length
  ) {
    throw new Error("The conversation owner ledger is invalid.");
  }
  return value as StoredLedger;
}

/** Main-process authority for persistent session ownership; workers never edit it. */
export class BotConversationLedger {
  private readonly path: string;
  private readonly backupPath: string;
  private readonly conversations = new Map<string, BoundConversation>();
  private readonly runs = new Map<string, BoundRun>();
  private readonly projects = new Map<string, BoundProject>();
  private readonly resources = new Map<string, BoundResource>();

  constructor(runtimeDataDir: string) {
    this.path = resolve(runtimeDataDir, "bots", "conversation-owners.json");
    this.backupPath = resolve(
      runtimeDataDir,
      "bots",
      "conversation-owners.backup.json",
    );
    const primaryExists = existsSync(this.path);
    const backupExists = existsSync(this.backupPath);
    let primary: StoredLedger | null = null;
    let backup: StoredLedger | null = null;
    try {
      primary = parseLedger(this.path);
    } catch {
      /* recover from backup */
    }
    try {
      backup = parseLedger(this.backupPath);
    } catch {
      /* recover from primary */
    }
    if ((primaryExists || backupExists) && !primary && !backup) {
      throw new Error(
        "Conversation ownership could not be recovered. Repair is required.",
      );
    }
    for (const record of [
      ...(backup?.conversations ?? []),
      ...(primary?.conversations ?? []),
    ]) {
      const existing = this.conversations.get(record.sessionId);
      if (
        existing &&
        (existing.botId !== record.botId ||
          existing.projectId !== record.projectId)
      ) {
        throw new Error(
          "Conversation ownership copies disagree. Repair is required.",
        );
      }
      this.conversations.set(record.sessionId, record);
    }
    for (const run of [...(backup?.runs ?? []), ...(primary?.runs ?? [])]) {
      const existing = this.runs.get(run.runId);
      if (
        existing &&
        (existing.botId !== run.botId ||
          existing.sessionId !== run.sessionId ||
          existing.projectId !== run.projectId)
      ) {
        throw new Error("Run ownership copies disagree. Repair is required.");
      }
      this.runs.set(run.runId, run);
    }
    for (const project of [
      ...(backup?.projects ?? []),
      ...(primary?.projects ?? []),
    ]) {
      const existing = this.projects.get(project.projectId);
      if (existing && existing.botId !== project.botId)
        throw new Error(
          "Project ownership copies disagree. Repair is required.",
        );
      this.projects.set(project.projectId, project);
    }
    for (const resource of [
      ...(backup?.resources ?? []),
      ...(primary?.resources ?? []),
    ]) {
      const existing = this.resources.get(resource.resourceId);
      if (
        existing &&
        (existing.botId !== resource.botId ||
          existing.projectId !== resource.projectId)
      )
        throw new Error(
          "Resource ownership copies disagree. Repair is required.",
        );
      this.resources.set(resource.resourceId, resource);
    }
    if ((!primary && backup) || (primary && !backup)) this.save();
  }

  get(sessionId: string): BoundConversation | null {
    if (!SESSION_ID.test(sessionId))
      throw new Error("Conversation ID is invalid.");
    return this.conversations.get(sessionId) ?? null;
  }

  list(botId: string): BoundConversation[] {
    if (!BOT_ID.test(botId)) throw new Error("Bot ID is invalid.");
    return [...this.conversations.values()]
      .filter((record) => record.botId === botId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  bind(
    botId: string,
    sessionId: string,
    projectId?: string,
  ): BoundConversation {
    if (
      !BOT_ID.test(botId) ||
      !SESSION_ID.test(sessionId) ||
      (projectId !== undefined && !PROJECT_ID.test(projectId))
    ) {
      throw new Error("Conversation owner input is invalid.");
    }
    const existing = this.conversations.get(sessionId);
    if (existing) {
      if (existing.botId !== botId || existing.projectId !== projectId) {
        throw new Error("Conversation belongs to a different bot or project.");
      }
      return existing;
    }
    const now = new Date().toISOString();
    const created: BoundConversation = {
      sessionId,
      botId,
      ...(projectId ? { projectId } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(sessionId, created);
    try {
      this.save();
    } catch (error) {
      this.conversations.delete(sessionId);
      throw error;
    }
    return created;
  }

  touch(botId: string, sessionId: string): BoundConversation {
    const current = this.get(sessionId);
    if (!current || current.botId !== botId)
      throw new Error("Conversation belongs to a different bot.");
    const updated = { ...current, updatedAt: new Date().toISOString() };
    this.conversations.set(sessionId, updated);
    try {
      this.save();
    } catch (error) {
      this.conversations.set(sessionId, current);
      throw error;
    }
    return updated;
  }

  getRun(runId: string): BoundRun | null {
    if (!SESSION_ID.test(runId)) throw new Error("Run ID is invalid.");
    return this.runs.get(runId) ?? null;
  }

  bindRun(botId: string, sessionId: string, runId: string): BoundRun {
    if (!SESSION_ID.test(runId)) throw new Error("Run ID is invalid.");
    const conversation = this.get(sessionId);
    if (!conversation || conversation.botId !== botId) {
      throw new Error("Run conversation belongs to a different bot.");
    }
    const existing = this.runs.get(runId);
    if (existing) {
      if (
        existing.botId !== botId ||
        existing.sessionId !== sessionId ||
        existing.projectId !== conversation.projectId
      ) {
        throw new Error(
          "Run belongs to a different bot, conversation, or project.",
        );
      }
      return existing;
    }
    const created = {
      runId,
      sessionId,
      botId,
      ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
      createdAt: new Date().toISOString(),
    };
    this.runs.set(runId, created);
    try {
      this.save();
    } catch (error) {
      this.runs.delete(runId);
      throw error;
    }
    return created;
  }

  getProject(projectId: string): BoundProject | null {
    if (!PROJECT_ID.test(projectId)) throw new Error("Project ID is invalid.");
    return this.projects.get(projectId) ?? null;
  }

  bindProject(botId: string, projectId: string): BoundProject {
    if (!BOT_ID.test(botId) || !PROJECT_ID.test(projectId))
      throw new Error("Project owner input is invalid.");
    const existing = this.projects.get(projectId);
    if (existing) {
      if (existing.botId !== botId)
        throw new Error("Project belongs to a different bot.");
      return existing;
    }
    const created = { botId, projectId, createdAt: new Date().toISOString() };
    this.projects.set(projectId, created);
    try {
      this.save();
    } catch (error) {
      this.projects.delete(projectId);
      throw error;
    }
    return created;
  }

  getResource(resourceId: string): BoundResource | null {
    if (!PROJECT_ID.test(resourceId))
      throw new Error("Resource ID is invalid.");
    return this.resources.get(resourceId) ?? null;
  }

  bindResource(
    botId: string,
    projectId: string,
    resourceId: string,
  ): BoundResource {
    if (!PROJECT_ID.test(resourceId))
      throw new Error("Resource ID is invalid.");
    const project = this.getProject(projectId);
    if (!project || project.botId !== botId)
      throw new Error("Resource project belongs to a different bot.");
    const existing = this.resources.get(resourceId);
    if (existing) {
      if (existing.botId !== botId || existing.projectId !== projectId)
        throw new Error("Resource belongs to a different bot or project.");
      return existing;
    }
    const created = {
      botId,
      projectId,
      resourceId,
      createdAt: new Date().toISOString(),
    };
    this.resources.set(resourceId, created);
    try {
      this.save();
    } catch (error) {
      this.resources.delete(resourceId);
      throw error;
    }
    return created;
  }

  private save(): void {
    const value: StoredLedger = {
      version: 1,
      conversations: [...this.conversations.values()],
      runs: [...this.runs.values()],
      projects: [...this.projects.values()],
      resources: [...this.resources.values()],
    };
    // Two independently atomic copies allow recovery after an interrupted
    // upgrade without permitting a conflicting owner to be silently adopted.
    writeJsonAtomicSync(this.backupPath, value, { trailingNewline: true });
    chmodSync(this.backupPath, 0o600);
    writeJsonAtomicSync(this.path, value, { trailingNewline: true });
    chmodSync(this.path, 0o600);
  }
}
