import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectLocalProject } from "./project-inspection";

describe("project inspection", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("summarizes a local project directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-project-inspection-"));
    tempDirs.push(root);
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "sample-project" }, null, 2),
    );
    writeFileSync(
      join(root, "README.md"),
      "# Sample Project\n\nA small test project.\n\n## Notes\n\nShip it.\n",
    );
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), "export const value = 1;\n");

    const inspection = await inspectLocalProject(root);

    expect(inspection.name).toBe(root.split("/").at(-1) ?? "");
    expect(inspection.type).toContain("Node/Bun package");
    expect(inspection.topEntries).toContain("README.md");
    expect(inspection.topEntries).toContain("src");
    expect(inspection.readmePreview).toBeDefined();
    expect(inspection.readmePreview ?? "").toContain("Sample Project");
  });
});
