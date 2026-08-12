import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("runtime overview layout", () => {
  it("keeps one summary source and two action-oriented cards", () => {
    const overview = read("./runtime/RuntimeOverview.tsx");

    expect(overview).toContain(
      '<CompactStatStrip\n        label="Runtime summary"',
    );
    expect(overview).toContain("<h2>Account routing</h2>");
    expect(overview).toContain("<NativeAutonomyPanel");
    expect(overview).toContain('label="Startup receipt"');
    expect(overview).not.toContain("Conversation model");
    expect(overview).not.toContain("Connected runtime route");
  });

  it("bounds autonomy controls across desktop and compact widths", () => {
    const css = read("./runtime-page.css");

    expect(css).toMatch(
      /\.runtime-overview-grid,[\s\S]*\.runtime-inventory-grid\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u,
    );
    expect(css).toMatch(
      /\.runtime-autonomy-controls\s*\{[\s\S]*grid-template-columns: minmax\(148px, 0\.65fr\) minmax\(190px, auto\)/u,
    );
    expect(css).toMatch(
      /@media \(max-width: 520px\)[\s\S]*\.runtime-autonomy-controls\s*\{\s*grid-template-columns: 1fr/u,
    );
  });
});
