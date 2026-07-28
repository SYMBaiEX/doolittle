import { posix, win32 } from "node:path";
import type { StoredMessageAttachment } from "@/types";
import {
  DOOLITTLE_SESSION_ARCHIVE_SCHEMA,
  DOOLITTLE_SESSION_ARCHIVE_VERSION,
  type DoolittleSessionArchiveMessageV1,
  type DoolittleSessionArchiveV1,
  MAX_SESSION_ARCHIVE_BYTES,
  MAX_SESSION_ARCHIVE_MESSAGES,
  type SessionArchivePreview,
  SessionTransferError,
} from "./types";

const MAX_ARCHIVE_DEPTH = 12;
const MAX_ATTACHMENTS_PER_MESSAGE = 16;
const MAX_TOTAL_ATTACHMENTS = 128;
const MAX_MESSAGE_TEXT_LENGTH = 200_000;

export function validateSessionArchive(input: unknown): {
  archive: DoolittleSessionArchiveV1;
  preview: SessionArchivePreview;
} {
  const serializedBytes = serializedSize(input);
  assertDepth(input, 0);
  const root = record(input, "archive");
  assertKeys(root, "archive", [
    "schema",
    "version",
    "manifest",
    "source",
    "session",
    "messages",
  ]);
  if (root.schema !== DOOLITTLE_SESSION_ARCHIVE_SCHEMA) {
    throw invalid("Archive schema is not supported.");
  }
  if (root.version !== DOOLITTLE_SESSION_ARCHIVE_VERSION) {
    throw new SessionTransferError(
      "unsupported_version",
      `Archive version "${String(root.version)}" is not supported.`,
    );
  }

  const manifest = record(root.manifest, "manifest");
  const source = record(root.source, "source");
  const session = record(root.session, "session");
  assertKeys(manifest, "manifest", [
    "exportedAt",
    "messageCount",
    "attachmentCount",
    "omissions",
  ]);
  assertKeys(source, "source", ["application", "sessionId", "rootSessionId"]);
  assertKeys(session, "session", [
    "title",
    "continuityKey",
    "parentSessionId",
    "forkedFromMessageId",
    "projectLabel",
  ]);
  if (!Array.isArray(root.messages)) {
    throw invalid("messages must be an array.");
  }
  if (
    root.messages.length === 0 ||
    root.messages.length > MAX_SESSION_ARCHIVE_MESSAGES
  ) {
    throw new SessionTransferError(
      "session_too_large",
      `Archive messages must contain between 1 and ${MAX_SESSION_ARCHIVE_MESSAGES} entries.`,
    );
  }

  const ids = new Set<string>();
  const attachmentIds = new Set<string>();
  let attachmentCount = 0;
  const messages = root.messages.map((value, index) => {
    const message = validateMessage(value, index);
    if (ids.has(message.id)) {
      throw invalid(`messages[${index}].id is duplicated.`);
    }
    ids.add(message.id);
    attachmentCount += message.attachments?.length ?? 0;
    for (const attachment of message.attachments ?? []) {
      if (attachmentIds.has(attachment.id)) {
        throw invalid(`Attachment id "${attachment.id}" is duplicated.`);
      }
      attachmentIds.add(attachment.id);
    }
    if (attachmentCount > MAX_TOTAL_ATTACHMENTS) {
      throw invalid(
        `Archive exceeds the ${MAX_TOTAL_ATTACHMENTS}-attachment limit.`,
      );
    }
    return message;
  });
  for (let index = 1; index < messages.length; index += 1) {
    if (
      (messages[index]?.createdAt ?? "") <
      (messages[index - 1]?.createdAt ?? "")
    ) {
      throw invalid("messages must be ordered by createdAt.");
    }
  }

  const messageCount = integer(manifest.messageCount, "manifest.messageCount");
  const declaredAttachmentCount = integer(
    manifest.attachmentCount,
    "manifest.attachmentCount",
  );
  if (messageCount !== messages.length) {
    throw invalid("manifest.messageCount does not match messages.");
  }
  if (declaredAttachmentCount !== attachmentCount) {
    throw invalid(
      "manifest.attachmentCount does not match message attachments.",
    );
  }

  const omissions = stringArray(
    manifest.omissions,
    "manifest.omissions",
    20,
    240,
  );
  const archive: DoolittleSessionArchiveV1 = {
    schema: DOOLITTLE_SESSION_ARCHIVE_SCHEMA,
    version: DOOLITTLE_SESSION_ARCHIVE_VERSION,
    manifest: {
      exportedAt: isoDate(manifest.exportedAt, "manifest.exportedAt"),
      messageCount,
      attachmentCount,
      omissions,
    },
    source: {
      application: stringValue(source.application, "source.application", 80),
      sessionId: stringValue(source.sessionId, "source.sessionId", 256),
      rootSessionId: optionalString(
        source.rootSessionId,
        "source.rootSessionId",
        256,
      ),
    },
    session: {
      title: optionalString(session.title, "session.title", 200),
      continuityKey: optionalString(
        session.continuityKey,
        "session.continuityKey",
        256,
      ),
      parentSessionId: optionalString(
        session.parentSessionId,
        "session.parentSessionId",
        256,
      ),
      forkedFromMessageId: optionalString(
        session.forkedFromMessageId,
        "session.forkedFromMessageId",
        256,
      ),
      projectLabel: optionalString(
        session.projectLabel,
        "session.projectLabel",
        200,
      ),
    },
    messages,
  };

  return {
    archive,
    preview: {
      schema: archive.schema,
      version: archive.version,
      serializedBytes,
      sourceApplication: archive.source.application,
      sourceSessionId: archive.source.sessionId,
      title: archive.session.title,
      projectLabel: archive.session.projectLabel,
      messageCount,
      attachmentCount,
      startedAt: messages[0]?.createdAt ?? archive.manifest.exportedAt,
      endedAt: messages.at(-1)?.createdAt ?? archive.manifest.exportedAt,
      omissionNotices: omissions,
    },
  };
}

function validateMessage(
  input: unknown,
  index: number,
): DoolittleSessionArchiveMessageV1 {
  const message = record(input, `messages[${index}]`);
  assertKeys(message, `messages[${index}]`, [
    "id",
    "originMessageId",
    "role",
    "text",
    "attachments",
    "createdAt",
  ]);
  if (message.role === "system") {
    throw invalid(
      `messages[${index}].role cannot be system in a V1 import archive.`,
    );
  }
  if (message.role !== "user" && message.role !== "assistant") {
    throw invalid(`messages[${index}].role is invalid.`);
  }
  const attachments =
    message.attachments === undefined
      ? undefined
      : validateAttachments(message.attachments, index);
  return {
    id: stringValue(message.id, `messages[${index}].id`, 256),
    originMessageId: optionalString(
      message.originMessageId,
      `messages[${index}].originMessageId`,
      256,
    ),
    role: message.role,
    text: stringValue(
      message.text,
      `messages[${index}].text`,
      MAX_MESSAGE_TEXT_LENGTH,
      true,
    ),
    attachments,
    createdAt: isoDate(message.createdAt, `messages[${index}].createdAt`),
  };
}

function validateAttachments(
  input: unknown,
  messageIndex: number,
): StoredMessageAttachment[] {
  if (!Array.isArray(input) || input.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw invalid(
      `messages[${messageIndex}].attachments exceeds the ${MAX_ATTACHMENTS_PER_MESSAGE}-item limit.`,
    );
  }
  return input.map((value, attachmentIndex) => {
    const path = `messages[${messageIndex}].attachments[${attachmentIndex}]`;
    const attachment = record(value, path);
    assertKeys(attachment, path, [
      "id",
      "name",
      "kind",
      "mimeType",
      "sizeBytes",
      "sha256",
    ]);
    const name = stringValue(attachment.name, `${path}.name`, 255);
    if (
      posix.isAbsolute(name) ||
      win32.isAbsolute(name) ||
      name.includes("/") ||
      name.includes("\\")
    ) {
      throw invalid(`${path}.name must be a filename, not a path.`);
    }
    const kind = attachment.kind;
    if (
      kind !== "audio" &&
      kind !== "document" &&
      kind !== "image" &&
      kind !== "video"
    ) {
      throw invalid(`${path}.kind is invalid.`);
    }
    const sha256 = stringValue(attachment.sha256, `${path}.sha256`, 64);
    if (!/^[a-fA-F0-9]{64}$/.test(sha256)) {
      throw invalid(`${path}.sha256 is invalid.`);
    }
    const sizeBytes = integer(attachment.sizeBytes, `${path}.sizeBytes`);
    if (sizeBytes < 0) throw invalid(`${path}.sizeBytes cannot be negative.`);
    return {
      id: stringValue(attachment.id, `${path}.id`, 256),
      name,
      kind,
      mimeType: stringValue(attachment.mimeType, `${path}.mimeType`, 120),
      sizeBytes,
      sha256: sha256.toLowerCase(),
    };
  });
}

function serializedSize(value: unknown): number {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw invalid("Archive must be JSON serializable.");
  }
  if (serialized === undefined) throw invalid("Archive is missing.");
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > MAX_SESSION_ARCHIVE_BYTES) {
    throw new SessionTransferError(
      "archive_too_large",
      `Archive exceeds the ${MAX_SESSION_ARCHIVE_BYTES}-byte limit.`,
    );
  }
  return bytes;
}

function assertDepth(value: unknown, depth: number): void {
  if (depth > MAX_ARCHIVE_DEPTH) {
    throw invalid(`Archive nesting exceeds ${MAX_ARCHIVE_DEPTH} levels.`);
  }
  if (!value || typeof value !== "object") return;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    assertDepth(child, depth + 1);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: string[],
): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpected) {
    throw invalid(`${path}.${unexpected} is not allowed.`);
  }
}

function stringValue(
  value: unknown,
  path: string,
  maxLength: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > maxLength ||
    value.includes("\0")
  ) {
    throw invalid(`${path} is invalid.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  path: string,
  maxLength: number,
): string | undefined {
  return value === undefined ? undefined : stringValue(value, path, maxLength);
}

function integer(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalid(`${path} must be a non-negative integer.`);
  }
  return value as number;
}

function isoDate(value: unknown, path: string): string {
  const text = stringValue(value, path, 40);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw invalid(`${path} must be an ISO timestamp.`);
  }
  return text;
}

function stringArray(
  value: unknown,
  path: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw invalid(`${path} is invalid.`);
  }
  return value.map((entry, index) =>
    stringValue(entry, `${path}[${index}]`, maxLength),
  );
}

function invalid(message: string): SessionTransferError {
  return new SessionTransferError("invalid_archive", message);
}
