// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageContent } from "./MessageContent";
import type { ParsedAgentMessage } from "./message-output";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const parsed: ParsedAgentMessage = {
  text: "",
  steps: { continued: 0, failed: 0, finished: 0 },
  tools: [
    {
      id: "tool-first",
      name: "READ_FILE",
      status: "completed",
      output: "First tool output",
    },
    {
      id: "tool-second",
      name: "WEB_SEARCH",
      status: "completed",
      output: {
        results: [
          {
            title: "Docs",
            url: "https://example.com/docs",
            excerpt: "Evidence",
          },
        ],
      },
    },
  ],
};

describe("Tool activity context actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let clipboardDescriptor: PropertyDescriptor | undefined;
  const copy = vi.fn(async (_text: string) => {});
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copy },
    });
    copy.mockClear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.getSelection()?.removeAllRanges();
    if (clipboardDescriptor)
      Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    else Reflect.deleteProperty(navigator, "clipboard");
  });
  async function render(value = parsed) {
    await act(async () =>
      root.render(<MessageContent content="" parsedAgentMessage={value} />),
    );
  }
  async function openMenu(target: Element | null) {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    await act(async () => target?.dispatchEvent(event));
    return event;
  }
  function menuItem(label: string) {
    return [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === label);
  }

  it("expands/collapses existing activity without remounting its disclosure", async () => {
    await render();
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
    await openMenu(container.querySelector("summary"));
    await act(async () => menuItem("Expand tool activity")?.click());
    expect(details?.open).toBe(true);
    expect(container.querySelector("details")).toBe(details);
    await openMenu(container.querySelector("summary"));
    await act(async () => menuItem("Collapse tool activity")?.click());
    expect(details?.open).toBe(false);
  });
  it("copies the exact right-clicked step instead of the selected latest step", async () => {
    await render();
    await openMenu(container.querySelector("[data-tool-card]"));
    await act(async () => menuItem("Copy tool output")?.click());
    expect(copy).toHaveBeenCalledExactlyOnceWith("First tool output");
    expect(
      container
        .querySelectorAll("[data-tool-card]")[1]
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("blocks unavailable output and closes the group menu when selection changes", async () => {
    await render({
      ...parsed,
      tools: [{ id: "empty", name: "READ_FILE", status: "running" }],
    });
    await openMenu(container.querySelector("summary"));
    expect(menuItem("Copy tool output")?.getAttribute("aria-disabled")).toBe(
      "true",
    );
    await act(async () => menuItem("Copy tool output")?.click());
    expect(copy).not.toHaveBeenCalled();
    await render();
    await openMenu(container.querySelector("summary"));
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[data-tool-card]")?.click(),
    );
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
  it("preserves native link and selected-output text menus", async () => {
    await render();
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect((await openMenu(link)).defaultPrevented).toBe(false);
    const output = container.querySelector("pre code");
    expect(output).not.toBeNull();
    const range = document.createRange();
    if (output) range.selectNodeContents(output);
    document.getSelection()?.addRange(range);
    expect((await openMenu(output)).defaultPrevented).toBe(false);
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
