import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

describe("workspace context files", () => {
  it("AGENTS.md is real guidance, not a claude-mem memory dump", () => {
    // ContextFilesService injects AGENTS.md into the live model prompt under
    // "WORKSPACE CONTEXT". A claude-mem context dump there feeds the model stale
    // memory observations every turn and wastes prompt tokens — guard against it.
    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
    expect(agents).not.toContain("<claude-mem-context>");
    expect(agents).not.toContain("# Memory Context");
  });
});
