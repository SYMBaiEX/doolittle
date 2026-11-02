import { readFileSync } from "node:fs";

/** Missing state is optional; unreadable or corrupt state must remain visible. */
export function readOptionalJson<T = unknown>(path: string): T | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
  return JSON.parse(text) as T;
}
