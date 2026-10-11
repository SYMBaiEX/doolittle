// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaneTabs } from "./PaneTabs";

const options = [
  { id: "files", label: "Files", count: 0 },
  { id: "changes", label: "Changes", count: 3 },
] as const;

describe("PaneTabs quiet selection and keyboard access", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("uses roving focus and Home/End without selected fill or underline", () => {
    function Harness() {
      const [value, setValue] = useState<"files" | "changes">("files");
      return (
        <PaneTabs
          label="Explorer"
          options={options}
          panelId="explorer"
          value={value}
          onChange={setValue}
        />
      );
    }
    act(() => root.render(<Harness />));
    const tabs = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1]);
    for (const key of ["End", "Home", "ArrowLeft"]) {
      const active = container.querySelector<HTMLButtonElement>(
        '[role="tab"][aria-selected="true"]',
      );
      act(() =>
        active?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      const selected = container.querySelector<HTMLButtonElement>(
        '[role="tab"][aria-selected="true"]',
      );
      expect(document.activeElement).toBe(selected);
      expect(selected?.className).toContain("font-semibold");
      expect(selected?.className).not.toContain("after:");
      expect(selected?.className).not.toContain("selected bg-");
    }
    expect(tabs[0]?.textContent).toBe("Files0");
    expect(
      container
        .querySelector('[role="tablist"]')
        ?.getAttribute("aria-orientation"),
    ).toBe("horizontal");
  });

  it("keeps a control reachable when an async option refresh removes the current value", () => {
    const onChange = vi.fn();
    act(() =>
      root.render(
        <PaneTabs
          label="Explorer"
          options={options}
          panelId="explorer"
          value="files"
          onChange={onChange}
        />,
      ),
    );
    act(() =>
      root.render(
        <PaneTabs
          label="Explorer"
          options={[options[1]]}
          panelId="explorer"
          value="files"
          onChange={onChange}
        />,
      ),
    );
    const remaining =
      container.querySelector<HTMLButtonElement>('[role="tab"]');
    expect(remaining?.tabIndex).toBe(0);
    expect(remaining?.getAttribute("aria-selected")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
    act(() => remaining?.click());
    expect(onChange).toHaveBeenCalledWith("changes");
  });
});
