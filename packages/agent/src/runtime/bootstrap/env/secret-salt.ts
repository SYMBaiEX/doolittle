import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  mkdirSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { EnvConfig } from "@/types/runtime";
import { readRegularFileDescriptorSync } from "@/utils/read-regular-file";

export function ensureSecretSalt(config: EnvConfig): string {
  const provided =
    process.env.SECRET_SALT?.trim() ||
    process.env.ENCRYPTION_SALT?.trim() ||
    process.env.ELIZA_SECRET_SALT?.trim();
  if (provided) {
    return provided;
  }

  const saltPath = join(config.dataDir, "secret-salt");
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  try {
    return readExistingSalt(saltPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const generated = randomUUID().replace(/-/g, "");
  try {
    // Exclusive creation must never rotate an existing workspace's encryption salt.
    writeFileSync(saltPath, `${generated}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return readExistingSalt(saltPath);
  }
}

function readExistingSalt(path: string): string {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK,
  );
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.size === 0 || info.size > 4096) {
      throw new Error(
        "Existing secret salt is invalid; refusing to replace it.",
      );
    }
    const salt = readRegularFileDescriptorSync(descriptor, 4096)
      .toString("utf8")
      .trim();
    if (!salt)
      throw new Error("Existing secret salt is empty; refusing to replace it.");
    fchmodSync(descriptor, 0o600);
    return salt;
  } finally {
    closeSync(descriptor);
  }
}
