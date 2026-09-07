import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DesktopWindowContext } from "./DesktopWindowContext";

const props = {
  canGoBack: true,
  canGoForward: false,
  backLabel: "Workspace",
  itemLabel: "Settings",
  onBack: vi.fn(),
  onForward: vi.fn(),
  onOpenProjectManager: vi.fn(),
  onOpenSection: vi.fn(),
  projectScopeLabel: "doolittle",
  sectionLabel: "Manage",
};

describe("DesktopWindowContext", () => {
  it("keeps history, hierarchy, and project scope in one stable control", () => {
    const markup = renderToStaticMarkup(<DesktopWindowContext {...props} />);

    expect(markup).toContain("Manage");
    expect(markup).toContain("Settings");
    expect(markup).toContain("doolittle");
    expect(markup).toContain('aria-label="Workspace breadcrumb"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Navigation history");
    expect(markup).toContain('aria-label="Back to Workspace"');
    expect(markup).toContain('aria-label="Go forward"');
    expect(markup).toContain("disabled");
  });
});
