import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SETTINGS_CONTENT_HEADER_CLASS,
  SETTINGS_PAGE_CLASS,
  SETTINGS_ROW_LAYOUT_CLASS,
} from "./settings/settings-layout";

const css = readFileSync(
  new URL("../../../../packages/ui/src/styles.css", import.meta.url),
  "utf8",
);
describe("stable shared settings layout", () => {
  it("uses a fixed menu column and independently scrollable page", () => {
    expect(css).toContain("grid-template-columns: 204px minmax(0, 1fr)");
    expect(css).toContain(".dl-settings-content");
    expect(css).toContain("scrollbar-gutter: stable");
    expect(SETTINGS_PAGE_CLASS).toContain("!min-h-0 !p-0 !gap-0");
  });
  it("responds to available settings space, without a clipped horizontal rail", () => {
    expect(css).toContain("@container dl-settings (max-width: 760px)");
    expect(css).toContain(".dl-settings-mobile-select");
    expect(css).not.toContain("grid-auto-flow: column");
  });
  it("uses one title hierarchy and accessible form targets", () => {
    expect(SETTINGS_CONTENT_HEADER_CLASS).toContain("dl-settings-page-heading");
    expect(SETTINGS_ROW_LAYOUT_CLASS).toContain("min-h-10");
    expect(SETTINGS_ROW_LAYOUT_CLASS).toContain("dl-settings-field-row");
    expect(css).toContain(
      "grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr)",
    );
    expect(css).toContain("@container dl-settings-content (max-width: 600px)");
    expect(css).toContain(".setting-copy small");
    expect(css).toContain("min-height: 44px");
  });
  it("keeps dense preference rows and wrapping tabs instead of scroll rails or cards", () => {
    expect(css).toContain(".dl-settings-preference-row");
    expect(css).toContain("padding-block: 12px");
    const tabs = css.slice(
      css.indexOf(".dl-settings-tabs {"),
      css.indexOf('.dl-settings-tabs [role="tab"] {'),
    );
    expect(tabs).toContain("flex-wrap: wrap");
    expect(tabs).not.toContain("overflow-x");
  });
});
