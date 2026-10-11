import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DelegationEvidence } from "./evidence";

describe("descriptor-pinned delegation evidence", () => {
  it("tracks regular source changes while excluding secrets and oversized files", async () => {
    const root = await mkdtemp(join(tmpdir(), "doolittle-evidence-pinned-"));
    try {
      const source = join(root, "source.ts");
      await writeFile(source, "before");
      await writeFile(join(root, ".env"), "private");
      await writeFile(join(root, "large.ts"), Buffer.alloc(2_000_001));
      const evidence = new DelegationEvidence(root);
      await evidence.start();
      await writeFile(source, "after");
      await writeFile(join(root, ".env"), "changed private");
      expect(await evidence.finish()).toEqual([
        {
          path: source,
          beforeSha256: createHash("sha256").update("before").digest("hex"),
          afterSha256: createHash("sha256").update("after").digest("hex"),
          bytes: 5,
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "does not fingerprint a final symlink and recovers when a source entry is restored",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "doolittle-evidence-symlink-"));
      try {
        const path = join(root, "source.ts");
        const target = join(root, ".env");
        await writeFile(target, "secret");
        await symlink(target, path);
        const evidence = new DelegationEvidence(root);
        await evidence.track(path);
        expect(await evidence.finish()).toEqual([]);
        await unlink(path);
        await writeFile(path, "safe");
        expect(await evidence.finish()).toEqual([
          expect.objectContaining({ path, beforeSha256: null, bytes: 4 }),
        ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
