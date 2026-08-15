import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesktopWindowContext } from "./DesktopWindowContext";

const props = {
  itemLabel: "Settings",
  onOpenProjectManager: vi.fn(),
  projectScopeLabel: "doolittle",
  sectionLabel: "Manage",
};

describe("DesktopWindowContext", () => {
  it("keeps only the project scope on ordinary routes", () => {
    const markup = renderToStaticMarkup(
      <DesktopWindowContext {...props} showRouteContext={false} />,
    );

    expect(markup).not.toContain("Manage");
    expect(markup).not.toContain("Settings");
    expect(markup).toContain("doolittle");
  });

  it("shows route context for workspace routes", () => {
    const markup = renderToStaticMarkup(
      <DesktopWindowContext {...props} showRouteContext />,
    );

    expect(markup).toContain("Manage");
    expect(markup).toContain("Settings");
    expect(markup).toContain("doolittle");
  });
});
