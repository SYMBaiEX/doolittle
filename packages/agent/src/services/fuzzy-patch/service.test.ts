import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FuzzyPatchService, fuzzyPatcher } from "./service";

describe("fuzzy patch service", () => {
  test("applies unified diff patches to files", () => {
    const dir = mkdtempSync(join(tmpdir(), "fuzzy-patch-"));
    const filePath = join(dir, "sample.txt");
    writeFileSync(filePath, "alpha\nbravo\ndelta\n", "utf8");

    const service = new FuzzyPatchService();
    const result = service.applyPatch(
      filePath,
      `@@ -1,3 +1,3 @@
 alpha
-bravo
+charlie
 delta`,
    );

    expect(result.success).toBe(true);
    expect(readFileSync(filePath, "utf8")).toBe("alpha\ncharlie\ndelta\n");
  });

  test("keeps the singleton export wired", () => {
    expect(fuzzyPatcher).toBeInstanceOf(FuzzyPatchService);
  });
});
