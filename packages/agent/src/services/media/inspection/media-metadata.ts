import { readFileSync } from "node:fs";

import { buildMediaPreview } from "./media-preview";

type TextMetadata = {
  preview: string;
  lineCount: number;
  wordCount: number;
  pageCount?: number;
  title?: string;
  author?: string;
};

type PdfMetadata = {
  preview: string;
  lineCount?: number;
  wordCount?: number;
  pageCount?: number;
  title?: string;
  author?: string;
};

type AudioMetadata = {
  durationMs?: number;
};

export function readMediaImageDimensions(
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
    if (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
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
    return readJpegDimensions(bytes);
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

export function readMediaTextMetadata(
  path: string,
  extension: string,
): TextMetadata | undefined {
  if (
    ![
      ".txt",
      ".md",
      ".json",
      ".csv",
      ".html",
      ".htm",
      ".yaml",
      ".yml",
      ".toml",
      ".xml",
    ].includes(extension)
  ) {
    return undefined;
  }

  const content = readFileSync(path, "utf8");
  const preview = buildMediaPreview(content, extension);
  const lineCount = content ? content.split(/\r?\n/u).length : 0;
  const wordCount = content ? content.split(/\s+/u).filter(Boolean).length : 0;
  return {
    preview,
    lineCount,
    wordCount,
  };
}

export function readMediaPdfMetadata(path: string): PdfMetadata | undefined {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
    return undefined;
  }

  const text = bytes.toString("latin1", 0, Math.min(bytes.length, 64_000));
  const title = text.match(/\/Title\s*\(([^)]{1,200})\)/iu)?.[1];
  const author = text.match(/\/Author\s*\(([^)]{1,200})\)/iu)?.[1];
  const pageCount =
    (text.match(/\/Type\s*\/Page\b/gu) ?? []).length || undefined;
  const preview = text
    .replace(/[^\t\n\r -~]+/gu, " ")
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

export function readMediaAudioMetadata(
  path: string,
  extension: string,
): AudioMetadata | undefined {
  const bytes = readFileSync(path);

  if (extension === ".wav" && bytes.length >= 44) {
    const riff = bytes.subarray(0, 4).toString("ascii");
    const wave = bytes.subarray(8, 12).toString("ascii");
    if (riff === "RIFF" && wave === "WAVE") {
      const byteRate = bytes.readUInt32LE(28);
      const dataSize = bytes.readUInt32LE(40);
      if (byteRate > 0 && dataSize >= 0) {
        return {
          durationMs: Math.round((dataSize / byteRate) * 1000),
        };
      }
    }
  }

  return undefined;
}

function readJpegDimensions(
  bytes: Buffer,
): { width: number; height: number } | undefined {
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

    const sofMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
    ]);
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
