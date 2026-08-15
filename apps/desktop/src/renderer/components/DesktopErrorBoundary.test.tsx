import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesktopErrorBoundary } from "./DesktopErrorBoundary";

describe("DesktopErrorBoundary recovery semantics", () => {
  it("announces the failure once without making its recovery controls assertive", () => {
    const boundary = new DesktopErrorBoundary({ children: null });
    boundary.state = {
      error: new Error("Renderer failed"),
      componentStack: "",
      copied: false,
    };

    const markup = renderToStaticMarkup(boundary.render());

    expect(markup).toContain('data-recovery-scope="desktop"');
    expect(markup).not.toContain('data-recovery-scope="desktop" role="alert"');
    expect(markup.match(/role="alert"/gu)).toHaveLength(1);
    expect(markup).toContain(
      "Doolittle encountered a rendering error. Recovery actions are available.",
    );
    expect(markup).toContain("Reload Doolittle");
    expect(markup).toContain("Return home");
  });
});
