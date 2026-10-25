import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { findRepoRoot } from "../../apps/desktop/src/main/backend";

it("loads the desktop runtime from its own checkout and rejects workspace lookalikes", () => {
  const fake = mkdtempSync(resolve(tmpdir(), "doolittle-lookalike-"));
  try {
    const directory = resolve(fake, "apps/cli/src");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, "index.ts"),
      "throw new Error('untrusted');",
    );
    expect(() => findRepoRoot([fake])).toThrow("application's checkout");
    expect(findRepoRoot([fake, resolve(process.cwd(), "apps/desktop")])).toBe(
      process.cwd(),
    );
  } finally {
    rmSync(fake, { recursive: true, force: true });
  }
});
