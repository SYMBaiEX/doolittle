import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BackendState } from "../../shared/contracts";
import { DesktopWindowTools } from "./DesktopWindowTools";

const backend: BackendState = {
  message: "Runtime ready",
  phase: "ready",
};

function renderTools(utilityOpen: boolean): string {
  return renderToStaticMarkup(
    <DesktopWindowTools
      backend={backend}
      onOpenPalette={() => undefined}
      onRefresh={() => undefined}
      onToggleUtilities={() => undefined}
      platform="darwin"
      utilityOpen={utilityOpen}
    />,
  );
}

describe("DesktopWindowTools", () => {
  it("renders a responsive icon-and-label utility control", () => {
    const markup = renderTools(false);

    expect(markup).toContain('aria-label="Open Activity"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("activity");
    expect(markup).toContain("<span>Activity</span>");
  });

  it("announces the close action while the utility drawer is expanded", () => {
    const markup = renderTools(true);

    expect(markup).toContain('aria-label="Close Activity"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('title="Close Activity"');
  });
});
