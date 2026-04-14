import { readFileSync } from "node:fs";

import type { AudioMetadata } from "./types";

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
