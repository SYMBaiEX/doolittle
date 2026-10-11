import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "@/types/runtime";
import { ensureSecretSalt } from "./secret-salt";

afterEach(() => vi.unstubAllEnvs());

function cleanSaltEnv(): void {
  for (const name of ["SECRET_SALT", "ENCRYPTION_SALT", "ELIZA_SECRET_SALT"])
    vi.stubEnv(name, "");
}

describe("private stable workspace salt", () => {
  it("creates owner-only salt and reuses it without rotation", () => {
    cleanSaltEnv();
    const root = mkdtempSync(join(tmpdir(), "doolittle-private-salt-"));
    try {
      const config = { dataDir: root } as EnvConfig;
      const salt = ensureSecretSalt(config);
      expect(ensureSecretSalt(config)).toBe(salt);
      if (process.platform !== "win32")
        expect(statSync(join(root, "secret-salt")).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed on an empty existing salt and resumes after operator repair", () => {
    cleanSaltEnv();
    const root = mkdtempSync(join(tmpdir(), "doolittle-invalid-salt-"));
    const path = join(root, "secret-salt");
    try {
      writeFileSync(path, "");
      expect(() => ensureSecretSalt({ dataDir: root } as EnvConfig)).toThrow(
        "refusing to replace",
      );
      expect(readFileSync(path, "utf8")).toBe("");
      writeFileSync(path, "restored-original-salt\n");
      expect(ensureSecretSalt({ dataDir: root } as EnvConfig)).toBe(
        "restored-original-salt",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "refuses symlink salt without changing its target",
    () => {
      cleanSaltEnv();
      const root = mkdtempSync(join(tmpdir(), "doolittle-linked-salt-"));
      const target = join(root, "target");
      const path = join(root, "secret-salt");
      try {
        writeFileSync(target, "original", { mode: 0o644 });
        symlinkSync(target, path);
        expect(() =>
          ensureSecretSalt({ dataDir: root } as EnvConfig),
        ).toThrow();
        expect(readFileSync(target, "utf8")).toBe("original");
        expect(statSync(target).mode & 0o777).toBe(0o644);
        unlinkSync(path);
        expect(ensureSecretSalt({ dataDir: root } as EnvConfig)).toMatch(
          /^[0-9a-f]{32}$/u,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
