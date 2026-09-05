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
    expect(markup).toContain("selected");
    expect(markup).toContain('aria-label="Appearance: Theme and display"');
    expect(markup).toContain('aria-current="page"');
  });

  it("groups and filters stable settings sections", () => {
    const markup = renderToStaticMarkup(
      <SettingsNavigation
        categories={[
          {
            id: "credentials",
            label: "Credentials",
            description: "API keys and credentials",
            group: "Agent",
          },
          {
            id: "logs",
            label: "Logs",
            description: "Runtime logs",
            group: "Operations",
          },
        ]}
        category="credentials"
        onSelect={vi.fn()}
        onQueryChange={vi.fn()}
        query="credential"
      />,
    );

    expect(markup).toContain('aria-label="Agent"');
    expect(markup).toContain("settings-nav-group");
    expect(markup).toContain("settings-section-search");
    expect(markup).toContain("Search settings sections");
    expect(markup).toContain("Credentials");
    expect(markup).not.toContain(">Logs<");
  });
});
