import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrowserPage } from "./BrowserPage";
import { MediaPage } from "./MediaPage";

describe("media and browser workspace density", () => {
  it("keeps one primary media workflow visible and defers optional settings", () => {
    const html = renderToStaticMarkup(<MediaPage active />);

    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    expect(html.match(/hidden=""/g)).toHaveLength(3);
    expect(html).toContain("Inspect or analyze a file");
    expect(html).toContain("Analysis settings");
    expect(html).toContain('aria-labelledby="media-tab-inspect-analyze"');
    expect(html).not.toContain("Run model analysis");
  });

  it("renders compact browser actions and a collapsed comparison workflow", () => {
    const html = renderToStaticMarkup(<BrowserPage active />);

    expect(html).toContain("Preview localhost. Capture evidence from any URL.");
    expect(html).toContain('aria-label="Inspect: DOM and page metadata"');
    expect(html).toContain("Compare versions");
    expect(html).not.toContain(">DOM and page metadata<");
  });
});
