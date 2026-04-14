import { readFileSync } from "node:fs";

import { buildMediaPreview } from "../media-preview";
import { TEXT_METADATA_EXTENSIONS } from "./constants";
import type { TextMetadata } from "./types";

export function readMediaTextMetadata(
  path: string,
  extension: string,
): TextMetadata | undefined {
  if (!TEXT_METADATA_EXTENSIONS.has(extension)) {
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
