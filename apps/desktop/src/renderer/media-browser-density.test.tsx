import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrowserPage } from "./BrowserPage";
import { BROWSER_WORKSPACE_CLASS } from "./browser/browser-layout";
import { MediaPage } from "./MediaPage";

describe("media and browser workspace density", () => {
  it("keeps one primary media workflow visible and defers optional settings", () => {
    const html = renderToStaticMarkup(<MediaPage active />);

    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    expect(html.match(/hidden=""/g)).toHaveLength(3);
    expect(html).toContain("Inspect file");
    expect(html).toContain("Analysis settings");
    expect(html).toContain(
      'class="col-span-full mb-[11px] grid grid-cols-[minmax(0,1fr)_auto]',
    );
    expect(html).not.toContain("Local media");
    expect(html).toContain('aria-labelledby="media-tab-inspect-analyze"');
    expect(html).not.toContain("Run model analysis");
  });

  it("renders compact browser actions and a collapsed comparison workflow", () => {
    const html = renderToStaticMarkup(<BrowserPage active />);

    expect(html).toContain("Preview localhost. Capture evidence from any URL.");
    expect(html).toContain('aria-label="Inspect: DOM and page metadata"');
    expect(html).toContain('data-browser-action="analyze"');
    expect(html).toContain("Compare versions");
    expect(html).not.toContain(">DOM and page metadata<");
    expect(BROWSER_WORKSPACE_CLASS).toContain("max-[1080px]:grid-cols-1");
  });
});
