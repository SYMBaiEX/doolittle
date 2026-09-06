import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrowserPage } from "./BrowserPage";
import {
  BROWSER_ACTION_CLASS,
  BROWSER_WORKSPACE_CLASS,
} from "./browser/browser-layout";
import { MediaPage } from "./MediaPage";

describe("media and browser workspace density", () => {
  it("keeps generated assets as a focused automatic library", () => {
    const html = renderToStaticMarkup(<MediaPage active />);

    expect(html).toContain(">Assets<");
    expect(html).toContain('aria-label="Generated assets"');
    expect(html).toContain("Generated work, in one place");
    expect(html).toContain("native actions record");
    expect(html).not.toContain('aria-label="Media tools"');
    expect(html).not.toContain("Inspect / Analyze");
  });

  it("drops the standalone heading when Media is embedded in Chat", () => {
    const html = renderToStaticMarkup(<MediaPage active embedded />);

    expect(html).not.toContain("Operator");
    expect(html).not.toContain(">Assets<");
    expect(html).toContain('aria-label="Generated assets"');
  });

  it("renders compact browser actions and a collapsed comparison workflow", () => {
    const html = renderToStaticMarkup(<BrowserPage active />);

    expect(html).toContain("Preview localhost. Capture evidence from any URL.");
    expect(html).toContain('aria-label="Inspect: DOM and page metadata"');
    expect(html).toContain('data-browser-action="analyze"');
    expect(html).toContain("Compare versions");
    expect(html).not.toContain(">DOM and page metadata<");
    expect(BROWSER_WORKSPACE_CLASS).toContain("max-[1080px]:grid-cols-1");
    expect(BROWSER_ACTION_CLASS).toContain("[&>span]:font-semibold");
    expect(BROWSER_ACTION_CLASS).not.toContain("font-extrabold");
  });
});
