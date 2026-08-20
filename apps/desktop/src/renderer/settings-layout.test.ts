import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SETTINGS_CONTENT_CLASS,
  SETTINGS_CONTENT_HEADER_CLASS,
  SETTINGS_LAYOUT_CLASS,
  SETTINGS_PAGE_CLASS,
  SETTINGS_ROW_LAYOUT_CLASS,
} from "./settings/settings-layout";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("settings layout density", () => {
  it("pins every category to the top of the settings workspace", () => {
    expect(SETTINGS_LAYOUT_CLASS).toContain("content-start");
    expect(SETTINGS_LAYOUT_CLASS).toContain("items-start");
    expect(SETTINGS_CONTENT_CLASS).toContain("content-start");
    expect(SETTINGS_CONTENT_CLASS).toContain("self-start");
    expect(SETTINGS_PAGE_CLASS).toContain("!gap-1.5");
    expect(SETTINGS_PAGE_CLASS).toContain("[&>.page-header]:!min-h-12");
  });

  it("keeps category headers, rows, and panels on the compact rhythm", () => {
    expect(SETTINGS_CONTENT_HEADER_CLASS).toContain("min-h-8.5");
    expect(SETTINGS_ROW_LAYOUT_CLASS).toContain("min-h-9");
    expect(SETTINGS_ROW_LAYOUT_CLASS).toContain("py-1.5");
  });

  it("keeps embedded section headings below the page hierarchy", () => {
    const layout = read("./settings/settings-layout.ts");

    expect(layout).toContain("[&_.settings-section-header_h2]:text-sm");
    expect(layout).not.toContain("[&_.settings-section-header_h2]:text-base");
    expect(layout).not.toContain("[&_.settings-section-header_h2]:text-xl");
  });

  it("uses the shared meta scale for inline descriptions", () => {
    const layout = read("./settings/settings-layout.ts");

    expect(layout).toContain(
      "[&>div:first-child_small]:text-[length:var(--text-meta)]",
    );
    expect(layout).not.toContain("[&>div:first-child_small]:text-[8px]");
  });

  it("keeps every visible settings label at or above the meta scale", () => {
    for (const path of [
      "./settings/settings-layout.ts",
      "./settings/SettingsAppearancePanel.tsx",
      "./settings/SettingsExecutionStatusPanel.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/text-\[(?:8|9)px\]/);
    }
  });
});
