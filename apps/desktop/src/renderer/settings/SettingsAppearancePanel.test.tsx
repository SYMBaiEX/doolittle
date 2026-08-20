import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsAppearancePanel } from "./SettingsAppearancePanel";

const noop = vi.fn();
const emberTheme = {
  name: "ember",
  label: "Ember",
  tagline: "Warm operator signal",
  primary: "#ff6a00",
  secondary: "#ff9b42",
  amberGlow: "#ffb000",
  greenGlow: "#86b875",
};

describe("SettingsAppearancePanel", () => {
  it("keeps local appearance, density, and runtime themes in one panel", () => {
    const markup = renderToStaticMarkup(
      <SettingsAppearancePanel
        active
        activeTheme={emberTheme}
        appearance="dark"
        density="compact"
        onAppearanceChange={noop}
        onDensityChange={noop}
        onThemeExport={noop}
        onThemeImport={noop}
        onThemeChange={noop}
        themes={[emberTheme]}
      />,
    );

    expect(markup).toContain('aria-label="Application appearance"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Interface density"');
    expect(markup).toContain("Operator signal");
    expect(markup).toContain("Shareable theme file");
    expect(markup).toContain("Imported files cannot run CSS or scripts");
    expect(markup).toContain(".doolittle-theme.json,application/json");
    expect(markup).toContain("Warm operator signal");
    expect(markup).toContain("selected");
  });

  it("keeps local controls available while runtime themes are offline", () => {
    const markup = renderToStaticMarkup(
      <SettingsAppearancePanel
        active={false}
        activeTheme={null}
        appearance="system"
        density="comfortable"
        onAppearanceChange={noop}
        onDensityChange={noop}
        onThemeExport={noop}
        onThemeImport={noop}
        onThemeChange={noop}
        themes={[]}
      />,
    );

    expect(markup).toContain("Unavailable");
    expect(markup).toContain("Appearance and density remain available locally");
    expect(markup).toContain("theme-grid");
    expect(markup).toContain('hidden=""');
  });
});
