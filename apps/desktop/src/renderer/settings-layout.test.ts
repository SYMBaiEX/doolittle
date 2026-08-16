import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("settings layout density", () => {
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
