import type { ManagedAttachmentDescriptor } from "../shared/contracts";
import {
  CHAT_CONTEXT_CAPSULE_KINDS,
  type ChatContextCapsule,
  composeChatContextMessage,
  splitChatContext,
} from "./chat-context-handoff";
import type { MemoryMatchSnapshot } from "./memory-matches";
import { type DesktopPlatform, workspacePathsEqual } from "./workspace-path";

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
const MAX_CAPSULE_PATH_LENGTH = 4_096;
const MAX_CAPSULE_SOURCE_LENGTH = 4_096;
const MAX_CAPSULE_CONTENT_LENGTH = 120_000;
const MAX_QUEUE_ITEMS = 50;
const MAX_ATTACHMENT_COUNT = 8;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENT_NAME_LENGTH = 180;
const MAX_ATTACHMENT_MIME_TYPE_LENGTH = 127;
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
export interface ConversationDraft {
  text: string;
  capsule: ChatContextCapsule | null;
  attachments: ManagedAttachmentDescriptor[];
}

export type ConversationDrafts = Record<string, ConversationDraft>;

export interface PersistedQueuedMessage {
  id: string;
  sessionId: string;
  /** Missing only for legacy queue entries, which must be explicitly rebound. */
  workspacePath?: string;
  projectId?: string;
  content: string;
  /** Hidden source context, kept separate from the queue's visible prompt. */
  capsule?: ChatContextCapsule;
  attachments: ManagedAttachmentDescriptor[];
  memoryMatch?: MemoryMatchSnapshot;
}

export type QueuedMessageWorkspaceStatus =
  | "ready"
  | "legacy-unbound"
  | "different-workspace";

/** A queue item is dispatchable only in the workspace captured when it was queued. */
export function queuedMessageWorkspaceStatus(
  message: PersistedQueuedMessage,
  workspacePath: string,
  platform: DesktopPlatform,
): QueuedMessageWorkspaceStatus {
  if (!message.workspacePath) return "legacy-unbound";
  return workspacePathsEqual(message.workspacePath, workspacePath, platform)
    ? "ready"
    : "different-workspace";
}

/** Queue delivery must use the entry's capsule, not the selected chat's. */
export function composeQueuedMessage(message: PersistedQueuedMessage): string {
  return composeChatContextMessage(message.content, message.capsule ?? null);
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
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        record.id,
      ) &&
      typeof record.name === "string" &&
      record.name.length > 0 &&
      record.name.length <= MAX_ATTACHMENT_NAME_LENGTH &&
      !Array.from(record.name).some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code < 32 || code === 127;
      }) &&
      ["audio", "document", "image", "video"].includes(String(record.kind)) &&
      typeof record.mimeType === "string" &&
      record.mimeType.length > 0 &&
      record.mimeType.length <= MAX_ATTACHMENT_MIME_TYPE_LENGTH &&
      /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(
        record.mimeType,
      ) &&
      typeof record.sizeBytes === "number" &&
      Number.isInteger(record.sizeBytes) &&
      record.sizeBytes >= 0 &&
      record.sizeBytes <= MAX_ATTACHMENT_BYTES &&
      typeof record.sha256 === "string" &&
      /^[a-f0-9]{64}$/iu.test(record.sha256),
  );
}

function validAttachments(
  value: unknown,
): value is ManagedAttachmentDescriptor[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ATTACHMENT_COUNT &&
    value.every(validAttachment) &&
    value.reduce((total, attachment) => total + attachment.sizeBytes, 0) <=
      MAX_ATTACHMENTS_TOTAL_BYTES
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

function sanitizeChatContextCapsule(value: unknown): ChatContextCapsule | null {
  const record = objectValue(value);
  if (
    !record ||
    !CHAT_CONTEXT_CAPSULE_KINDS.includes(
      record.kind as ChatContextCapsule["kind"],
    ) ||
    typeof record.path !== "string" ||
    !record.path.trim() ||
    record.path.length > MAX_CAPSULE_PATH_LENGTH ||
    typeof record.content !== "string" ||
    !record.content.trim() ||
    record.content.length > MAX_CAPSULE_CONTENT_LENGTH ||
    (record.source !== undefined &&
      (typeof record.source !== "string" ||
        record.source.length > MAX_CAPSULE_SOURCE_LENGTH))
  ) {
    return null;
  }
  return {
    kind: record.kind as ChatContextCapsule["kind"],
    path: record.path,
    ...(typeof record.source === "string" ? { source: record.source } : {}),
    content: record.content,
  };
}

function sanitizeConversationDraft(value: unknown): ConversationDraft | null {
  // Draft strings are the v1 storage shape. Keep accepting them so existing
  // unsent prompts survive the capsule-aware upgrade.
  if (typeof value === "string") {
    return value.length > 0 && value.length <= MAX_DRAFT_LENGTH
      ? { text: value, capsule: null, attachments: [] }
      : null;
  }
  const record = objectValue(value);
  if (!record || typeof record.text !== "string") return null;
  const capsule =
    record.capsule === undefined || record.capsule === null
      ? null
      : sanitizeChatContextCapsule(record.capsule);
  const attachments =
    record.attachments === undefined ? [] : record.attachments;
  if (
    record.text.length > MAX_DRAFT_LENGTH ||
    (record.capsule !== undefined && record.capsule !== null && !capsule) ||
    !validAttachments(attachments) ||
    (!record.text && !capsule && attachments.length === 0)
  ) {
    return null;
  }
  return { text: record.text, capsule, attachments };
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
      .flatMap(([sessionId, draft]) => {
        const sanitized = sanitizeConversationDraft(draft);
        return validSessionId(sessionId) && sanitized
          ? [[sessionId, sanitized]]
          : [];
      })
      .slice(-MAX_PERSISTED_SESSIONS),
  );
}

export function saveConversationDrafts(
  storage: StorageLike,
  drafts: ConversationDrafts,
): boolean {
  const bounded = Object.fromEntries(
    Object.entries(drafts)
      .map(([sessionId, draft]) => {
        const sanitized = sanitizeConversationDraft(draft);
        if (!validSessionId(sessionId) || !sanitized) return null;
        return [
          sessionId,
          sanitized.capsule || sanitized.attachments.length > 0
            ? sanitized
            : // Preserve the compact legacy representation when no draft metadata is present.
              sanitized.text,
        ];
      })
      .filter((entry): entry is [string, ConversationDraft | string] =>
        Boolean(entry),
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
    const legacyContext =
      record &&
      record.capsule === undefined &&
      typeof record.content === "string"
        ? splitChatContext(record.content)
        : null;
    const capsule =
      record?.capsule === undefined
        ? legacyContext?.capsule
        : sanitizeChatContextCapsule(record.capsule);
    const content = legacyContext?.prompt ?? record?.content;
    if (
      !record ||
      !validSessionId(record.id) ||
      !validSessionId(record.sessionId) ||
      (record.workspacePath !== undefined &&
        (typeof record.workspacePath !== "string" ||
          !record.workspacePath.trim() ||
          record.workspacePath !== record.workspacePath.trim() ||
          record.workspacePath.length > MAX_CAPSULE_PATH_LENGTH)) ||
      (record.projectId !== undefined && !validSessionId(record.projectId)) ||
      typeof content !== "string" ||
      !content.trim() ||
      content.length > MAX_DRAFT_LENGTH ||
      (record.capsule !== undefined && record.capsule !== null && !capsule) ||
      !validAttachments(record.attachments) ||
      (record.memoryMatch !== undefined &&
        !validMemoryMatch(record.memoryMatch))
    ) {
      continue;
    }
    queued.push({
      id: record.id,
      sessionId: record.sessionId,
      ...(typeof record.workspacePath === "string"
        ? { workspacePath: record.workspacePath }
        : {}),
      ...(record.projectId ? { projectId: record.projectId } : {}),
      content,
      ...(capsule ? { capsule } : {}),
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
