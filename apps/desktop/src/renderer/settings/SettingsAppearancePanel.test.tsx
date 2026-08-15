import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsAppearancePanel } from "./SettingsAppearancePanel";

const noop = vi.fn();

describe("SettingsAppearancePanel", () => {
  it("keeps local appearance, density, and runtime themes in one panel", () => {
    const markup = renderToStaticMarkup(
      <SettingsAppearancePanel
        active
        activeTheme="ember"
        appearance="dark"
        density="compact"
        onAppearanceChange={noop}
        onDensityChange={noop}
        onThemeChange={noop}
        themes={[
          {
            name: "ember",
            label: "Ember",
            tagline: "Warm operator signal",
            primary: "#ff6a00",
            secondary: "#ff9b42",
          },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Application appearance"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Interface density"');
    expect(markup).toContain("Operator signal");
    expect(markup).toContain("Warm operator signal");
    expect(markup).toContain("selected");
  });

  it("keeps local controls available while runtime themes are offline", () => {
    const markup = renderToStaticMarkup(
      <SettingsAppearancePanel
        active={false}
        appearance="system"
        density="comfortable"
        onAppearanceChange={noop}
        onDensityChange={noop}
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
