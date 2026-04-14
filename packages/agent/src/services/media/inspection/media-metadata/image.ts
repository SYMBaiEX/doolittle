import { readFileSync } from "node:fs";

import { readJpegDimensions } from "./jpeg";

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
