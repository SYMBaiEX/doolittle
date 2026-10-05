import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsNavigation } from "./SettingsNavigation";

describe("SettingsNavigation", () => {
  it("renders accessible category labels and active state", () => {
    const markup = renderToStaticMarkup(
      <SettingsNavigation
        categories={[
          {
            id: "appearance",
            label: "Appearance",
            description: "Theme and display",
          },
        ]}
        category="appearance"
        onSelect={vi.fn()}
      />,
    );
    expect(markup).not.toMatch(/class="[^"]*\bselected\b/u);
    expect(markup).toContain("dl-settings-current");
    expect(markup).toContain('aria-label="Appearance: Theme and display"');
    expect(markup).toContain('aria-current="page"');
  });

  it("keeps matching groups and the active selection available without accordions", () => {
    const markup = renderToStaticMarkup(
      <SettingsNavigation
        categories={[
          {
            id: "credentials",
            label: "Credentials",
            description: "API keys and credentials",
            group: "Models & accounts",
          },
          {
            id: "logs",
            label: "Logs",
            description: "Runtime logs",
            group: "Runtime & diagnostics",
          },
        ]}
        category="credentials"
        onSelect={vi.fn()}
        onQueryChange={vi.fn()}
        query="runtime"
      />,
    );

    expect(markup).not.toContain("<details");
    expect(markup).not.toContain("<summary");
    expect(markup).toContain("<h3>Models &amp; accounts</h3>");
    expect(markup).toContain("<h3>Runtime &amp; diagnostics</h3>");
    expect(markup).toContain('aria-label="Settings section"');
    expect(markup).toContain("settings-nav-group");
    expect(markup).toContain("settings-section-search");
    expect(markup).toContain("Search settings sections");
    expect(markup).toContain("Credentials");
    expect(markup).toContain("Logs");
  });

  it("explains an empty section search while retaining the active destination", () => {
    const markup = renderToStaticMarkup(
      <SettingsNavigation
        categories={[
          {
            id: "appearance",
            label: "Appearance",
            description: "Theme and display",
          },
        ]}
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
