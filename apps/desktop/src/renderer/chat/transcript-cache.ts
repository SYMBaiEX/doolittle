import {
  type StorageLike,
  safeSetStorageItem,
} from "../conversation-persistence";
import type { ConversationStore, DisplayMessage } from "./models";

const CHAT_STORAGE_KEY = "doolittle.desktop.conversations.v2";
const MAX_CHAT_STORAGE_CHARS = 3_500_000;
const MAX_PERSISTED_MESSAGES_PER_SESSION = 500;
const MAX_PERSISTED_MESSAGE_CONTENT = 120_000;
const CACHE_WRITE_INTERVAL_MS = 200;

interface EncodedSession {
  messages: readonly DisplayMessage[];
  entry: string;
  compact: boolean;
}

function encodeSession(
  sessionId: string,
  messages: readonly DisplayMessage[],
  maxMessages: number,
  maxContent: number,
): string {
  const bounded = messages.slice(-maxMessages).map((message) =>
    message.content.length <= maxContent
      ? message
      : {
          ...message,
          content: `${message.content.slice(0, maxContent)}\n\n[Local transcript cache truncated]`,
        },
  );
  return `${JSON.stringify(sessionId)}:${JSON.stringify(bounded)}`;
}

/** Persist a bounded, best-effort local cache of the server transcript. */
export function saveStoredChatMessages(
  storage: StorageLike,
  messages: ConversationStore,
  protectedSessionId?: string,
): boolean {
  return writeTranscriptCache(storage, messages, protectedSessionId);
}

function writeTranscriptCache(
  storage: StorageLike,
  messages: ConversationStore,
  protectedSessionId?: string,
  previous?: Map<string, EncodedSession>,
): boolean {
  try {
    const entries = Object.entries(messages).sort(([, left], [, right]) =>
      (right.at(-1)?.createdAt ?? "").localeCompare(
        left.at(-1)?.createdAt ?? "",
      ),
    );
    if (protectedSessionId) {
      const index = entries.findIndex(([id]) => id === protectedSessionId);
      if (index > 0) entries.unshift(...entries.splice(index, 1));
    }
    const encoded: string[] = [];
    // Retain only encodings that fit in the bounded snapshot. A long rejected
    // transcript must not create a second retained copy of its content.
    const included = previous && new Map<string, EncodedSession>();
    let chars = 2; // Outer JSON braces.
    const append = (entry: string): boolean => {
      const nextChars = chars + entry.length + (encoded.length ? 1 : 0);
      if (nextChars > MAX_CHAT_STORAGE_CHARS) return false;
      encoded.push(entry);
      chars = nextChars;
      return true;
    };
    for (const [sessionId, sessionMessages] of entries) {
      // Older caches built the snapshot in a plain object and omitted this key.
      if (sessionId === "__proto__") continue;
      const cached = previous?.get(sessionId);
      const reuse = cached?.messages === sessionMessages;
      // A compact entry only exists when the full protected transcript could
      // not fit even by itself. It can never fit as an unprotected entry.
      if (reuse && cached.compact && sessionId !== protectedSessionId) continue;
      let compact = Boolean(reuse && cached.compact);
      let entry = reuse
        ? cached.entry
        : encodeSession(
            sessionId,
            sessionMessages,
            MAX_PERSISTED_MESSAGES_PER_SESSION,
            MAX_PERSISTED_MESSAGE_CONTENT,
          );
      let accepted = append(entry);
      if (!accepted && !compact && sessionId === protectedSessionId) {
        entry = encodeSession(sessionId, sessionMessages, 50, 32_000);
        compact = true;
        accepted = append(entry);
      }
      if (accepted) {
        included?.set(sessionId, { messages: sessionMessages, entry, compact });
      }
    }
    const saved = safeSetStorageItem(
      storage,
      CHAT_STORAGE_KEY,
      `{${encoded.join(",")}}`,
    );
    // Swap only after serialization so a transient exception cannot replace
    // the last complete encoding cache with partially built data.
    if (previous && included) {
      previous.clear();
      for (const [id, session] of included) previous.set(id, session);
    }
    return saved;
  } catch {
    return false;
  }
}

/** Coalesce animation-frame updates while keeping the cache current during a long stream. */
export function createTranscriptCacheWriter(
  storage: StorageLike,
  onWrite: (saved: boolean) => void,
) {
  const previous = new Map<string, EncodedSession>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending:
    | { messages: ConversationStore; protectedSessionId?: string }
    | undefined;
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    const { messages, protectedSessionId } = pending;
    pending = undefined;
    onWrite(
      writeTranscriptCache(storage, messages, protectedSessionId, previous),
    );
  };
  return {
    schedule(messages: ConversationStore, protectedSessionId?: string) {
      pending = { messages, protectedSessionId };
      timer ??= setTimeout(flush, CACHE_WRITE_INTERVAL_MS);
    },
    flush,
  };
}

function isStoredDisplayMessage(value: unknown): value is DisplayMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const message = value as Partial<DisplayMessage>;
  const capsule = message.contextCapsule;
  const validCapsule =
    capsule === undefined ||
    (Boolean(capsule) &&
      typeof capsule === "object" &&
      (capsule.kind === "file" ||
        capsule.kind === "diff" ||
        capsule.kind === "review" ||
        capsule.kind === "brief" ||
        capsule.kind === "terminal" ||
        capsule.kind === "plan" ||
        capsule.kind === "browser") &&
      typeof capsule.path === "string" &&
      (capsule.source === undefined || typeof capsule.source === "string"));
  return (
    typeof message.id === "string" &&
    message.id.length > 0 &&
    (message.runId === undefined || typeof message.runId === "string") &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    typeof message.createdAt === "string" &&
    (message.replayGap === undefined || message.replayGap === true) &&
    validCapsule
  );
}

export function loadStoredChatMessages(
  storage: StorageLike,
): ConversationStore {
  try {
    const value = storage.getItem(CHAT_STORAGE_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([sessionId, messages]) => [
        sessionId,
        Array.isArray(messages) ? messages.filter(isStoredDisplayMessage) : [],
      ]),
    ) as ConversationStore;
  } catch {
    return {};
  }
}
