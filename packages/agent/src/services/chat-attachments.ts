import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import type { ContentType, Media } from "@elizaos/core";
import { hasAsciiControlCharacters } from "@/utils/text-validation";

export const MAX_CHAT_ATTACHMENTS = 8;
export const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS_TOTAL_BYTES = 50 * 1024 * 1024;

const MAX_SIDECAR_BYTES = 16 * 1024;
const MAX_ATTACHMENT_TEXT_BYTES = 256 * 1024;
const MAX_ATTACHMENT_NAME_LENGTH = 180;
const MAX_MIME_TYPE_LENGTH = 127;
const ATTACHMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MIME_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const ATTACHMENT_KINDS = new Set<ManagedAttachmentKind>([
  "image",
  "video",
  "audio",
  "document",
]);

export type ManagedAttachmentKind = Exclude<ContentType, "link">;

export interface ManagedAttachmentDescriptor {
  id: string;
  name: string;
  kind: ManagedAttachmentKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ResolvedManagedAttachment {
  descriptor: ManagedAttachmentDescriptor;
  media: ManagedElizaMedia;
}

export type ManagedElizaMedia = Media & {
  _data: string;
  _mimeType: string;
};

export interface ResolveManagedChatAttachmentsInput {
  dataDir: string;
  attachmentIds: readonly string[];
}

export interface ResolveManagedAttachmentPathInput {
  dataDir: string;
  attachmentId: string;
}

export interface ResolvedManagedAttachmentPath {
  descriptor: ManagedAttachmentDescriptor;
  path: string;
}

interface ManagedAttachmentSidecar extends ManagedAttachmentDescriptor {
  version: 1;
  sha256: string;
  storedName: string;
}

export type ManagedAttachmentErrorCode =
  | "invalid_request"
  | "not_found"
  | "invalid_metadata"
  | "integrity_failed"
  | "limit_exceeded";

export class ManagedAttachmentError extends Error {
  constructor(
    public readonly code: ManagedAttachmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ManagedAttachmentError";
  }
}

function fail(
  code: ManagedAttachmentErrorCode,
  id: string | undefined,
  reason: string,
): never {
  const attachmentLabel = id ? `Attachment ${id}` : "Attachment request";
  throw new ManagedAttachmentError(code, `${attachmentLabel} ${reason}.`);
}

function isContainedPath(root: string, candidate: string): boolean {
  const nestedPath = relative(root, candidate);
  return (
    nestedPath !== "" &&
    nestedPath !== ".." &&
    !nestedPath.startsWith(`..${sep}`) &&
    !isAbsolute(nestedPath)
  );
}

function parseSidecar(
  raw: string,
  requestedId: string,
): ManagedAttachmentSidecar {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("invalid_metadata", requestedId, "has invalid metadata");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_metadata", requestedId, "has invalid metadata");
  }

  const metadata = value as Record<string, unknown>;
  const id = metadata.id;
  const name = metadata.name;
  const kind = metadata.kind;
  const mimeType = metadata.mimeType;
  const sizeBytes = metadata.sizeBytes;
  const sha256 = metadata.sha256;
  const storedName = metadata.storedName;

  if (
    metadata.version !== 1 ||
    id !== requestedId ||
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > MAX_ATTACHMENT_NAME_LENGTH ||
    basename(name) !== name ||
    name.includes("/") ||
    name.includes("\\") ||
    hasAsciiControlCharacters(name) ||
    typeof kind !== "string" ||
    !ATTACHMENT_KINDS.has(kind as ManagedAttachmentKind) ||
    typeof mimeType !== "string" ||
    mimeType.length === 0 ||
    mimeType.length > MAX_MIME_TYPE_LENGTH ||
    !MIME_TYPE_PATTERN.test(mimeType) ||
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 0 ||
    sizeBytes > MAX_CHAT_ATTACHMENT_BYTES ||
    typeof sha256 !== "string" ||
    !SHA256_PATTERN.test(sha256) ||
    typeof storedName !== "string" ||
    basename(storedName) !== storedName ||
    storedName.includes("/") ||
    storedName.includes("\\") ||
    !storedName.startsWith(`${requestedId}.`) ||
    !new RegExp(`^${requestedId}\\.[a-z0-9]{1,10}$`, "u").test(storedName)
  ) {
    fail("invalid_metadata", requestedId, "has invalid metadata");
  }

  return {
    version: 1,
    id: requestedId,
    name,
    kind: kind as ManagedAttachmentKind,
    mimeType,
    sizeBytes,
    sha256,
    storedName,
  };
}

function attachmentText(
  metadata: ManagedAttachmentDescriptor,
  bytes: Buffer,
): string | undefined {
  if (
    metadata.kind === "document" &&
    (metadata.mimeType.startsWith("text/") ||
      metadata.mimeType === "application/json")
  ) {
    const truncated = bytes.byteLength > MAX_ATTACHMENT_TEXT_BYTES;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.subarray(0, MAX_ATTACHMENT_TEXT_BYTES),
    );
    return truncated ? `${text}\n\n[Attachment text truncated]` : text;
  }
  if (metadata.kind === "image") return undefined;
  return `[Attached ${metadata.kind}: ${metadata.name} (${metadata.mimeType})]`;
}

function canonicalAttachmentsRoot(dataDir: string): string {
  try {
    const dataRoot = realpathSync(dataDir);
    const attachmentsRoot = realpathSync(join(dataRoot, "attachments"));
    if (!isContainedPath(dataRoot, attachmentsRoot)) {
      fail("invalid_request", undefined, "storage is unavailable");
    }
    return attachmentsRoot;
  } catch (error) {
    if (error instanceof ManagedAttachmentError) throw error;
    fail("invalid_request", undefined, "storage is unavailable");
  }
}

function canonicalContainedFile(
  attachmentsRoot: string,
  candidatePath: string,
  id: string,
  kind: "metadata" | "file",
): string {
  try {
    const canonicalPath = realpathSync(candidatePath);
    if (!isContainedPath(attachmentsRoot, canonicalPath)) {
      fail("invalid_metadata", id, `has unsafe ${kind}`);
    }
    const fileStat = statSync(canonicalPath);
    if (!fileStat.isFile()) {
      fail("invalid_metadata", id, `has invalid ${kind}`);
    }
    return canonicalPath;
  } catch (error) {
    if (error instanceof ManagedAttachmentError) throw error;
    fail("not_found", id, "is unavailable");
  }
}

interface ValidatedManagedAttachment {
  descriptor: ManagedAttachmentDescriptor;
  bytes: Buffer;
  path: string;
}

function validateAttachmentId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.toLowerCase() ||
    !ATTACHMENT_ID_PATTERN.test(value)
  ) {
    fail("invalid_request", undefined, "contains an invalid attachment ID");
  }
  return value;
}

function validateOne(
  attachmentsRoot: string,
  id: string,
): ValidatedManagedAttachment {
  const sidecarPath = join(attachmentsRoot, `${id}.meta.json`);
  const canonicalSidecar = canonicalContainedFile(
    attachmentsRoot,
    sidecarPath,
    id,
    "metadata",
  );

  let metadata: ManagedAttachmentSidecar;
  try {
    if (lstatSync(canonicalSidecar).size > MAX_SIDECAR_BYTES) {
      fail("invalid_metadata", id, "has invalid metadata");
    }
    metadata = parseSidecar(readFileSync(canonicalSidecar, "utf8"), id);
  } catch (error) {
    if (error instanceof ManagedAttachmentError) throw error;
    fail("invalid_metadata", id, "has invalid metadata");
  }

  const canonicalFile = canonicalContainedFile(
    attachmentsRoot,
    join(attachmentsRoot, metadata.storedName),
    id,
    "file",
  );
  let bytes: Buffer;
  try {
    const fileStat = statSync(canonicalFile);
    bytes = readFileSync(canonicalFile);
    if (
      fileStat.size !== metadata.sizeBytes ||
      bytes.byteLength !== metadata.sizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !== metadata.sha256
    ) {
      fail("integrity_failed", id, "failed integrity validation");
    }
  } catch (error) {
    if (error instanceof ManagedAttachmentError) throw error;
    fail("integrity_failed", id, "failed integrity validation");
  }

  const descriptor: ManagedAttachmentDescriptor = {
    id,
    name: metadata.name,
    kind: metadata.kind,
    mimeType: metadata.mimeType,
    sizeBytes: metadata.sizeBytes,
    sha256: metadata.sha256,
  };

  return {
    descriptor,
    bytes,
    path: canonicalFile,
  };
}

async function resolveOne(
  attachmentsRoot: string,
  id: string,
): Promise<ResolvedManagedAttachment> {
  const { bytes, descriptor } = validateOne(attachmentsRoot, id);
  return {
    descriptor,
    media: {
      id,
      url: `attachment://${id}`,
      title: descriptor.name,
      source: "desktop",
      contentType: descriptor.kind,
      text: attachmentText(descriptor, bytes),
      _data: bytes.toString("base64"),
      _mimeType: descriptor.mimeType,
    },
  };
}

/**
 * Resolves one managed attachment to its canonical on-disk path for trusted
 * server-side consumers. The path is returned only after the sidecar,
 * containment, size, and SHA-256 checks used by chat attachment resolution.
 */
export async function resolveManagedAttachmentPath(
  input: ResolveManagedAttachmentPathInput,
): Promise<ResolvedManagedAttachmentPath> {
  const id = validateAttachmentId(input.attachmentId);
  const attachmentsRoot = canonicalAttachmentsRoot(input.dataDir);
  const { descriptor, path } = validateOne(attachmentsRoot, id);
  return { descriptor, path };
}

export async function resolveManagedChatAttachments(
  input: ResolveManagedChatAttachmentsInput,
): Promise<ResolvedManagedAttachment[]> {
  if (!Array.isArray(input.attachmentIds)) {
    fail("invalid_request", undefined, "must provide attachment IDs");
  }
  if (input.attachmentIds.length > MAX_CHAT_ATTACHMENTS) {
    fail(
      "limit_exceeded",
      undefined,
      `exceeds the ${MAX_CHAT_ATTACHMENTS} file limit`,
    );
  }
  if (input.attachmentIds.length === 0) return [];

  const ids = input.attachmentIds.map(validateAttachmentId);
  if (new Set(ids).size !== ids.length) {
    fail("invalid_request", undefined, "contains duplicate attachment IDs");
  }

  const attachmentsRoot = canonicalAttachmentsRoot(input.dataDir);
  const resolved: ResolvedManagedAttachment[] = [];
  let totalBytes = 0;
  for (const id of ids) {
    const attachment = await resolveOne(attachmentsRoot, id);
    totalBytes += attachment.descriptor.sizeBytes;
    if (totalBytes > MAX_CHAT_ATTACHMENTS_TOTAL_BYTES) {
      fail(
        "limit_exceeded",
        undefined,
        `exceeds the ${MAX_CHAT_ATTACHMENTS_TOTAL_BYTES} byte total limit`,
      );
    }
    resolved.push(attachment);
  }
  return resolved;
}
