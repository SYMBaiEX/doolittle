import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./PluginsPage.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("./plugins.css", import.meta.url), "utf8");

describe("PluginsPage density", () => {
  it("shares one responsive control row between catalog facts and filters", () => {
    expect(source).toContain('className="page plugins-page"');
    expect(source).toContain('className="plugins-catalog-controls"');
    expect(source).toContain('label="Plugin catalog summary"');
    expect(source).toContain('className="filter-bar plugins-filter-bar"');
    expect(styles).toContain(
      "grid-template-columns: minmax(560px, 1.2fr) minmax(340px, 0.8fr)",
    );
    expect(styles).toContain("@media (max-width: 1180px)");
  });
});
