import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesktopUtilityLayer } from "./DesktopUtilityLayer";

const props = {
  activeView: "settings" as const,
  activity: null,
  mobileModal: true,
  onClose: () => undefined,
  onKeyDown: () => undefined,
  onPreload: () => undefined,
  onResize: () => undefined,
  onSelect: () => undefined,
  onToggleSection: () => undefined,
  openSections: new Set<string>(),
  utilityDrawerWidth: 360,
  utilityRef: { current: null },
};

describe("DesktopUtilityLayer", () => {
  it("renders the narrow utility drawer as an isolated modal sheet", () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopUtilityLayer, props),
    );

    expect(markup).toContain('class="utility-backdrop"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-label="Tools and settings"');
  });

  it("keeps the wide utility pane non-modal", () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopUtilityLayer, { ...props, mobileModal: false }),
    );

    expect(markup).not.toContain('class="utility-backdrop"');
    expect(markup).not.toContain('aria-modal="true"');
    expect(markup).not.toContain('role="dialog"');
    expect(markup).toContain('role="complementary"');
    expect(markup).toContain('aria-label="Tools and settings"');
  });
});
