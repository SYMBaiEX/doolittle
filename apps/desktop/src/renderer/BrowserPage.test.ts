import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrowserEmptyEvidence, isLocalPreviewUrl } from "./BrowserPage";

describe("isLocalPreviewUrl", () => {
  it("permits only localhost preview hosts", () => {
    expect(isLocalPreviewUrl("http://localhost:3000")).toBe(true);
    expect(isLocalPreviewUrl("https://127.0.0.1:8443")).toBe(true);
  });

  it("rejects non-local, malformed, and lookalike hosts", () => {
    expect(isLocalPreviewUrl("https://example.test")).toBe(false);
    expect(isLocalPreviewUrl("http://localhost.example.test")).toBe(false);
    expect(isLocalPreviewUrl("http://[::1]:3000")).toBe(false);
    expect(isLocalPreviewUrl("not a URL")).toBe(false);
  });

  it("uses a compact receipt hint before evidence exists", () => {
    const markup = renderToStaticMarkup(createElement(BrowserEmptyEvidence));

    expect(markup).toContain('class="browser-result-empty"');
    expect(markup).toContain(
      "Evidence appears here after an inspect, capture, or analysis.",
    );
    expect(markup).not.toContain("empty-block");
  });
});
