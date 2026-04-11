import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFamilyDescriptions, readCuratedFamilies } from "./parsing";

describe("skill hub family parsing helpers", () => {
  it("extracts category map descriptions", () => {
    const readme = [
      "# Header",
      "",
      "## Category map",
      "- `planning/coordination`",
      "  - Coordinate planning work.",
      "## Changelog",
      "- `ignore`",
      "- should not read",
    ].join("\n");

    expect(parseFamilyDescriptions(readme).get("planning/coordination")).toBe(
      "Coordinate planning work.",
    );
    expect(parseFamilyDescriptions(readme).has("ignore")).toBe(false);
  });

  it("reads curated families with README fallbacks", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-family-parser-"));
    const indexPath = join(root, "index.md");
    const readmePath = join(root, "README.md");
    try {
      writeFileSync(
        indexPath,
        "- `planning/coordination` - [`coordination`](./planning/coordination/README.md)\n" +
          "- `ops/deploy` - [`deploy`](./ops/deploy/README.md)\n",
        "utf8",
      );
      writeFileSync(
        readmePath,
        "## Category map\n- `planning/coordination`\n  - Plan jobs together.\n",
        "utf8",
      );
      const families = readCuratedFamilies(indexPath, readmePath);
      expect(families).toEqual([
        {
          slug: "planning/coordination",
          path: "./planning/coordination/README.md",
          title: "Planning Coordination",
          description: "Plan jobs together.",
        },
        {
          slug: "ops/deploy",
          path: "./ops/deploy/README.md",
          title: "Ops Deploy",
          description: "Curated skill family for ops/deploy.",
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
