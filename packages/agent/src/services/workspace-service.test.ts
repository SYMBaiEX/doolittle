import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceService } from "./workspace-service";

describe("WorkspaceService", () => {
  it("searches the workspace and returns matching lines", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-workspace-"));
    const service = new WorkspaceService(root);

    try {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "auth.ts"),
        [
          "export const provider = 'elizacloud';",
          "export const linkedProviderAuth = true;",
          "export const secondary = 'auth linked provider';",
        ].join("\n"),
        "utf8",
      );

      const results = service.search("linkedProviderAuth", 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.path).toContain("src/auth.ts");
      expect(results[0]?.matches.join("\n")).toContain("linkedProviderAuth");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
