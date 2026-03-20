import { createHash } from "node:crypto";
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
  contentHash?: string;
  textPreview?: string;
  lineCount?: number;
  wordCount?: number;
  width?: number;
  height?: number;
  pageCount?: number;
  title?: string;
  author?: string;
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
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".yaml": "application/x-yaml",
  ".yml": "application/x-yaml",
  ".toml": "application/toml",
  ".xml": "application/xml",
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
    const contentHash = this.hashFile(resolvedPath);
    const structuredMetadata =
      kind === "document"
        ? extension === ".pdf"
          ? this.readPdfMetadata(resolvedPath)
          : this.readTextMetadata(resolvedPath, extension)
        : undefined;

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
        : structuredMetadata
          ? extension === ".pdf"
            ? `PDF detected${structuredMetadata.pageCount ? ` with about ${structuredMetadata.pageCount} pages` : ""}${structuredMetadata.title ? ` titled ${structuredMetadata.title}` : ""}.`
            : `Detected as ${kind} (${mimeType}) with ${structuredMetadata.wordCount} words across ${structuredMetadata.lineCount} lines.`
          : `Detected as ${kind} (${mimeType}).`,
      contentHash,
      textPreview: structuredMetadata?.preview,
      lineCount: structuredMetadata?.lineCount,
      wordCount: structuredMetadata?.wordCount,
      width: imageDimensions?.width,
      height: imageDimensions?.height,
      pageCount: structuredMetadata?.pageCount,
      title: structuredMetadata?.title,
      author: structuredMetadata?.author,
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
    if ([".pdf", ".txt", ".md", ".json", ".csv", ".html", ".htm", ".yaml", ".yml", ".toml", ".xml"].includes(extension)) {
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

    if (extension === ".svg") {
      const text = bytes.toString("utf8");
      const widthMatch = text.match(/\bwidth="([\d.]+)(px)?"/iu);
      const heightMatch = text.match(/\bheight="([\d.]+)(px)?"/iu);
      const viewBoxMatch = text.match(/\bviewBox="([\d.\s-]+)"/iu);
      if (widthMatch && heightMatch) {
        return {
          width: Number(widthMatch[1]),
          height: Number(heightMatch[1]),
        };
      }
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1]
          .split(/\s+/u)
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value));
        if (parts.length === 4) {
          return {
            width: parts[2],
            height: parts[3],
          };
        }
      }
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

  private readTextMetadata(
    path: string,
    extension: string,
  ): { preview: string; lineCount: number; wordCount: number; pageCount?: number; title?: string; author?: string } | undefined {
    if (![".txt", ".md", ".json", ".csv", ".html", ".htm", ".yaml", ".yml", ".toml", ".xml"].includes(extension)) {
      return undefined;
    }

    const content = readFileSync(path, "utf8");
    const preview = this.buildPreview(content, extension);
    const lineCount = content ? content.split(/\r?\n/u).length : 0;
    const wordCount = content ? content.split(/\s+/u).filter(Boolean).length : 0;
    return {
      preview,
      lineCount,
      wordCount,
    };
  }

  private readPdfMetadata(
    path: string,
  ): { preview: string; lineCount?: number; wordCount?: number; pageCount?: number; title?: string; author?: string } | undefined {
    const bytes = readFileSync(path);
    if (bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
      return undefined;
    }

    const text = bytes.toString("latin1", 0, Math.min(bytes.length, 64_000));
    const title = text.match(/\/Title\s*\(([^)]{1,200})\)/iu)?.[1];
    const author = text.match(/\/Author\s*\(([^)]{1,200})\)/iu)?.[1];
    const pageCount = (text.match(/\/Type\s*\/Page\b/gu) ?? []).length || undefined;
    const preview = text
      .replace(/[^\x09\x0a\x0d\x20-\x7e]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 512);

    return {
      preview,
      pageCount,
      title,
      author,
    };
  }

  private buildPreview(content: string, extension: string): string {
    const trimmed = content.trim();
    if (!trimmed) {
      return "";
    }

    if (extension === ".html" || extension === ".htm") {
      const text = trimmed
        .replace(/<script[\s\S]*?<\/script>/giu, " ")
        .replace(/<style[\s\S]*?<\/style>/giu, " ")
        .replace(/<[^>]+>/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
      return text.slice(0, 512);
    }

    if (extension === ".csv") {
      const [header, ...rows] = trimmed.split(/\r?\n/u);
      const sample = [header, ...rows.slice(0, 2)].join("\n");
      return sample.slice(0, 512);
    }

    if (extension === ".yaml" || extension === ".yml" || extension === ".toml" || extension === ".xml") {
      return trimmed.slice(0, 512);
    }

    return trimmed.slice(0, 512);
  }

  private hashFile(path: string): string {
    const bytes = readFileSync(path);
    return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  }
}
