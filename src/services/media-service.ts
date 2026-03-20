import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

export interface MediaInspection {
  path: string;
  basename: string;
  extension: string;
  sizeBytes: number;
  kind: "image" | "audio" | "video" | "document" | "unknown";
  mimeType: string;
  exists: boolean;
  isDirectory: boolean;
  detail: string;
  width?: number;
  height?: number;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
};

export class MediaService {
  constructor(private readonly workspaceDir: string) {}

  inspect(path: string): MediaInspection {
    const resolvedPath = resolve(this.workspaceDir, path);
    const extension = extname(resolvedPath).toLowerCase();
    const mimeType = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";

    if (!existsSync(resolvedPath)) {
      return {
        path: resolvedPath,
        basename: basename(resolvedPath),
        extension,
        sizeBytes: 0,
        kind: "unknown",
        mimeType,
        exists: false,
        isDirectory: false,
        detail: "Path does not exist.",
      };
    }

    const stat = statSync(resolvedPath);
    if (stat.isDirectory()) {
      return {
        path: resolvedPath,
        basename: basename(resolvedPath),
        extension,
        sizeBytes: stat.size,
        kind: "unknown",
        mimeType: "inode/directory",
        exists: true,
        isDirectory: true,
        detail: "Path is a directory.",
      };
    }

    const kind = this.detectKind(extension);
    const imageDimensions =
      kind === "image" ? this.readImageDimensions(resolvedPath, extension) : undefined;

    return {
      path: resolvedPath,
      basename: basename(resolvedPath),
      extension,
      sizeBytes: stat.size,
      kind,
      mimeType,
      exists: true,
      isDirectory: false,
      detail: imageDimensions
        ? `Image file detected with dimensions ${imageDimensions.width}x${imageDimensions.height}.`
        : `Detected as ${kind} (${mimeType}).`,
      width: imageDimensions?.width,
      height: imageDimensions?.height,
    };
  }

  private detectKind(
    extension: string,
  ): "image" | "audio" | "video" | "document" | "unknown" {
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extension)) {
      return "image";
    }
    if ([".mp3", ".wav", ".m4a", ".ogg"].includes(extension)) {
      return "audio";
    }
    if ([".mp4", ".mov", ".webm", ".avi"].includes(extension)) {
      return "video";
    }
    if ([".pdf", ".txt", ".md", ".json"].includes(extension)) {
      return "document";
    }
    return "unknown";
  }

  private readImageDimensions(
    path: string,
    extension: string,
  ): { width: number; height: number } | undefined {
    const bytes = readFileSync(path);

    if (extension === ".png" && bytes.length >= 24) {
      return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
      };
    }

    if ((extension === ".gif" || extension === ".webp") && bytes.length >= 10) {
      if (extension === ".gif") {
        return {
          width: bytes.readUInt16LE(6),
          height: bytes.readUInt16LE(8),
        };
      }
      if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
        const chunkType = bytes.subarray(12, 16).toString("ascii");
        if (chunkType === "VP8X" && bytes.length >= 30) {
          return {
            width: 1 + bytes.readUIntLE(24, 3),
            height: 1 + bytes.readUIntLE(27, 3),
          };
        }
      }
    }

    if (extension === ".jpg" || extension === ".jpeg") {
      return this.readJpegDimensions(bytes);
    }

    return undefined;
  }

  private readJpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
    if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) {
      return undefined;
    }

    let offset = 2;
    while (offset + 1 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = bytes[offset + 1];
      if (marker === 0xd9 || marker === 0xda) {
        break;
      }

      if (offset + 3 >= bytes.length) {
        break;
      }

      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) {
        break;
      }

      const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb]);
      if (sofMarkers.has(marker) && offset + 9 < bytes.length) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }

      offset += 2 + length;
    }

    return undefined;
  }
}
