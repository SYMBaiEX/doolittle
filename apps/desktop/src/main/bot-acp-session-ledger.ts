import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

const ID = /^[A-Za-z0-9:_-]{1,128}$/u;
const MAX_BYTES = 2_000_000;
const MAX_RECORDS = 5_000;

export interface BoundAcpSession {
  sessionId: string;
  botId: string;
  originConversationId: string;
  workspacePath: string;
  createdAt: string;
}

interface StoredAcpSessions {
  version: 1;
  revision: number;
  sessions: BoundAcpSession[];
}

function parse(path: string): StoredAcpSessions | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  if (Buffer.byteLength(raw) > MAX_BYTES)
    throw new Error("ACP owner ledger is too large.");
  const value = JSON.parse(raw) as Partial<StoredAcpSessions>;
  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision ?? -1) < 0 ||
    !Array.isArray(value.sessions) ||
    value.sessions.length > MAX_RECORDS ||
    value.sessions.some(
      (entry) =>
        !entry ||
        !ID.test(entry.sessionId) ||
        !ID.test(entry.botId) ||
        !ID.test(entry.originConversationId) ||
        typeof entry.workspacePath !== "string" ||
        !isAbsolute(entry.workspacePath) ||
        typeof entry.createdAt !== "string" ||
        !Number.isFinite(Date.parse(entry.createdAt)),
    ) ||
    new Set(value.sessions.map((entry) => entry.sessionId)).size !==
      value.sessions.length
  ) {
    throw new Error("ACP owner ledger is invalid.");
  }
  return value as StoredAcpSessions;
}

/** ACP protocol-session ownership, separate from chat-conversation ownership. */
export class BotAcpSessionLedger {
  private readonly path: string;
  private readonly backupPath: string;
  private stored: StoredAcpSessions;
  private failed = false;

  constructor(dataDir: string) {
    this.path = resolve(dataDir, "bots", "acp-session-owners.json");
    this.backupPath = resolve(
      dataDir,
      "bots",
      "acp-session-owners.backup.json",
    );
    let primary: StoredAcpSessions | null = null;
    let backup: StoredAcpSessions | null = null;
    let firstError: unknown;
    try {
      primary = parse(this.path);
    } catch (error) {
      firstError = error;
    }
    try {
      backup = parse(this.backupPath);
    } catch (error) {
      firstError ??= error;
    }
    if (firstError && !primary && !backup)
      throw new Error("Both ACP owner ledger copies are unavailable.", {
        cause: firstError,
      });
    if (
      primary &&
      backup &&
      primary.revision === backup.revision &&
      JSON.stringify(primary) !== JSON.stringify(backup)
    ) {
      throw new Error("ACP owner ledger copies disagree.");
    }
    this.stored =
      primary && (!backup || primary.revision >= backup.revision)
        ? primary
        : (backup ?? { version: 1, revision: 0, sessions: [] });
  }

  get(sessionId: string): BoundAcpSession | null {
    if (!ID.test(sessionId)) throw new Error("ACP session ID is invalid.");
    const owner = this.stored.sessions.find(
      (entry) => entry.sessionId === sessionId,
    );
    return owner ? structuredClone(owner) : null;
  }

  bind(input: Omit<BoundAcpSession, "createdAt">): BoundAcpSession {
    if (
      !ID.test(input.sessionId) ||
      !ID.test(input.botId) ||
      !ID.test(input.originConversationId)
    ) {
      throw new Error("ACP owner identity is invalid.");
    }
    const existing = this.get(input.sessionId);
    if (existing) {
      if (
        existing.botId !== input.botId ||
        existing.originConversationId !== input.originConversationId ||
        existing.workspacePath !== input.workspacePath
      )
        throw new Error("ACP session belongs to another bot or workspace.");
      return existing;
    }
    if (this.failed) throw new Error("ACP owner ledger needs recovery.");
    const record = { ...input, createdAt: new Date().toISOString() };
    const next = {
      ...this.stored,
      revision: this.stored.revision + 1,
      sessions: [...this.stored.sessions, record],
    };
    const serialized = JSON.stringify(next);
    if (
      next.sessions.length > MAX_RECORDS ||
      Buffer.byteLength(serialized) > MAX_BYTES
    ) {
      throw new Error("ACP owner ledger is full.");
    }
    try {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      writeJsonAtomicSync(this.path, next, { trailingNewline: true });
      chmodSync(this.path, 0o600);
      writeJsonAtomicSync(this.backupPath, next, { trailingNewline: true });
      chmodSync(this.backupPath, 0o600);
      this.stored = next;
    } catch (error) {
      this.failed = true;
      throw error;
    }
    return structuredClone(record);
  }

  assert(botId: string, sessionId: string): BoundAcpSession {
    const owner = this.get(sessionId);
    if (!owner || owner.botId !== botId)
      throw new Error("ACP session belongs to another bot or is unavailable.");
    return owner;
  }
}
