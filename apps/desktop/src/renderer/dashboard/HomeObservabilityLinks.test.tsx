import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeObservabilityLinks } from "./HomeObservabilityLinks";

describe("HomeObservabilityLinks", () => {
  it("links to the full Home observability routes without embedding their state", () => {
    const markup = renderToStaticMarkup(<HomeObservabilityLinks />);

    expect(markup).toContain('data-home-observability-links="true"');
    expect(markup).toContain('href="#/home/activity"');
    expect(markup).toContain('href="#/home/insights"');
    expect(markup).toContain("Open activity");
    expect(markup).toContain("Open insights");
    expect(markup).not.toContain("ActivityCenter");
  });
});
