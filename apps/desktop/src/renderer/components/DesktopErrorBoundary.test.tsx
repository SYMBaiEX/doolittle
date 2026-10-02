// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DesktopErrorBoundary,
  formatRendererDiagnostic,
} from "./DesktopErrorBoundary";

describe("DesktopErrorBoundary recovery semantics", () => {
  it("announces the failure once without making its recovery controls assertive", () => {
    const boundary = new DesktopErrorBoundary({ children: null });
    const error = new Error("Renderer failed");
    error.stack =
      "Error: Renderer failed\n    at renderDesktopApp (file:///private/path/App.js:1:1)";
    boundary.state = {
      error,
      componentStack:
        "\n    at DesktopApp (src/App.tsx:1:1)\n    at StrictMode",
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
    expect(markup).toContain("Components: DesktopApp / StrictMode");
    expect(markup).toContain("Frames: renderDesktopApp");
    expect(markup).not.toContain("src/App.tsx");
  });
});

describe("DesktopErrorBoundary canonical recovery route", () => {
  it("uses home as the diagnostic and recovery fallback", () => {
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { platform: "darwin" },
    });
    expect(formatRendererDiagnostic(new Error("Renderer failed"))).toContain(
      "Route: #/home",
    );
    expect(DesktopErrorBoundary.toString()).toContain('"#/home"');
    expect(DesktopErrorBoundary.toString()).not.toContain('"#/dashboard"');
  });
});
