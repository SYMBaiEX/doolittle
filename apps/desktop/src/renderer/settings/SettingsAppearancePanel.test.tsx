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
    expect(markup).toContain("Interface theme");
    expect(markup).toContain("Shareable theme file");
    expect(markup).toContain("Imported files cannot run CSS or scripts");
    expect(markup).toContain("typography, spacing, geometry, motion");
    expect(markup).not.toContain("linear-gradient");
    expect(markup).toContain(".doolittle-theme.json,application/json");
    expect(markup).toContain("Warm operator signal");
    expect(markup).toContain("selected");
    expect(markup).toContain('aria-pressed="true"');
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
        themes={[emberTheme]}
      />,
    );

    expect(markup).toContain("Unavailable");
    expect(markup).toContain("Appearance and density remain available locally");
    expect(markup).toContain("theme-grid");
    expect(markup).not.toContain('hidden=""');
  });

  it("keeps appearance controls while reporting a runtime theme failure with retry", () => {
    const markup = renderToStaticMarkup(
      <SettingsAppearancePanel
        active
        activeTheme={null}
        appearance="dark"
        density="comfortable"
        themes={[]}
        themesError="Theme store unavailable"
        onThemeReload={noop}
        onAppearanceChange={noop}
        onDensityChange={noop}
        onThemeExport={noop}
        onThemeImport={noop}
        onThemeChange={noop}
      />,
    );
    expect(markup).toContain('aria-label="Application appearance"');
    expect(markup).toContain("Theme store unavailable");
    expect(markup).toContain("Try again");
  });

  it("surfaces a preserved legacy-theme migration error", () => {
    const markup = renderToStaticMarkup(
      <SettingsAppearancePanel
        active
        activeTheme={emberTheme}
        appearance="dark"
        density="comfortable"
        themeMigrationError="Your previous theme is still preserved."
        onAppearanceChange={noop}
        onDensityChange={noop}
        onThemeExport={noop}
        onThemeImport={noop}
        onThemeChange={noop}
        themes={[emberTheme]}
      />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Your previous theme is still preserved.");
  });
});
