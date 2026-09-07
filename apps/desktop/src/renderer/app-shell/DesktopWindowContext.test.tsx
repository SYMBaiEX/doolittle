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
  it("keeps the current page and project scope on ordinary routes", () => {
    const markup = renderToStaticMarkup(
      <DesktopWindowContext {...props} showRouteContext={false} />,
    );

    expect(markup).not.toContain("Manage");
    expect(markup).toContain("Settings");
    expect(markup).toContain("doolittle");
    expect(markup).toContain('aria-label="Workspace breadcrumb"');
    expect(markup).toContain('aria-current="page"');
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
