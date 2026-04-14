import { readFileSync } from "node:fs";

import type { PdfMetadata } from "./types";

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
