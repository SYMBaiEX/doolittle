// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SettingsFrame, SettingsMenu, SettingsTabs } from "./settings";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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
  it("keeps a separately controlled native category picker usable during section search", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    const onPickerChange = vi.fn();
    try {
      act(() =>
        root.render(
          <SettingsMenu
            items={items}
            value="desktop"
            query="unknown"
            onChange={onChange}
            pickerItems={[
              { id: "general", label: "General", description: "Preferences" },
              { id: "system", label: "System", description: "Diagnostics" },
            ]}
            pickerValue="general"
            onPickerChange={onPickerChange}
          />,
        ),
      );
      const picker = container.querySelector("select");
      expect(picker?.value).toBe("general");
      expect(picker?.options.length).toBe(2);
      expect(
        container.querySelectorAll("button[data-settings-section]"),
      ).toHaveLength(1);
      act(() => {
        if (!picker) throw new Error("Missing native category picker");
        picker.value = "system";
        picker.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(onPickerChange).toHaveBeenCalledExactlyOnceWith("system");
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
  it("renders a quiet flat icon menu without repeating Settings or adding a tagline", () => {
    const markup = renderToStaticMarkup(
      <SettingsMenu
        items={items.map(({ group: _group, ...item }) => ({
          ...item,
          icon: <svg data-testid="section-icon" />,
        }))}
        value="desktop"
        onChange={vi.fn()}
      />,
    );
    expect(markup).toContain("<h2>Settings</h2>");
    expect(markup).not.toContain("<h3>");
    expect(markup).not.toContain("Make Doolittle yours");
    expect(
      markup.match(/class="dl-settings-menu-icon" aria-hidden="true"/gu),
    ).toHaveLength(3);
  });
  it("retains the current section and clear-search action for no results", () => {
    const markup = renderToStaticMarkup(
      <SettingsMenu
        items={items}
        value="desktop"
        query="unknown"
        onChange={vi.fn()}
        onQueryChange={vi.fn()}
      />,
    );
    expect(markup.match(/data-settings-section=/gu)).toHaveLength(1);
    expect(markup).toContain('data-settings-section="desktop"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Clear search");
  });
  it("gives one selected tab a stable panel relationship and keyboard entry point", () => {
    const markup = renderToStaticMarkup(
      <SettingsTabs
        items={items}
        value="desktop"
        panelId="general-panel"
        label="General sections"
        onChange={vi.fn()}
      />,
    );
    expect(markup).toContain('role="tablist" aria-label="General sections"');
    expect(markup.match(/aria-controls="general-panel"/gu)).toHaveLength(3);
    expect(markup.match(/tabindex="0"/gu)).toHaveLength(1);
    expect(markup.match(/aria-selected="true"/gu)).toHaveLength(1);
    expect(markup).toContain('id="general-panel-tab-desktop"');
  });
  it("moves focus with arrows and Home/End without activating until selected", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    try {
      act(() =>
        root.render(
          <SettingsTabs
            items={items}
            value="desktop"
            panelId="general-panel"
            onChange={onChange}
          />,
        ),
      );
      const tabs = [
        ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      ];
      const key = (value: string) =>
        act(() =>
          document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", { key: value, bubbles: true }),
          ),
        );
      tabs[1]?.focus();
      key("ArrowRight");
      expect(document.activeElement).toBe(tabs[2]);
      key("ArrowRight");
      expect(document.activeElement).toBe(tabs[0]);
      key("ArrowLeft");
      expect(document.activeElement).toBe(tabs[2]);
      key("Home");
      expect(document.activeElement).toBe(tabs[0]);
      key("End");
      expect(document.activeElement).toBe(tabs[2]);
      expect(onChange).not.toHaveBeenCalled();
      act(() => tabs[2]?.click());
      expect(onChange).toHaveBeenCalledExactlyOnceWith("execution");
      act(() =>
        root.render(
          <SettingsTabs
            items={items}
            value="execution"
            panelId="general-panel"
            onChange={onChange}
          />,
        ),
      );
      expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
      expect(tabs[2]?.tabIndex).toBe(0);
      expect(tabs[1]?.tabIndex).toBe(-1);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
