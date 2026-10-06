// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { type ContextAction, ContextActionMenu } from "./context-action-menu";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("ContextActionMenu", () => {
  let container: HTMLDivElement;
  let root: Root;
  let action: Mock<() => void>;
  let items: readonly ContextAction[];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    action = vi.fn();
    items = [{ id: "open", label: "Open conversation", onSelect: action }];
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.getSelection()?.removeAllRanges();
    vi.restoreAllMocks();
  });

  async function render(scopeKey = "conversation-a", disabled = false) {
    await act(async () =>
      root.render(
        <ContextActionMenu
          disabled={disabled}
          items={items}
          label="Conversation actions"
          scopeKey={scopeKey}
          trigger={<button type="button">More actions</button>}
        >
          <button type="button" data-target>
            Conversation
          </button>
        </ContextActionMenu>,
      ),
    );
  }
  function target() {
    const element = container.querySelector<HTMLElement>("[data-target]");
    if (!element) throw new Error("Missing context target");
    return element;
  }
  function menu() {
    return document.body.querySelector<HTMLElement>('[role="menu"]');
  }
  async function rightClick(element = target()) {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 240,
      clientY: 180,
      button: 2,
    });
    await act(async () => element.dispatchEvent(event));
    return event;
  }

  it("opens real SDK menu actions at a pointer anchor without changing row geometry", async () => {
    await render();
    const event = await rightClick();
    expect(event.defaultPrevented).toBe(true);
    expect(menu()?.getAttribute("aria-label")).toBe("Conversation actions");
    expect(menu()?.getAttribute("aria-labelledby")).toBeNull();
    const wrapper = container.querySelector("[data-context-action-menu]");
    expect(wrapper?.className).toBe("contents");
    expect(wrapper?.getAttribute("tabindex")).toBeNull();
    expect(wrapper?.getAttribute("data-doolittle-context-menu")).toBe("custom");
    const anchor = document.body.querySelector<HTMLButtonElement>(
      ".dl-action-menu-anchor",
    );
    expect(anchor?.style.left).toBe("240px");
    expect(anchor?.style.top).toBe("180px");
    expect(anchor?.tabIndex).toBe(-1);
    expect(anchor?.getAttribute("aria-hidden")).toBe("true");
    const item = menu()?.querySelector<HTMLElement>('[role="menuitem"]');
    expect(item?.textContent).toBe("Open conversation");
    await act(async () => item?.click());
    expect(action).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });

  it("offers the identical actions through the explicit overflow button", async () => {
    await render();
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-haspopup="menu"]',
    );
    expect(trigger?.getAttribute("aria-label")).toBe("Conversation actions");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(trigger?.getAttribute("aria-controls")).toBe(menu()?.id);
    await act(async () =>
      menu()?.querySelector<HTMLElement>('[role="menuitem"]')?.click(),
    );
    expect(action).toHaveBeenCalledTimes(1);
  });

  it.each([
    { key: "F10", shiftKey: true },
    { key: "ContextMenu", shiftKey: false },
  ])(
    "opens with $key and restores the actual invoker on Escape",
    async (keys) => {
      await render();
      target().focus();
      const event = new KeyboardEvent("keydown", {
        ...keys,
        bubbles: true,
        cancelable: true,
      });
      await act(async () => target().dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(menu()).not.toBeNull();
      await act(async () =>
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      expect(menu()).toBeNull();
      await vi.waitFor(() => expect(document.activeElement).toBe(target()));
    },
  );

  it("does not intercept native editing, links, selected text or owned embedded menus", async () => {
    await act(async () =>
      root.render(
        <ContextActionMenu items={items} label="Actions">
          <textarea />
          <input />
          <select />
          <span contentEditable />
          <a href="https://example.test">Reference document</a>
          <div className="monaco-editor">
            <span>Code</span>
          </div>
          <div className="xterm">
            <span>Terminal</span>
          </div>
          <iframe title="Embedded" />
          <div data-native-context-menu>
            <span>Owned</span>
          </div>
          <button type="button" data-target>
            Selected text
          </button>
        </ContextActionMenu>,
      ),
    );
    for (const element of container.querySelectorAll<HTMLElement>(
      "textarea,input,select,[contenteditable],a,.monaco-editor span,.xterm span,iframe,[data-native-context-menu] span",
    )) {
      expect((await rightClick(element)).defaultPrevented).toBe(false);
      expect(menu()).toBeNull();
    }
    const range = document.createRange();
    range.selectNodeContents(target());
    document.getSelection()?.addRange(range);
    expect((await rightClick()).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
  });

  it("honors nested handlers and opens only the nearest custom menu", async () => {
    const outerAction = vi.fn();
    await act(async () =>
      root.render(
        <ContextActionMenu
          items={[
            { id: "outer", label: "Outer action", onSelect: outerAction },
          ]}
          label="Outer"
        >
          <ContextActionMenu items={items} label="Inner">
            <button data-target type="button">
              Inner target
            </button>
          </ContextActionMenu>
        </ContextActionMenu>,
      ),
    );
    await rightClick();
    expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(menu()?.getAttribute("aria-label")).toBe("Inner");
    expect(outerAction).not.toHaveBeenCalled();
  });

  it("honors a child which has already handled its context interaction", async () => {
    await act(async () =>
      root.render(
        <ContextActionMenu items={items} label="Actions">
          <button
            data-target
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => event.preventDefault()}
            type="button"
          >
            Own menu
          </button>
        </ContextActionMenu>,
      ),
    );
    await rightClick();
    expect(menu()).toBeNull();
    await act(async () =>
      target().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(menu()).toBeNull();
  });

  it("uses SDK keyboard navigation to skip unavailable actions", async () => {
    const lastAction = vi.fn();
    items = [
      ...items,
      {
        id: "disabled",
        label: "Unavailable action",
        disabled: true,
        onSelect: action,
      },
      {
        id: "close",
        label: "Close view",
        destructive: true,
        separatorBefore: true,
        shortcut: "⌘W",
        onSelect: lastAction,
      },
    ];
    await render();
    target().focus();
    await act(async () =>
      target().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ContextMenu",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    const available = Array.from(
      menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    ).filter((item) => !item.hasAttribute("data-disabled"));
    await vi.waitFor(() => expect(document.activeElement).toBe(available[0]));
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(available[1]));
    expect(available[1]?.getAttribute("data-destructive")).toBe("true");
    expect(available[1]?.textContent).toContain("⌘W");
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(lastAction).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });

  it("leaves disabled/empty surfaces native and skips disabled actions", async () => {
    await render("conversation-a", true);
    expect((await rightClick()).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
    expect(container.querySelector("[data-doolittle-context-menu]")).toBeNull();
    items = [];
    await render();
    expect((await rightClick()).defaultPrevented).toBe(false);
    items = [
      {
        id: "open",
        label: "Open conversation",
        disabled: true,
        onSelect: action,
      },
    ];
    await render();
    await rightClick();
    const item = menu()?.querySelector<HTMLElement>('[role="menuitem"]');
    expect(item?.hasAttribute("data-disabled")).toBe(true);
    await act(async () => item?.click());
    expect(action).not.toHaveBeenCalled();
  });

  it("uses the latest callback and revokes an open menu on identity change", async () => {
    await render();
    await rightClick();
    const updated = vi.fn();
    items = [{ id: "open", label: "Open conversation", onSelect: updated }];
    await render();
    await act(async () =>
      menu()?.querySelector<HTMLElement>('[role="menuitem"]')?.click(),
    );
    expect(action).not.toHaveBeenCalled();
    expect(updated).toHaveBeenCalledTimes(1);
    await rightClick();
    await render("conversation-b");
    expect(menu()).toBeNull();
  });

  it("closes when the actual invoking target is removed", async () => {
    await render();
    await rightClick();
    await act(async () => target().remove());
    expect(menu()).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("does not let delayed close autofocus dismiss an immediately reopened menu", async () => {
    await render();
    await rightClick();
    await act(async () =>
      menu()?.querySelector<HTMLElement>('[role="menuitem"]')?.click(),
    );
    expect(action).toHaveBeenCalledTimes(1);
    await rightClick();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(menu()).not.toBeNull();
    await act(async () =>
      menu()?.querySelector<HTMLElement>('[role="menuitem"]')?.click(),
    );
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("preserves focus intentionally moved by an action before delayed restoration", async () => {
    items = [
      {
        id: "edit",
        label: "Edit",
        onSelect: () => {
          setTimeout(
            () => container.querySelector<HTMLInputElement>("input")?.focus(),
            0,
          );
        },
      },
    ];
    await act(async () =>
      root.render(
        <ContextActionMenu items={items} label="Actions">
          <button data-target type="button">
            Open editor
          </button>
          <input aria-label="Edit destination" />
        </ContextActionMenu>,
      ),
    );
    await rightClick();
    await act(async () =>
      menu()?.querySelector<HTMLElement>('[role="menuitem"]')?.click(),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(document.activeElement).toBe(container.querySelector("input"));
  });

  it("restores keyboard focus to a native summary without opening its details", async () => {
    await act(async () =>
      root.render(
        <ContextActionMenu items={items} label="Tool actions">
          <details>
            <summary data-target>Tool steps</summary>
            <button type="button">Hidden tool action</button>
          </details>
        </ContextActionMenu>,
      ),
    );
    target().focus();
    await act(async () =>
      target().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ContextMenu",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await act(async () =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(target()));
    expect(container.querySelector("details")?.open).toBe(false);
  });
});
