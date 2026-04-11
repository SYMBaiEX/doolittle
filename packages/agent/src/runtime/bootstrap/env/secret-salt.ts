import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvConfig } from "@/types/runtime";

export function ensureSecretSalt(config: EnvConfig): string {
  const provided =
    process.env.SECRET_SALT?.trim() || process.env.ELIZA_SECRET_SALT?.trim();
  if (provided) {
    return provided;
  }

  const saltPath = join(config.dataDir, "secret-salt");
  try {
    const existing = readFileSync(saltPath, "utf8").trim();
    if (existing) {
      return existing;
    }
  } catch {
    // Fall through and create a stable per-workspace salt.
  }

  const generated = randomUUID().replace(/-/g, "");
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(saltPath, `${generated}\n`, "utf8");
  return generated;
}
