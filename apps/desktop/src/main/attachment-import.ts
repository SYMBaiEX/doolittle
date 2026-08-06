import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
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

export const ATTACHMENT_IMPORT_LIMITS = {
  maxCount: 8,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxNameBytes: 180,
} as const;

export type ManagedAttachmentKind = "audio" | "document" | "image" | "video";

export interface ManagedAttachmentDescriptor {
  id: string;
  name: string;
  kind: ManagedAttachmentKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ManagedAttachmentMetadata extends ManagedAttachmentDescriptor {
  version: 1;
  storedName: string;
  createdAt: string;
}

export type AttachmentImportErrorCode =
  | "invalid_selection"
  | "invalid_name"
  | "file_too_large"
  | "selection_too_large"
  | "unsupported_file"
  | "import_failed";

export class AttachmentImportError extends Error {
  readonly code: AttachmentImportErrorCode;

  constructor(
    code: AttachmentImportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AttachmentImportError";
    this.code = code;
  }
}

interface PreparedAttachment {
  contents: Buffer;
  descriptor: Omit<ManagedAttachmentDescriptor, "id">;
  storedExtension: string;
}

const MIME_BY_TEXT_EXTENSION: Readonly<Record<string, string>> = {
  ".c": "text/plain",
  ".cc": "text/plain",
  ".conf": "text/plain",
  ".cpp": "text/plain",
  ".css": "text/css",
  ".csv": "text/csv",
  ".go": "text/plain",
  ".h": "text/plain",
  ".hpp": "text/plain",
  ".html": "text/html",
  ".java": "text/plain",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jsx": "text/javascript",
  ".log": "text/plain",
  ".md": "text/markdown",
  ".mjs": "text/javascript",
  ".py": "text/x-python",
  ".rs": "text/plain",
  ".sh": "text/x-shellscript",
  ".sql": "text/plain",
  ".svg": "image/svg+xml",
  ".toml": "text/plain",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
} as const;

const STORED_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  "application/json": ".json",
  "application/pdf": ".pdf",
  "application/xml": ".xml",
  "application/yaml": ".yaml",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "text/css": ".css",
  "text/csv": ".csv",
  "text/html": ".html",
  "text/javascript": ".js",
  "text/markdown": ".md",
  "text/plain": ".txt",
  "text/typescript": ".ts",
  "text/x-python": ".py",
  "text/x-shellscript": ".sh",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
} as const;

function startsWith(
  buffer: Buffer,
  bytes: readonly number[],
  offset = 0,
): boolean {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function detectBinaryMime(buffer: Buffer): string | undefined {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
    buffer.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return "image/gif";
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-")
    return "application/pdf";
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "audio/wav";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (
    buffer.subarray(0, 3).toString("ascii") === "ID3" ||
    (buffer[0] === 0xff && (buffer[1] ?? 0) >= 0xe0)
  ) {
    return "audio/mpeg";
  }
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    return brand === "m4a " || brand === "m4b " ? "audio/mp4" : "video/mp4";
  }
  return undefined;
}

function isUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function detectMime(buffer: Buffer, fileName: string): string | undefined {
  const binaryMime = detectBinaryMime(buffer);
  if (binaryMime) return binaryMime;
  if (!isUtf8Text(buffer)) return undefined;

  const extension = extname(fileName).toLowerCase();
  return MIME_BY_TEXT_EXTENSION[extension] ?? "text/plain";
}

function kindForMime(mimeType: string): ManagedAttachmentKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

function validateDisplayName(inputPath: string): string {
  const name = basename(inputPath).normalize("NFC");
  const nameBytes = Buffer.byteLength(name, "utf8");
  const hasControlCharacter = Array.from(name).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    nameBytes > ATTACHMENT_IMPORT_LIMITS.maxNameBytes ||
    hasControlCharacter
  ) {
    throw new AttachmentImportError(
      "invalid_name",
      `Attachment name must be printable and at most ${ATTACHMENT_IMPORT_LIMITS.maxNameBytes} bytes.`,
    );
  }
  return name;
}

function prepareAttachment(inputPath: string): PreparedAttachment {
  if (typeof inputPath !== "string" || inputPath.length === 0) {
    throw new AttachmentImportError(
      "invalid_selection",
      "Attachment path is invalid.",
    );
  }

  const name = validateDisplayName(inputPath);
  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(resolve(inputPath));
  } catch (error) {
    throw new AttachmentImportError(
      "invalid_selection",
      `Could not access attachment "${name}".`,
      { cause: error },
    );
  }

  try {
    const initialStatus = statSync(canonicalPath);
    if (!initialStatus.isFile()) {
      throw new AttachmentImportError(
        "invalid_selection",
        `"${name}" is not a regular file.`,
      );
    }
    if (initialStatus.size > ATTACHMENT_IMPORT_LIMITS.maxFileBytes) {
      throw new AttachmentImportError(
        "file_too_large",
        `"${name}" exceeds the ${ATTACHMENT_IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB attachment limit.`,
      );
    }
  } catch (error) {
    if (error instanceof AttachmentImportError) throw error;
    throw new AttachmentImportError(
      "invalid_selection",
      `Could not inspect attachment "${name}".`,
      { cause: error },
    );
  }

  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = openSync(canonicalPath, constants.O_RDONLY);
    const status = fstatSync(fileDescriptor);
    if (!status.isFile()) {
      throw new AttachmentImportError(
        "invalid_selection",
        `"${name}" is not a regular file.`,
      );
    }
    if (status.size > ATTACHMENT_IMPORT_LIMITS.maxFileBytes) {
      throw new AttachmentImportError(
        "file_too_large",
        `"${name}" exceeds the ${ATTACHMENT_IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB attachment limit.`,
      );
    }

    const contents = readFileSync(fileDescriptor);
    if (contents.byteLength !== status.size) {
      throw new AttachmentImportError(
        "import_failed",
        `"${name}" changed while it was being imported. Try again.`,
      );
    }
    const mimeType = detectMime(contents, name);
    if (!mimeType) {
      throw new AttachmentImportError(
        "unsupported_file",
        `"${name}" is not a supported image, document, audio, or video file.`,
      );
    }

    return {
      contents,
      descriptor: {
        name,
        kind: kindForMime(mimeType),
        mimeType,
        sizeBytes: status.size,
        sha256: createHash("sha256").update(contents).digest("hex"),
      },
      storedExtension: STORED_EXTENSION_BY_MIME[mimeType] ?? ".txt",
    };
  } catch (error) {
    if (error instanceof AttachmentImportError) throw error;
    throw new AttachmentImportError(
      "import_failed",
      `Could not import "${name}".`,
      {
        cause: error,
      },
    );
  } finally {
    if (fileDescriptor !== undefined) closeSync(fileDescriptor);
  }
}

function removeIfPresent(path: string): void {
  if (existsSync(path)) rmSync(path, { force: true });
}

export function importSelectedAttachments(
  inputPaths: readonly string[],
  runtimeDataDir: string,
): ManagedAttachmentDescriptor[] {
  if (
    !Array.isArray(inputPaths) ||
    inputPaths.length === 0 ||
    inputPaths.length > ATTACHMENT_IMPORT_LIMITS.maxCount
  ) {
    throw new AttachmentImportError(
      "invalid_selection",
      `Select between 1 and ${ATTACHMENT_IMPORT_LIMITS.maxCount} attachments.`,
    );
  }
  if (typeof runtimeDataDir !== "string" || runtimeDataDir.length === 0) {
    throw new AttachmentImportError(
      "import_failed",
      "The managed attachment directory is unavailable.",
    );
  }

  const prepared = inputPaths.map(prepareAttachment);
  const totalBytes = prepared.reduce(
    (sum, attachment) => sum + attachment.descriptor.sizeBytes,
    0,
  );
  if (totalBytes > ATTACHMENT_IMPORT_LIMITS.maxTotalBytes) {
    throw new AttachmentImportError(
      "selection_too_large",
      `Selected attachments exceed the ${ATTACHMENT_IMPORT_LIMITS.maxTotalBytes / 1024 / 1024} MB combined limit.`,
    );
  }

  const attachmentsDir = resolve(runtimeDataDir, "attachments");
  mkdirSync(attachmentsDir, { recursive: true, mode: 0o700 });
  chmodSync(attachmentsDir, 0o700);

  const createdPaths: string[] = [];
  const descriptors: ManagedAttachmentDescriptor[] = [];
  try {
    for (const attachment of prepared) {
      const id = randomUUID();
      const storedName = `${id}${attachment.storedExtension}`;
      const destinationPath = resolve(attachmentsDir, storedName);
      const metadataPath = resolve(attachmentsDir, `${id}.meta.json`);
      const temporaryDataPath = resolve(attachmentsDir, `.${id}.data.tmp`);
      const temporaryMetadataPath = resolve(
        attachmentsDir,
        `.${id}.metadata.tmp`,
      );
      createdPaths.push(
        temporaryDataPath,
        temporaryMetadataPath,
        destinationPath,
        metadataPath,
      );

      writeFileSync(temporaryDataPath, attachment.contents, {
        flag: "wx",
        mode: 0o600,
      });
      const copiedStatus = statSync(temporaryDataPath);
      if (
        copiedStatus.size !== attachment.descriptor.sizeBytes ||
        createHash("sha256")
          .update(readFileSync(temporaryDataPath))
          .digest("hex") !== attachment.descriptor.sha256
      ) {
        throw new AttachmentImportError(
          "import_failed",
          `"${attachment.descriptor.name}" changed while it was being copied. Try again.`,
        );
      }
      const copiedDescriptor = openSync(temporaryDataPath, constants.O_RDONLY);
      try {
        fsyncSync(copiedDescriptor);
      } finally {
        closeSync(copiedDescriptor);
      }
      renameSync(temporaryDataPath, destinationPath);

      const descriptor: ManagedAttachmentDescriptor = {
        id,
        ...attachment.descriptor,
      };
      const metadata: ManagedAttachmentMetadata = {
        version: 1,
        ...descriptor,
        storedName,
        createdAt: new Date().toISOString(),
      };
      // Keep this explicit staged write: the metadata participates in the
      // attachment's two-file fsync/rename transaction.
      writeFileSync(temporaryMetadataPath, `${JSON.stringify(metadata)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      const metadataDescriptor = openSync(
        temporaryMetadataPath,
        constants.O_RDONLY,
      );
      try {
        fsyncSync(metadataDescriptor);
      } finally {
        closeSync(metadataDescriptor);
      }
      renameSync(temporaryMetadataPath, metadataPath);
      descriptors.push(descriptor);
    }
  } catch (error) {
    for (const path of createdPaths) removeIfPresent(path);
    if (error instanceof AttachmentImportError) throw error;
    throw new AttachmentImportError(
      "import_failed",
      "Could not copy attachments into managed storage.",
      { cause: error },
    );
  }

  return descriptors;
}
