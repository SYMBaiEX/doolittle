import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
}

describe("catalog resource contract", () => {
  it("keeps cached tool entries visible when an optional refresh fails", () => {
    const tools = source("ToolsPage.tsx");

    expect(tools).toContain("ResourceStatusBar");
    expect(tools).toContain("tools.error && !catalogData");
    expect(tools).toContain("tools.loading && !catalogData");
    expect(tools).toContain("cachedCatalog.current");
  });

  it("keeps cached skill entries visible while retaining workshop behavior", () => {
    const skills = source("SkillsPage.tsx");

    expect(skills).toContain("ResourceStatusBar");
    expect(skills).toContain("skills.error && !catalogData");
    expect(skills).toContain("skills.loading && !catalogData");
    expect(skills).toContain('id="skills-workshop-panel"');
  });
});
