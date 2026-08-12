import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./PluginsPage.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("./plugins.css", import.meta.url), "utf8");

describe("PluginsPage density", () => {
  it("keeps the plugin search as the primary desktop control with a bounded category rail", () => {
    expect(source).toContain('className="page plugins-page"');
    expect(source).toContain('className="plugins-catalog-controls"');
    expect(source).toContain('label="Plugin catalog summary"');
    expect(source).toContain('className="filter-bar plugins-filter-bar"');
    expect(source).toContain('className="plugins-filter-label">Search</span>');
    expect(source).toContain(
      'className="plugins-filter-label" id="plugin-category-label"',
    );
    expect(source).toContain('className="plugins-category-trigger"');
    expect(styles).toContain(
      "grid-template-columns: minmax(0, 1fr) clamp(176px, 22vw, 240px)",
    );
    expect(styles).toContain(
      "grid-template-columns: minmax(520px, 1fr) minmax(460px, 0.78fr)",
    );
    expect(styles).toContain("align-items: end;");
    expect(styles).toContain("width: 100%;");
    expect(styles).toContain("@media (max-width: 1180px)");
    expect(styles).toContain("@media (max-width: 680px)");
  });
});
