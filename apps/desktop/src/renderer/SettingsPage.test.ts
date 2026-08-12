import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { settingsResourcePolicy } from "./SettingsPage";

const settingsPageSource = readFileSync(
  new URL("./SettingsPage.tsx", import.meta.url),
  "utf8",
);

describe("settings resource policy", () => {
  it("keeps the settings document active while deferring detail reads for providers", () => {
    expect(settingsResourcePolicy("providers", true)).toEqual({
      settings: true,
      themes: false,
      desktop: false,
      execution: false,
      runtime: false,
    });
    expect(settingsResourcePolicy("providers", false)).toEqual({
      settings: false,
      themes: false,
      desktop: false,
      execution: false,
      runtime: false,
    });
  });

  it("activates detail resources only when their category becomes visible", () => {
    expect(settingsResourcePolicy("appearance", true)).toMatchObject({
      settings: true,
      themes: true,
      desktop: false,
      execution: false,
      runtime: false,
    });
    expect(settingsResourcePolicy("execution", true)).toMatchObject({
      settings: true,
      themes: false,
      desktop: false,
      execution: true,
      runtime: false,
    });
    expect(settingsResourcePolicy("model", true)).toMatchObject({
      settings: true,
      themes: false,
      desktop: false,
      execution: false,
      runtime: true,
    });
    expect(settingsResourcePolicy("desktop", true)).toEqual({
      settings: true,
      themes: false,
      desktop: true,
      execution: false,
      runtime: false,
    });
    expect(settingsResourcePolicy("advanced", true)).toEqual({
      settings: true,
      themes: false,
      desktop: false,
      execution: false,
      runtime: false,
    });
  });

  it("keeps the category rail concise without repeating page-level copy", () => {
    expect(settingsPageSource).not.toContain("settings-nav-title");
    expect(settingsPageSource).not.toContain("settings-nav-note");
    expect(settingsPageSource).toContain("title={entry.description}");
    expect(settingsPageSource).toContain(
      'aria-current={category === entry.id ? "page" : undefined}',
    );
    expect(settingsPageSource).not.toContain("<i>{entry.count}</i>");
    expect(settingsPageSource).not.toContain(
      "Accounts, appearance, models, execution, and local desktop behavior",
    );
  });

  it("keeps advanced focused on grouped runtime fields instead of duplicating other settings panels", () => {
    expect(settingsPageSource).toContain('advanced={category === "advanced"}');
    expect(settingsPageSource).not.toContain(
      'category === "appearance" || category === "advanced"',
    );
    expect(settingsPageSource).not.toContain(
      'category === "desktop" || category === "advanced"',
    );
    expect(settingsPageSource).not.toContain(
      'category === "execution" || category === "advanced"',
    );
  });
});
