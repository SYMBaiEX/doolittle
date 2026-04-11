import { describe, expect, it } from "bun:test";
import { renderGenerationSvg, renderSpeechSvg } from "./renderers";

describe("media generation renderers", () => {
  it("renders escaped image fallback svg output", () => {
    const svg = renderGenerationSvg("Alpha <Beta> & Gamma", "1024x1024");

    expect(svg).toContain("Doolittle Browserless Image Concept");
    expect(svg).toContain("1024x1024");
    expect(svg).toContain("&lt;Beta&gt;");
    expect(svg).toContain("&amp; Gamma");
  });

  it("renders speech fallback svg output", () => {
    const svg = renderSpeechSvg("Narrate this cleanly", "alloy", 1.2);

    expect(svg).toContain("Doolittle Speech Concept");
    expect(svg).toContain("Voice: alloy");
    expect(svg).toContain("Speed: 1.2");
  });
});
