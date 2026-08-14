import type { ManagedAttachmentDescriptor } from "../shared/contracts";
import type { MemoryMatchSnapshot } from "./memory-matches";

export const CONVERSATION_PINS_STORAGE_KEY =
  "doolittle.desktop.conversation.pins.v1";
export const CONVERSATION_PINS_EVENT = "doolittle:conversation-pins-changed";
export const CONVERSATION_DRAFTS_STORAGE_KEY =
  "doolittle.desktop.conversation.drafts.v1";
export const CONVERSATION_QUEUE_STORAGE_KEY =
  "doolittle.desktop.conversation.queue.v1";
export const PROMPT_LIBRARY_STORAGE_KEY = "doolittle.desktop.prompt-library.v1";

const MAX_PERSISTED_SESSIONS = 250;
const MAX_DRAFT_LENGTH = 50_000;
const MAX_QUEUE_ITEMS = 50;
const MAX_ATTACHMENT_COUNT = 8;
export const MAX_PROMPT_LIBRARY_ITEMS = 50;
export const MAX_PROMPT_TITLE_LENGTH = 80;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Browser storage is an optional cache in the desktop app. Private browsing,
 * quota exhaustion, and managed profiles can all make writes throw; callers
 * should keep the in-memory state authoritative when that happens.
 */
export function safeSetStorageItem(
  storage: StorageLike,
  key: string,
  value: string,
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export type ConversationPins = Record<string, boolean>;
export type ConversationDrafts = Record<string, string>;

export interface PersistedQueuedMessage {
  id: string;
  sessionId: string;
  projectId?: string;
  content: string;
  attachments: ManagedAttachmentDescriptor[];
  memoryMatch?: MemoryMatchSnapshot;
}

export interface PromptLibraryEntry {
  id: string;
  title: string;
  content: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseStored(storage: StorageLike, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value ? (JSON.parse(value) as unknown) : null;
  } catch {
    return null;
  }
}

function validSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    Array.from(value).every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
  );
}

function validAttachment(value: unknown): value is ManagedAttachmentDescriptor {
  const record = objectValue(value);
  return Boolean(
    record &&
      typeof record.id === "string" &&
      /^[a-f0-9-]{16,64}$/iu.test(record.id) &&
      typeof record.name === "string" &&
      record.name.length > 0 &&
      record.name.length <= 512 &&
      ["audio", "document", "image", "video"].includes(String(record.kind)) &&
      typeof record.mimeType === "string" &&
      typeof record.sizeBytes === "number" &&
      Number.isFinite(record.sizeBytes) &&
      record.sizeBytes >= 0 &&
      typeof record.sha256 === "string" &&
      /^[a-f0-9]{64}$/iu.test(record.sha256),
  );
}

function validMemoryMatch(value: unknown): value is MemoryMatchSnapshot {
  const record = objectValue(value);
  return Boolean(
    record &&
      record.source === "saved-profile-recall" &&
      typeof record.count === "number" &&
      Number.isInteger(record.count) &&
      record.count >= 0 &&
      record.count <= 100,
  );
}

function sanitizePromptLibraryEntry(value: unknown): PromptLibraryEntry | null {
  const record = objectValue(value);
  if (!record || !validSessionId(record.id)) return null;
  if (
    typeof record.title !== "string" ||
    typeof record.content !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    (record.projectId !== undefined && !validSessionId(record.projectId))
  ) {
    return null;
  }
  const title = record.title.trim();
  const content = record.content.trim();
  if (
    !title ||
    title.length > MAX_PROMPT_TITLE_LENGTH ||
    !content ||
    content.length > MAX_DRAFT_LENGTH ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    return null;
  }
  return {
    id: record.id,
    title,
    content,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function loadConversationPins(storage: StorageLike): ConversationPins {
  const record = objectValue(
    parseStored(storage, CONVERSATION_PINS_STORAGE_KEY),
  );
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        (entry): entry is [string, boolean] =>
          validSessionId(entry[0]) && entry[1] === true,
      )
      .slice(0, MAX_PERSISTED_SESSIONS),
  );
}

export function saveConversationPins(
  storage: StorageLike,
  pins: ConversationPins,
): boolean {
  const bounded = Object.fromEntries(
    Object.entries(pins)
      .filter(([sessionId, pinned]) => validSessionId(sessionId) && pinned)
      .slice(0, MAX_PERSISTED_SESSIONS),
  );
  return safeSetStorageItem(
    storage,
    CONVERSATION_PINS_STORAGE_KEY,
    JSON.stringify(bounded),
  );
}

export function loadConversationDrafts(
  storage: StorageLike,
): ConversationDrafts {
  const record = objectValue(
    parseStored(storage, CONVERSATION_DRAFTS_STORAGE_KEY),
  );
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        (entry): entry is [string, string] =>
          validSessionId(entry[0]) &&
          typeof entry[1] === "string" &&
          entry[1].length > 0 &&
          entry[1].length <= MAX_DRAFT_LENGTH,
      )
      .slice(-MAX_PERSISTED_SESSIONS),
  );
}

export function saveConversationDrafts(
  storage: StorageLike,
  drafts: ConversationDrafts,
): boolean {
  const bounded = Object.fromEntries(
    Object.entries(drafts)
      .filter(
        ([sessionId, draft]) =>
          validSessionId(sessionId) &&
          typeof draft === "string" &&
          draft.length > 0 &&
          draft.length <= MAX_DRAFT_LENGTH,
      )
      .slice(-MAX_PERSISTED_SESSIONS),
  );
  return safeSetStorageItem(
    storage,
    CONVERSATION_DRAFTS_STORAGE_KEY,
    JSON.stringify(bounded),
  );
}

export function loadConversationQueue(
  storage: StorageLike,
): PersistedQueuedMessage[] {
  const value = parseStored(storage, CONVERSATION_QUEUE_STORAGE_KEY);
  if (!Array.isArray(value)) return [];
  const queued: PersistedQueuedMessage[] = [];
  for (const candidate of value.slice(-MAX_QUEUE_ITEMS)) {
    const record = objectValue(candidate);
    if (
      !record ||
      !validSessionId(record.id) ||
      !validSessionId(record.sessionId) ||
      (record.projectId !== undefined && !validSessionId(record.projectId)) ||
      typeof record.content !== "string" ||
      !record.content.trim() ||
      record.content.length > MAX_DRAFT_LENGTH ||
      !Array.isArray(record.attachments) ||
      record.attachments.length > MAX_ATTACHMENT_COUNT ||
      !record.attachments.every(validAttachment) ||
      (record.memoryMatch !== undefined &&
        !validMemoryMatch(record.memoryMatch))
    ) {
      continue;
    }
    queued.push({
      id: record.id,
      sessionId: record.sessionId,
      ...(record.projectId ? { projectId: record.projectId } : {}),
      content: record.content,
      attachments: record.attachments,
      ...(record.memoryMatch
        ? { memoryMatch: record.memoryMatch as MemoryMatchSnapshot }
        : {}),
    });
  }
  return queued;
}

export function saveConversationQueue(
  storage: StorageLike,
  queue: readonly PersistedQueuedMessage[],
): boolean {
  return safeSetStorageItem(
    storage,
    CONVERSATION_QUEUE_STORAGE_KEY,
    JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)),
  );
}

export function loadPromptLibrary(storage: StorageLike): PromptLibraryEntry[] {
  const value = parseStored(storage, PROMPT_LIBRARY_STORAGE_KEY);
  if (!Array.isArray(value)) return [];
  const entries: PromptLibraryEntry[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const entry = sanitizePromptLibraryEntry(candidate);
    if (!entry || ids.has(entry.id)) continue;
    ids.add(entry.id);
    entries.push(entry);
    if (entries.length >= MAX_PROMPT_LIBRARY_ITEMS) break;
  }
  return entries;
}

export function savePromptLibrary(
  storage: StorageLike,
  entries: readonly PromptLibraryEntry[],
): boolean {
  const sanitized: PromptLibraryEntry[] = [];
  const ids = new Set<string>();
  for (const candidate of entries) {
    const entry = sanitizePromptLibraryEntry(candidate);
    if (!entry || ids.has(entry.id)) continue;
    ids.add(entry.id);
    sanitized.push(entry);
    if (sanitized.length >= MAX_PROMPT_LIBRARY_ITEMS) break;
  }
  return safeSetStorageItem(
    storage,
    PROMPT_LIBRARY_STORAGE_KEY,
    JSON.stringify(sanitized),
  );
}
