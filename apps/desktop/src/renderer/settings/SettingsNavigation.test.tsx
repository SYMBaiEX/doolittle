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
});
