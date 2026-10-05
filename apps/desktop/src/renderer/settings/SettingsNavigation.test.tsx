import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsNavigation } from "./SettingsNavigation";
import { SETTINGS_CATEGORIES } from "./settings-sections";

describe("SettingsNavigation", () => {
  it("renders seven icon-ready categories with a quiet active state", () => {
    const markup = renderToStaticMarkup(
      <SettingsNavigation
        categories={SETTINGS_CATEGORIES}
        category="appearance"
        onSelect={vi.fn()}
      />,
    );
    expect(markup).not.toMatch(/class="[^"]*\bselected\b/u);
    expect(markup).toContain("dl-settings-current");
    expect(markup.match(/data-settings-section=/gu)).toHaveLength(7);
    expect(markup).toContain(
      'aria-label="General: Appearance, interface and desktop behavior"',
    );
    expect(markup).toContain('data-settings-section="general"');
    expect(markup).toContain('aria-current="page"');
  });

  it("searches retained subsections directly without hiding them behind categories", () => {
    const markup = renderToStaticMarkup(
      <SettingsNavigation
        categories={SETTINGS_CATEGORIES}
        category="appearance"
        onSelect={vi.fn()}
        onQueryChange={vi.fn()}
        query="credentials"
      />,
    );

    expect(markup).not.toContain("<details");
    expect(markup).not.toContain("<summary");
    expect(markup).toContain('data-settings-section="credentials"');
    expect(markup).toContain('data-settings-section="appearance"');
    expect(markup.match(/data-settings-section=/gu)).toHaveLength(2);
    expect(markup).not.toContain('data-settings-section="logs"');
    expect(markup).toContain('aria-label="Settings section"');
    expect(markup).toContain("settings-nav-group");
    expect(markup).toContain("settings-section-search");
    expect(markup).toContain("Search settings sections");
    expect(markup.match(/<option /gu)).toHaveLength(7);
    expect(markup).toContain('value="general" selected=""');
    expect(markup).toContain("Credentials");
    expect(markup).toContain("Appearance");
  });

  it("explains an empty section search while retaining the active destination", () => {
    const markup = renderToStaticMarkup(
      <SettingsNavigation
        categories={SETTINGS_CATEGORIES}
        category="appearance"
        query="nothing matches"
        onSelect={vi.fn()}
        onQueryChange={vi.fn()}
      />,
    );
    expect(markup).toContain("No matching sections");
    expect(markup).toContain("Clear search");
    expect(markup).toContain('aria-current="page"');
  });
});
