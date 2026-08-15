import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./SkillsPage.tsx", import.meta.url),
  "utf8",
);
const catalogSource = readFileSync(
  new URL("./skills/SkillCatalogWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("Skills route loading", () => {
  it("uses a focused skill catalog and defers the workshop implementation", () => {
    expect(source).toContain("<SkillCatalogWorkspace");
    expect(source).not.toContain(
      'import { SkillWorkshopPanel } from "./components/SkillWorkshopPanel"',
    );
    expect(source).toContain('import("./components/SkillWorkshopPanel")');
    expect(source).toContain("Loading skill workshop…");
    expect(catalogSource).toContain("className={CATALOG_BROWSER_CLASS}");
    expect(catalogSource).toContain("selected.description");
    expect(catalogSource).toContain("selected.commandName");
  });
});
