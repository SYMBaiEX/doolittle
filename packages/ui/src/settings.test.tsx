import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsFrame, SettingsMenu } from "./settings";

const items = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme",
    group: "Preferences",
  },
  {
    id: "desktop",
    label: "Desktop",
    description: "Updates",
    group: "Preferences",
  },
  {
    id: "execution",
    label: "Execution",
    description: "Permissions",
    group: "Runtime",
  },
];
describe("reusable settings compositions", () => {
  it("retains every group and menu position when the selection changes", () => {
    for (const item of items) {
      const markup = renderToStaticMarkup(
        <SettingsMenu items={items} value={item.id} onChange={vi.fn()} />,
      );
      expect(markup).not.toContain("<details");
      expect(markup).not.toMatch(/class="[^"]*\bselected\b/u);
      expect(markup.match(/data-settings-section=/gu)).toHaveLength(
        items.length,
      );
      expect(markup.match(/<h3>/gu)).toHaveLength(2);
      expect(markup.match(/aria-current="page"/gu)).toHaveLength(1);
      const positions = items.map((entry) =>
        markup.indexOf(`data-settings-section="${entry.id}"`),
      );
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
  it("offers every section in the grouped native small-screen picker", () => {
    const markup = renderToStaticMarkup(
      <SettingsMenu
        items={items}
        value="desktop"
        query="permissions"
        onChange={vi.fn()}
        onQueryChange={vi.fn()}
      />,
    );
    expect(markup.match(/<option /gu)).toHaveLength(3);
    expect(markup).toContain('value="desktop" selected=""');
    expect(markup).toContain('aria-label="Settings section"');
    expect(markup).toContain('data-settings-section="execution"');
    expect(markup).toContain('data-settings-section="desktop"');
  });
  it("is controlled and independent of runtime or desktop globals", () => {
    const markup = renderToStaticMarkup(
      <SettingsFrame
        navigation={
          <SettingsMenu items={items} value="appearance" onChange={vi.fn()} />
        }
      >
        <h1>Appearance</h1>
      </SettingsFrame>,
    );
    expect(markup).toContain("dl-settings-layout");
    expect(markup).toContain("dl-settings-content");
    expect(markup).not.toContain("window.doolittle");
  });
});
