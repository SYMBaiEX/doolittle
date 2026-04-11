import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function hashMediaFile(path: string): string {
  const bytes = readFileSync(path);
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}
