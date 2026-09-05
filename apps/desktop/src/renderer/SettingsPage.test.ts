import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { settingsResourcePolicy } from "./SettingsPage";
import {
  settingsSectionForView,
  settingsViewForSection,
} from "./settings/settings-sections";

const settingsPageSource = readFileSync(
  new URL("./SettingsPage.tsx", import.meta.url),
  "utf8",
);
const settingsNavigationSource = readFileSync(
  new URL("./settings/SettingsNavigation.tsx", import.meta.url),
  "utf8",
);
const modelsPageSource = readFileSync(
  new URL("./ModelsPage.tsx", import.meta.url),
  "utf8",
);

describe("settings resource policy", () => {
  it("keeps the settings document active while deferring unrelated detail reads", () => {
    expect(settingsResourcePolicy("advanced", true)).toEqual({
      settings: true,
      themes: false,
      desktop: false,
      execution: false,
    });
    expect(settingsResourcePolicy("advanced", false)).toEqual({
      settings: false,
      themes: false,
      desktop: false,
      execution: false,
    });
  });

  it("activates detail resources only when their category becomes visible", () => {
    expect(settingsResourcePolicy("appearance", true)).toMatchObject({
      settings: true,
      themes: true,
      desktop: false,
      execution: false,
    });
    expect(settingsResourcePolicy("execution", true)).toMatchObject({
      settings: true,
      themes: false,
      desktop: false,
      execution: true,
    });
    expect(settingsResourcePolicy("model", true)).toMatchObject({
      settings: true,
      themes: false,
      desktop: false,
      execution: false,
    });
    expect(settingsResourcePolicy("desktop", true)).toEqual({
      settings: true,
      themes: false,
      desktop: true,
      execution: false,
    });
    expect(settingsResourcePolicy("advanced", true)).toEqual({
      settings: true,
      themes: false,
      desktop: false,
      execution: false,
    });
  });

  it("keeps the category rail concise without repeating page-level copy", () => {
    expect(settingsPageSource).toContain(
      'useState<string>(section ?? "appearance")',
    );
    expect(settingsPageSource).toContain('id: "accounts"');
    expect(settingsPageSource).toContain("LazyConnectionsPage");
    expect(settingsPageSource).not.toContain('from "./ModelsPage"');
    expect(settingsPageSource).toContain("LazyModelsPage");
    expect(settingsPageSource).not.toContain("settings-nav-title");
    expect(settingsPageSource).not.toContain("settings-nav-note");
    expect(settingsNavigationSource).toContain("title={entry.description}");
    expect(settingsNavigationSource).toMatch(
      /aria-label=\{`\$\{entry\.label\}: \$\{entry\.description\}`\}/u,
    );
    expect(settingsNavigationSource).toContain(
      'aria-current={category === entry.id ? "page" : undefined}',
    );
    expect(settingsPageSource).not.toContain("<i>{entry.count}</i>");
    expect(settingsPageSource).not.toContain(
      "Accounts, appearance, models, execution, and local desktop behavior",
    );
  });

  it("loads model-only UI behind an accessible suspense boundary", () => {
    expect(settingsPageSource).toContain("import { Suspense");
    expect(settingsPageSource).toContain("fallback={<LoadingBlock");
    expect(settingsPageSource).toContain('label="Loading model settings…"');
    expect(settingsPageSource).toContain("<LazyModelsPage");
    expect(settingsPageSource).toContain("settingsResource={settings}");
    expect(settingsPageSource).toContain("<LazyConnectionsPage");
  });

  it("maps the existing canonical settings destinations into one shell", () => {
    expect(settingsSectionForView("settings")).toBeUndefined();
    expect(settingsSectionForView("models")).toBe("model");
    expect(settingsSectionForView("connections")).toBe("accounts");
    expect(settingsSectionForView("tools")).toBeUndefined();
    expect(settingsViewForSection("model")).toBe("models");
    expect(settingsViewForSection("accounts")).toBe("connections");
    expect(settingsViewForSection("execution")).toBe("settings");
  });

  it("lets the model panel share the shell settings resource", () => {
    expect(modelsPageSource).toContain(
      "settingsResource?: ApiResource<SettingsResponse>",
    );
    expect(modelsPageSource).toContain(
      "!settingsResource && resourcePolicy.primary",
    );
    expect(modelsPageSource).toContain("settingsResource ?? ownedSettings");
  });

  it("offers search only for categories backed by runtime fields", () => {
    expect(settingsPageSource).toContain("categorySupportsSearch");
    expect(settingsPageSource).toContain('"appearance"');
    expect(settingsPageSource).toContain('"desktop"');
    expect(settingsPageSource).toContain('"model"');
    expect(settingsPageSource).toContain("{categorySupportsSearch ? (");
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
