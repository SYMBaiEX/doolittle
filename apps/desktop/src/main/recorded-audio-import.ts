import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  opendirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { hasFilenameControlCharacters } from "./ipc/input-validation";

export const RECORDED_AUDIO_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const RECORDED_AUDIO_IMPORT_PRUNE_LIMIT = 256;

const RECORDED_AUDIO_IMPORTS_DIRECTORY = "dictation";
const TRANSIENT_DIRECTORY = "transient";
const RECORDING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const MAX_RECORDED_AUDIO_NAME_BYTES = 180;
const AUDIO_EXTENSION_BY_MIME = {
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
} as const;

export type SupportedRecordedAudioMime = keyof typeof AUDIO_EXTENSION_BY_MIME;

export interface RecordedAudioImportInput {
  bytes: ArrayBuffer | Uint8Array;
  mimeType: string;
  name: string;
}

export interface RecordedAudioDescriptor {
  id: string;
  name: string;
  kind: "audio";
  mimeType: SupportedRecordedAudioMime;
  sizeBytes: number;
  sha256: string;
}

interface RecordedAudioMetadata extends RecordedAudioDescriptor {
  version: 1;
  storedName: string;
  createdAt: string;
}

export type RecordedAudioImportErrorCode =
  | "invalid_audio"
  | "invalid_name"
  | "unsupported_audio"
  | "audio_too_large"
  | "import_failed";

export class RecordedAudioImportError extends Error {
  constructor(
    public readonly code: RecordedAudioImportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RecordedAudioImportError";
  }
}

function validateName(value: string): string {
  const name = typeof value === "string" ? value.normalize("NFC") : "";
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    basename(name) !== name ||
    name.includes("/") ||
    name.includes("\\") ||
    hasFilenameControlCharacters(name) ||
    Buffer.byteLength(name, "utf8") > MAX_RECORDED_AUDIO_NAME_BYTES
  ) {
    throw new RecordedAudioImportError(
      "invalid_name",
      `Recording name must be a printable filename of at most ${MAX_RECORDED_AUDIO_NAME_BYTES} bytes.`,
    );
  }
  return name;
}

function validateMime(value: string): SupportedRecordedAudioMime {
  if (
    typeof value !== "string" ||
    !Object.hasOwn(AUDIO_EXTENSION_BY_MIME, value)
  ) {
    throw new RecordedAudioImportError(
      "unsupported_audio",
      "Recording MIME type is not supported.",
    );
  }
  return value as SupportedRecordedAudioMime;
}

function copyBytes(value: ArrayBuffer | Uint8Array): Buffer {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (
    value instanceof ArrayBuffer ||
    Object.prototype.toString.call(value) === "[object ArrayBuffer]"
  ) {
    return Buffer.from(new Uint8Array(value as ArrayBuffer));
  }
  throw new RecordedAudioImportError(
    "invalid_audio",
    "Recording bytes are invalid.",
  );
}

function hasExpectedSignature(
  bytes: Buffer,
  mimeType: SupportedRecordedAudioMime,
): boolean {
  switch (mimeType) {
    case "audio/wav":
      return (
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WAVE"
      );
    case "audio/ogg":
      return bytes.subarray(0, 4).toString("ascii") === "OggS";
    case "audio/mpeg":
      return (
        bytes.subarray(0, 3).toString("ascii") === "ID3" ||
        (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
      );
    case "audio/mp4":
      return bytes.subarray(4, 8).toString("ascii") === "ftyp";
    case "audio/webm":
      return (
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      );
  }
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

function fsyncFile(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function removeCreatedFile(path: string, created: boolean): void {
  if (created && existsSync(path)) rmSync(path, { force: true });
}

function canonicalRecordedAudioImportsDir(
  runtimeDataDir: string,
  create: boolean,
): string | null {
  const requestedDataDir = resolve(runtimeDataDir);
  if (create) mkdirSync(requestedDataDir, { recursive: true, mode: 0o700 });
  if (!existsSync(requestedDataDir)) return null;

  const dataDir = realpathSync(requestedDataDir);
  const requestedTransientDir = resolve(dataDir, TRANSIENT_DIRECTORY);
  if (create && !existsSync(requestedTransientDir)) {
    mkdirSync(requestedTransientDir, { mode: 0o700 });
  }
  if (!existsSync(requestedTransientDir)) return null;
  if (lstatSync(requestedTransientDir).isSymbolicLink()) {
    throw new Error("Transient directory cannot be a symbolic link.");
  }
  const transientDir = realpathSync(requestedTransientDir);
  if (!isContainedPath(dataDir, transientDir)) {
    throw new Error("Transient directory escaped the data root.");
  }

  const requestedImportsDir = resolve(
    transientDir,
    RECORDED_AUDIO_IMPORTS_DIRECTORY,
  );
  if (create && !existsSync(requestedImportsDir)) {
    mkdirSync(requestedImportsDir, { mode: 0o700 });
  }
  if (!existsSync(requestedImportsDir)) return null;
  if (lstatSync(requestedImportsDir).isSymbolicLink()) {
    throw new Error("Transient dictation directory cannot be a symbolic link.");
  }

  const importsDir = realpathSync(requestedImportsDir);
  if (!isContainedPath(dataDir, importsDir)) {
    throw new Error("Transient dictation directory escaped the data root.");
  }
  if (create) chmodSync(importsDir, 0o700);
  return importsDir;
}

/**
 * Removes recorder imports left by an earlier desktop process. This runs before
 * the renderer can create a new recording, so every entry is stale. Work is
 * capped to keep startup latency bounded; a later launch continues the sweep.
 */
export function pruneStaleRecordedAudioImports(
  runtimeDataDir: string,
  limit = RECORDED_AUDIO_IMPORT_PRUNE_LIMIT,
): number {
  if (!Number.isSafeInteger(limit) || limit < 1) return 0;

  let importsDir: string | null;
  try {
    importsDir = canonicalRecordedAudioImportsDir(runtimeDataDir, false);
  } catch {
    return 0;
  }
  if (!importsDir) return 0;

  let directory: ReturnType<typeof opendirSync>;
  try {
    directory = opendirSync(importsDir);
  } catch {
    return 0;
  }
  let scanned = 0;
  let removed = 0;
  try {
    while (scanned < limit) {
      const entry = directory.readSync();
      if (!entry) break;
      scanned += 1;
      if (
        !RECORDING_ID_PATTERN.test(entry.name) &&
        !entry.name.startsWith(".deleting-")
      ) {
        continue;
      }

      const candidate = resolve(importsDir, entry.name);
      if (!isContainedPath(importsDir, candidate)) continue;
      const tombstone = resolve(importsDir, `.deleting-${randomUUID()}`);
      try {
        // Rename the directory entry itself before recursive removal. If an
        // attacker swaps it for a symlink, only the link moves and is unlinked;
        // its external target is never traversed.
        renameSync(candidate, tombstone);
        rmSync(tombstone, { recursive: true, force: true });
        removed += 1;
      } catch {
        // Startup pruning is best effort. A locked entry is retried next launch.
      }
    }
  } finally {
    directory.closeSync();
  }
  return removed;
}

export function discardRecordedAudioImport(
  runtimeDataDir: string,
  recordingId: string,
): boolean {
  if (!RECORDING_ID_PATTERN.test(recordingId)) {
    throw new RecordedAudioImportError(
      "invalid_audio",
      "Recording ID is invalid.",
    );
  }
  const importsDir = canonicalRecordedAudioImportsDir(runtimeDataDir, false);
  if (!importsDir) return false;
  const candidate = resolve(importsDir, recordingId);
  if (!isContainedPath(importsDir, candidate) || !existsSync(candidate)) {
    return false;
  }
  const tombstone = resolve(importsDir, `.deleting-${randomUUID()}`);
  renameSync(candidate, tombstone);
  rmSync(tombstone, { recursive: true, force: true });
  return true;
}

export function importRecordedAudio(
  input: RecordedAudioImportInput,
  runtimeDataDir: string,
): RecordedAudioDescriptor {
  if (typeof runtimeDataDir !== "string" || runtimeDataDir.length === 0) {
    throw new RecordedAudioImportError(
      "import_failed",
      "The managed attachment directory is unavailable.",
    );
  }

  const name = validateName(input.name);
  const mimeType = validateMime(input.mimeType);
  const contents = copyBytes(input.bytes);
  if (contents.byteLength === 0) {
    throw new RecordedAudioImportError("invalid_audio", "Recording is empty.");
  }
  if (contents.byteLength > RECORDED_AUDIO_IMPORT_MAX_BYTES) {
    throw new RecordedAudioImportError(
      "audio_too_large",
      `Recording exceeds the ${RECORDED_AUDIO_IMPORT_MAX_BYTES / 1024 / 1024} MB limit.`,
    );
  }
  if (!hasExpectedSignature(contents, mimeType)) {
    throw new RecordedAudioImportError(
      "invalid_audio",
      "Recording content does not match its declared MIME type.",
    );
  }

  let importsDir: string;
  try {
    const storage = canonicalRecordedAudioImportsDir(runtimeDataDir, true);
    if (!storage)
      throw new Error("Transient dictation storage is unavailable.");
    importsDir = storage;
  } catch (error) {
    throw new RecordedAudioImportError(
      "import_failed",
      "The transient dictation directory is unavailable.",
      { cause: error },
    );
  }

  const id = randomUUID();
  const sessionDir = resolve(importsDir, id);
  mkdirSync(sessionDir, { mode: 0o700 });
  const storedName = `${id}${AUDIO_EXTENSION_BY_MIME[mimeType]}`;
  const destinationPath = resolve(sessionDir, storedName);
  const metadataPath = resolve(sessionDir, `${id}.meta.json`);
  const temporaryDataPath = resolve(sessionDir, `.${id}.data.tmp`);
  const temporaryMetadataPath = resolve(sessionDir, `.${id}.metadata.tmp`);
  let temporaryDataCreated = false;
  let temporaryMetadataCreated = false;
  let destinationCreated = false;
  let metadataCreated = false;

  try {
    const sha256 = createHash("sha256").update(contents).digest("hex");
    writeFileSync(temporaryDataPath, contents, { flag: "wx", mode: 0o600 });
    temporaryDataCreated = true;
    const copied = statSync(temporaryDataPath);
    if (
      copied.size !== contents.byteLength ||
      createHash("sha256")
        .update(readFileSync(temporaryDataPath))
        .digest("hex") !== sha256
    ) {
      throw new Error("Recording changed during managed import.");
    }
    fsyncFile(temporaryDataPath);
    renameSync(temporaryDataPath, destinationPath);
    temporaryDataCreated = false;
    destinationCreated = true;

    const descriptor: RecordedAudioDescriptor = {
      id,
      name,
      kind: "audio",
      mimeType,
      sizeBytes: contents.byteLength,
      sha256,
    };
    const metadata: RecordedAudioMetadata = {
      version: 1,
      ...descriptor,
      storedName,
      createdAt: new Date().toISOString(),
    };
    // Keep this explicit staged write: the metadata participates in the
    // recording's two-file fsync/rename transaction.
    writeFileSync(temporaryMetadataPath, `${JSON.stringify(metadata)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    temporaryMetadataCreated = true;
    fsyncFile(temporaryMetadataPath);
    renameSync(temporaryMetadataPath, metadataPath);
    temporaryMetadataCreated = false;
    metadataCreated = true;

    if (process.platform !== "win32") {
      fsyncFile(sessionDir);
      fsyncFile(importsDir);
    }
    return descriptor;
  } catch (error) {
    removeCreatedFile(temporaryMetadataPath, temporaryMetadataCreated);
    removeCreatedFile(temporaryDataPath, temporaryDataCreated);
    removeCreatedFile(metadataPath, metadataCreated);
    removeCreatedFile(destinationPath, destinationCreated);
    rmSync(sessionDir, { force: true, recursive: true });
    if (error instanceof RecordedAudioImportError) throw error;
    throw new RecordedAudioImportError(
      "import_failed",
      "Could not import the recording into managed storage.",
      { cause: error },
    );
  }
}
