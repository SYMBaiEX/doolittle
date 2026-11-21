import { createHash, subtle } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { readRegularFile } from "@doolittle/storage";
import type { ContentType, Media } from "@elizaos/core";
import { isStrictlyContainedPath } from "../utils/path-containment";
import { hasAsciiControlCharacters } from "../utils/text-validation";

export const MAX_CHAT_ATTACHMENTS = 8;
export const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS_TOTAL_BYTES = 50 * 1024 * 1024;

const MAX_SIDECAR_BYTES = 16 * 1024;
const ATTACHMENT_READ_CONCURRENCY = 2;
const ASYNC_ATTACHMENT_HASH_BYTES = 2 * 1024 * 1024;
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
  signal?: AbortSignal;
}

export interface ResolveManagedAttachmentPathInput {
  dataDir: string;
  attachmentId: string;
  signal?: AbortSignal;
}

export interface ResolvedManagedAttachmentPath {
  descriptor: ManagedAttachmentDescriptor;
  path: string;
}

interface ManagedAttachmentSidecar {
  descriptor: ManagedAttachmentDescriptor;
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
    descriptor: {
      id: requestedId,
      name,
      kind: kind as ManagedAttachmentKind,
      mimeType,
      sizeBytes,
      sha256,
    },
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

async function canonicalAttachmentsRoot(
  dataDir: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    signal?.throwIfAborted();
    const dataRoot = await realpath(dataDir);
    signal?.throwIfAborted();
    const attachmentsRoot = await realpath(join(dataRoot, "attachments"));
    signal?.throwIfAborted();
    if (!isStrictlyContainedPath(dataRoot, attachmentsRoot)) {
      fail("invalid_request", undefined, "storage is unavailable");
    }
    return attachmentsRoot;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ManagedAttachmentError) throw error;
    fail("invalid_request", undefined, "storage is unavailable");
  }
}

async function canonicalContainedFile(
  attachmentsRoot: string,
  candidatePath: string,
  id: string,
  kind: "metadata" | "file",
  signal?: AbortSignal,
): Promise<string> {
  try {
    signal?.throwIfAborted();
    const canonicalPath = await realpath(candidatePath);
    signal?.throwIfAborted();
    if (!isStrictlyContainedPath(attachmentsRoot, canonicalPath)) {
      fail("invalid_metadata", id, `has unsafe ${kind}`);
    }
    const fileStat = await stat(canonicalPath);
    signal?.throwIfAborted();
    if (!fileStat.isFile()) {
      fail("invalid_metadata", id, `has invalid ${kind}`);
    }
    return canonicalPath;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ManagedAttachmentError) throw error;
    fail("not_found", id, "is unavailable");
  }
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

async function readAttachmentSidecar(
  attachmentsRoot: string,
  id: string,
  signal?: AbortSignal,
): Promise<ManagedAttachmentSidecar> {
  const sidecarPath = join(attachmentsRoot, `${id}.meta.json`);
  const canonicalSidecar = await canonicalContainedFile(
    attachmentsRoot,
    sidecarPath,
    id,
    "metadata",
    signal,
  );

  try {
    const bytes = await readRegularFile(canonicalSidecar, MAX_SIDECAR_BYTES, {
      signal,
    });
    signal?.throwIfAborted();
    return parseSidecar(bytes.toString("utf8"), id);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ManagedAttachmentError) throw error;
    fail("invalid_metadata", id, "has invalid metadata");
  }
}

async function readAttachmentPayload(
  attachmentsRoot: string,
  { descriptor, storedName }: ManagedAttachmentSidecar,
  signal?: AbortSignal,
): Promise<{ bytes: Buffer; path: string }> {
  const { id, sizeBytes, sha256 } = descriptor;
  const canonicalFile = await canonicalContainedFile(
    attachmentsRoot,
    join(attachmentsRoot, storedName),
    id,
    "file",
    signal,
  );
  try {
    const bytes = await readRegularFile(canonicalFile, sizeBytes, { signal });
    signal?.throwIfAborted();
    if (bytes.byteLength !== sizeBytes)
      fail("integrity_failed", id, "failed integrity validation");
    // Run larger checksums off the runtime thread without an application worker.
    const digest =
      sizeBytes < ASYNC_ATTACHMENT_HASH_BYTES
        ? createHash("sha256").update(bytes).digest("hex")
        : Buffer.from(await subtle.digest("SHA-256", bytes)).toString("hex");
    signal?.throwIfAborted();
    if (digest !== sha256)
      fail("integrity_failed", id, "failed integrity validation");
    return { bytes, path: canonicalFile };
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ManagedAttachmentError) throw error;
    fail("integrity_failed", id, "failed integrity validation");
  }
}

async function resolveOne(
  attachmentsRoot: string,
  sidecar: ManagedAttachmentSidecar,
  signal?: AbortSignal,
): Promise<ResolvedManagedAttachment> {
  const { descriptor } = sidecar;
  const { id } = descriptor;
  const { bytes } = await readAttachmentPayload(
    attachmentsRoot,
    sidecar,
    signal,
  );
  signal?.throwIfAborted();
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

async function readAttachmentBatches<Input, Output>(
  inputs: readonly Input[],
  read: (input: Input) => Promise<Output>,
): Promise<Output[]> {
  const outputs: Output[] = [];
  for (
    let index = 0;
    index < inputs.length;
    index += ATTACHMENT_READ_CONCURRENCY
  ) {
    // Drain all in-flight descriptors before returning the first failure in
    // request order. Never start the next batch after a failure.
    const batch = await Promise.allSettled(
      inputs.slice(index, index + ATTACHMENT_READ_CONCURRENCY).map(read),
    );
    for (const result of batch) {
      if (result.status === "rejected") throw result.reason;
      outputs.push(result.value);
    }
  }
  return outputs;
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
  const attachmentsRoot = await canonicalAttachmentsRoot(
    input.dataDir,
    input.signal,
  );
  const sidecar = await readAttachmentSidecar(
    attachmentsRoot,
    id,
    input.signal,
  );
  const { path } = await readAttachmentPayload(
    attachmentsRoot,
    sidecar,
    input.signal,
  );
  input.signal?.throwIfAborted();
  return { descriptor: sidecar.descriptor, path };
}

export async function resolveManagedChatAttachments(
  input: ResolveManagedChatAttachmentsInput,
): Promise<ResolvedManagedAttachment[]> {
  const { signal } = input;
  signal?.throwIfAborted();
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

  const attachmentsRoot = await canonicalAttachmentsRoot(input.dataDir, signal);
  const sidecars = await readAttachmentBatches(ids, (id) =>
    readAttachmentSidecar(attachmentsRoot, id, signal),
  );
  signal?.throwIfAborted();
  let totalBytes = 0;
  for (const { descriptor } of sidecars) {
    totalBytes += descriptor.sizeBytes;
    if (totalBytes > MAX_CHAT_ATTACHMENTS_TOTAL_BYTES) {
      fail(
        "limit_exceeded",
        undefined,
        `exceeds the ${MAX_CHAT_ATTACHMENTS_TOTAL_BYTES} byte total limit`,
      );
    }
  }
  const resolved = await readAttachmentBatches(sidecars, (sidecar) =>
    resolveOne(attachmentsRoot, sidecar, signal),
  );
  signal?.throwIfAborted();
  return resolved;
}
