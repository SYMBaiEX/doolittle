import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, resolve } from "node:path";
import { isStrictlyContainedPath } from "@/utils/path-containment";

const RECORDING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const AUDIO_MIME_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);
const MAX_METADATA_BYTES = 16 * 1024;
const MAX_RECORDING_BYTES = 20 * 1024 * 1024;

export interface TransientDictationDescriptor {
  id: string;
  name: string;
  kind: "audio";
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ResolvedTransientDictation {
  descriptor: TransientDictationDescriptor;
  path: string;
  sessionDir: string;
}

export class TransientDictationError extends Error {
  constructor(
    public readonly code:
      | "invalid_request"
      | "not_found"
      | "invalid_metadata"
      | "integrity_failed",
    message: string,
  ) {
    super(message);
    this.name = "TransientDictationError";
  }
}

function fail(code: TransientDictationError["code"], message: string): never {
  throw new TransientDictationError(code, message);
}

function validateId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.toLowerCase() ||
    !RECORDING_ID_PATTERN.test(value)
  ) {
    fail(
      "invalid_request",
      "Dictation request contains an invalid recording ID.",
    );
  }
  return value;
}

function resolveImportsRoot(dataDir: string): string | null {
  try {
    const canonicalDataDir = realpathSync(dataDir);
    const requestedRoot = resolve(canonicalDataDir, "transient", "dictation");
    if (!existsSync(requestedRoot)) return null;
    if (lstatSync(requestedRoot).isSymbolicLink()) {
      fail("invalid_metadata", "Transient dictation storage is unsafe.");
    }
    const root = realpathSync(requestedRoot);
    if (!isStrictlyContainedPath(canonicalDataDir, root)) {
      fail("invalid_metadata", "Transient dictation storage is unsafe.");
    }
    return root;
  } catch (error) {
    if (error instanceof TransientDictationError) throw error;
    return null;
  }
}

function parseMetadata(
  raw: string,
  requestedId: string,
): TransientDictationDescriptor & { storedName: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("invalid_metadata", "Dictation metadata is invalid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_metadata", "Dictation metadata is invalid.");
  }
  const metadata = value as Record<string, unknown>;
  const name = metadata.name;
  const mimeType = metadata.mimeType;
  const sizeBytes = metadata.sizeBytes;
  const sha256 = metadata.sha256;
  const storedName = metadata.storedName;
  if (
    metadata.version !== 1 ||
    metadata.id !== requestedId ||
    metadata.kind !== "audio" ||
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > 180 ||
    basename(name) !== name ||
    name.includes("/") ||
    name.includes("\\") ||
    typeof mimeType !== "string" ||
    !AUDIO_MIME_TYPES.has(mimeType) ||
    typeof sizeBytes !== "number" ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > MAX_RECORDING_BYTES ||
    typeof sha256 !== "string" ||
    !SHA256_PATTERN.test(sha256) ||
    typeof storedName !== "string" ||
    basename(storedName) !== storedName ||
    !new RegExp(`^${requestedId}\\.(m4a|mp3|ogg|wav|webm)$`, "u").test(
      storedName,
    )
  ) {
    fail("invalid_metadata", "Dictation metadata is invalid.");
  }
  return {
    id: requestedId,
    name,
    kind: "audio",
    mimeType,
    sizeBytes,
    sha256,
    storedName,
  };
}

function readVerifiedRecording(
  path: string,
  expectedSizeBytes: number,
  expectedSha256: string,
): Buffer {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.size !== expectedSizeBytes ||
      before.size > MAX_RECORDING_BYTES
    ) {
      fail("integrity_failed", "Dictation recording failed integrity checks.");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      bytes.byteLength !== expectedSizeBytes ||
      createHash("sha256").update(bytes).digest("hex") !== expectedSha256
    ) {
      fail("integrity_failed", "Dictation recording failed integrity checks.");
    }
    return bytes;
  } catch (error) {
    if (error instanceof TransientDictationError) throw error;
    return fail(
      "integrity_failed",
      "Dictation recording failed integrity checks.",
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function resolveTransientDictation(
  dataDir: string,
  recordingId: unknown,
): ResolvedTransientDictation | null {
  const id = validateId(recordingId);
  const root = resolveImportsRoot(dataDir);
  if (!root) return null;

  const requestedSessionDir = resolve(root, id);
  if (!existsSync(requestedSessionDir)) return null;
  try {
    if (lstatSync(requestedSessionDir).isSymbolicLink()) {
      fail("invalid_metadata", "Dictation import is unsafe.");
    }
    const sessionDir = realpathSync(requestedSessionDir);
    if (!isStrictlyContainedPath(root, sessionDir)) {
      fail("invalid_metadata", "Dictation import is unsafe.");
    }
    if (!statSync(sessionDir).isDirectory()) {
      fail("invalid_metadata", "Dictation import is invalid.");
    }

    const requestedMetadataPath = resolve(sessionDir, `${id}.meta.json`);
    if (
      !existsSync(requestedMetadataPath) ||
      lstatSync(requestedMetadataPath).isSymbolicLink()
    ) {
      fail("not_found", "Dictation metadata is unavailable.");
    }
    const metadataPath = realpathSync(requestedMetadataPath);
    if (!isStrictlyContainedPath(sessionDir, metadataPath)) {
      fail("invalid_metadata", "Dictation metadata is unsafe.");
    }
    if (statSync(metadataPath).size > MAX_METADATA_BYTES) {
      fail("invalid_metadata", "Dictation metadata is invalid.");
    }
    const metadata = parseMetadata(readFileSync(metadataPath, "utf8"), id);

    const requestedRecordingPath = resolve(sessionDir, metadata.storedName);
    if (
      !existsSync(requestedRecordingPath) ||
      lstatSync(requestedRecordingPath).isSymbolicLink()
    ) {
      fail("not_found", "Dictation recording is unavailable.");
    }
    const path = realpathSync(requestedRecordingPath);
    if (
      !isStrictlyContainedPath(sessionDir, path) ||
      !statSync(path).isFile()
    ) {
      fail("invalid_metadata", "Dictation recording is unsafe.");
    }
    readVerifiedRecording(path, metadata.sizeBytes, metadata.sha256);

    const { storedName: _storedName, ...descriptor } = metadata;
    return { descriptor, path, sessionDir };
  } catch (error) {
    if (error instanceof TransientDictationError) throw error;
    fail("not_found", "Dictation recording is unavailable.");
  }
}

export function removeTransientDictation(
  dataDir: string,
  recording: ResolvedTransientDictation,
): void {
  const root = resolveImportsRoot(dataDir);
  if (!root) return;
  const requestedSessionDir = resolve(root, recording.descriptor.id);
  if (requestedSessionDir !== recording.sessionDir) {
    fail("invalid_metadata", "Dictation cleanup target is unsafe.");
  }
  removeTransientDictationById(dataDir, recording.descriptor.id);
}

export function removeTransientDictationById(
  dataDir: string,
  recordingId: unknown,
): void {
  const id = validateId(recordingId);
  const root = resolveImportsRoot(dataDir);
  if (!root) return;
  const requestedSessionDir = resolve(root, id);
  if (!existsSync(requestedSessionDir)) return;
  const tombstone = resolve(root, `.deleting-${randomUUID()}`);
  try {
    // Moving the directory entry before deletion makes a symlink swap safe:
    // rm unlinks the moved link and never traverses its external target.
    renameSync(requestedSessionDir, tombstone);
    rmSync(tombstone, { recursive: true, force: true });
  } catch (error) {
    rmSync(tombstone, { recursive: true, force: true });
    if (existsSync(requestedSessionDir)) throw error;
  }
}

export function createTransientDictationOutputDir(
  recording: ResolvedTransientDictation,
): string {
  const requestedOutputDir = resolve(recording.sessionDir, "artifacts");
  try {
    mkdirSync(requestedOutputDir, { mode: 0o700 });
    if (lstatSync(requestedOutputDir).isSymbolicLink()) {
      fail("invalid_metadata", "Dictation artifact storage is unsafe.");
    }
    const outputDir = realpathSync(requestedOutputDir);
    if (!isStrictlyContainedPath(recording.sessionDir, outputDir)) {
      fail("invalid_metadata", "Dictation artifact storage is unsafe.");
    }
    return outputDir;
  } catch (error) {
    if (error instanceof TransientDictationError) throw error;
    fail("invalid_metadata", "Dictation artifact storage is unavailable.");
  }
}

/**
 * Copies a recording from an already-open, non-symlinked descriptor into the
 * caller-owned transient output directory.  The path returned here is the
 * only dictation input that may be handed to a transcription provider: the
 * original import is deliberately never used after its initial validation.
 */
export function materializeTransientDictationInput(
  recording: ResolvedTransientDictation,
  outputDir: string,
): string {
  try {
    const bytes = readVerifiedRecording(
      recording.path,
      recording.descriptor.sizeBytes,
      recording.descriptor.sha256,
    );

    const stagedPath = resolve(
      outputDir,
      `.input-${randomUUID()}${extname(recording.path)}`,
    );
    if (!isStrictlyContainedPath(outputDir, stagedPath)) {
      fail("invalid_metadata", "Dictation input storage is unsafe.");
    }
    const stagedDescriptor = openSync(
      stagedPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      writeFileSync(stagedDescriptor, bytes);
    } finally {
      closeSync(stagedDescriptor);
    }
    if (lstatSync(stagedPath).isSymbolicLink()) {
      fail("invalid_metadata", "Dictation input storage is unsafe.");
    }
    return stagedPath;
  } catch (error) {
    if (error instanceof TransientDictationError) throw error;
    return fail(
      "integrity_failed",
      "Dictation recording failed integrity checks.",
    );
  }
}
