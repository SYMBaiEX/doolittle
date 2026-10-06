// @vitest-environment jsdom
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import type { BrowserWindow, ContextMenuParams, Event } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contextMenuHttpsLink,
  mainWindowContextMenuItems,
  nativeContextMenuTargetScript,
  registerMainWindowContextMenu,
} from "./context-menu";

const editFlags = {
  canUndo: false,
  canRedo: true,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canDelete: true,
  canSelectAll: true,
  canEditRichly: false,
};
function menuParams(overrides: Partial<ContextMenuParams> = {}) {
  return {
    x: 80,
    y: 40,
    pageURL: "file:///application/renderer/index.html",
    isEditable: true,
    formControlType: "text-area",
    editFlags,
    selectionText: "",
    linkURL: "",
    menuSourceType: "mouse",
    ...overrides,
  } as ContextMenuParams;
}
const dependencies = () => ({
  copyLink: vi.fn(),
  openLink: vi.fn(async () => undefined),
});

describe("native editing menu items", () => {
  it("uses only standard roles and actual edit availability", () => {
    const items = mainWindowContextMenuItems(menuParams(), dependencies());
    expect(items.filter((item) => item.role)).toEqual([
      { role: "undo", enabled: false },
      { role: "redo", enabled: true },
      { role: "cut", enabled: true },
      { role: "copy", enabled: true },
      { role: "paste", enabled: true },
      { role: "selectAll", enabled: true },
    ]);
    expect(items.every((item) => !item.click)).toBe(true);
  });

  it("does not copy or cut password values or retain field text in templates", () => {
    const params = menuParams({
      formControlType: "input-password",
      selectionText: "private-value",
    });
    const items = mainWindowContextMenuItems(params, dependencies());
    expect(items.find((item) => item.role === "copy")?.enabled).toBe(false);
    expect(items.find((item) => item.role === "cut")?.enabled).toBe(false);
    expect(items.find((item) => item.role === "paste")?.enabled).toBe(true);
    expect(JSON.stringify(items)).not.toContain("private-value");
  });

  it("offers selection copy but no mutation commands for ordinary page text", () => {
    const params = menuParams({
      isEditable: false,
      selectionText: "selected words",
    });
    expect(mainWindowContextMenuItems(params, dependencies())).toEqual([
      { role: "copy" },
      { role: "selectAll" },
    ]);
    expect(
      mainWindowContextMenuItems(
        { ...params, selectionText: "" },
        dependencies(),
      ),
    ).toEqual([]);
    expect(
      mainWindowContextMenuItems(
        { ...params, editFlags: { ...editFlags, canCopy: false } },
        dependencies(),
      ),
    ).toEqual([]);
  });

  it.each([
    "javascript:alert(1)",
    "file:///private",
    "http://example.test",
    "mailto:user@example.test",
    "https://user:password@example.test",
    "not-a-link",
    `https://example.test/${"a".repeat(4_096)}`,
  ])("rejects unsafe external link %s", (value) => {
    expect(contextMenuHttpsLink(value)).toBeNull();
    expect(
      mainWindowContextMenuItems(
        menuParams({ isEditable: false, linkURL: value }),
        dependencies(),
      ),
    ).toEqual([]);
  });

  it("copies valid HTTPS links and delegates opening to host confirmation", async () => {
    const deps = dependencies();
    const items = mainWindowContextMenuItems(
      menuParams({ isEditable: false, linkURL: "https://example.test/help" }),
      deps,
    );
    expect(items.map((item) => item.label)).toEqual([
      "Copy link",
      "Open link in browser…",
    ]);
    items[0].click?.({} as never, {} as never, {} as never);
    items[1].click?.({} as never, {} as never, {} as never);
    expect(deps.copyLink).toHaveBeenCalledWith("https://example.test/help");
    expect(deps.openLink).toHaveBeenCalledWith("https://example.test/help");
    deps.openLink.mockRejectedValueOnce(new Error("Browser unavailable"));
    items[1].click?.({} as never, {} as never, {} as never);
    await Promise.resolve();
    items[1].click?.({} as never, {} as never, {} as never);
    expect(deps.openLink).toHaveBeenCalledTimes(3);
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function targetAllowed(html: string, hasSelection = false) {
  document.body.innerHTML = html;
  const target = document.querySelector("[data-target]");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => target),
  });
  return runInNewContext(
    nativeContextMenuTargetScript(80, 40, hasSelection) as string,
    { document, ShadowRoot },
  );
}

describe("read-only target classification", () => {
  it("preserves editable fields, links and selected text inside custom entity wrappers", () => {
    expect(
      targetAllowed(
        "<div data-doolittle-context-menu><textarea data-target></textarea></div>",
      ),
    ).toBe(true);
    expect(
      targetAllowed(
        "<div data-doolittle-context-menu><input data-target></div>",
      ),
    ).toBe(true);
    expect(
      targetAllowed(
        "<div data-doolittle-context-menu><select data-target></select></div>",
      ),
    ).toBe(true);
    expect(
      targetAllowed(
        '<div data-doolittle-context-menu><span contenteditable="true" data-target></span></div>',
      ),
    ).toBe(true);
    expect(
      targetAllowed(
        '<div data-doolittle-context-menu><a href="https://example.test" data-target>Link</a></div>',
      ),
    ).toBe(true);
    expect(
      targetAllowed(
        "<div data-doolittle-context-menu><span data-target>Selected</span></div>",
        true,
      ),
    ).toBe(true);
    expect(
      targetAllowed(
        "<div data-doolittle-context-menu><span data-target>Entity</span></div>",
      ),
    ).toBe(false);
    expect(
      targetAllowed(
        '<div data-doolittle-context-menu><span contenteditable="false" data-target>Entity</span></div>',
      ),
    ).toBe(false);
  });

  it.each(["monaco-editor", "xterm"])(
    "leaves %s to its existing editor or PTY permission route",
    (className) => {
      expect(
        targetAllowed(
          `<div class="${className}"><textarea data-target></textarea></div>`,
          true,
        ),
      ).toBe(false);
    },
  );

  it("excludes embedded frames and detached targets", () => {
    expect(targetAllowed("<iframe data-target></iframe>", true)).toBe(false);
    expect(targetAllowed("<webview data-target></webview>", true)).toBe(false);
    expect(targetAllowed("<div></div>")).toBe(false);
  });

  it("checks specialized shadow hosts without reading field or selection values", () => {
    const host = document.createElement("div");
    host.className = "xterm";
    const shadow = host.attachShadow({ mode: "open" });
    const field = document.createElement("textarea");
    shadow.append(field);
    document.body.append(host);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => field,
    });
    const source = nativeContextMenuTargetScript(80, 40, true) as string;
    expect(runInNewContext(source, { document, ShadowRoot })).toBe(false);
    expect(source).not.toMatch(
      /getSelection|textContent|innerText|\.value|focus\(|dispatchEvent/,
    );
  });

  it.each([
    [-1, 40],
    [80, Number.NaN],
    [Number.POSITIVE_INFINITY, 40],
    [80.5, 40],
    [1_000_001, 40],
  ])("rejects invalid coordinates %s,%s", (x, y) => {
    expect(nativeContextMenuTargetScript(x, y, false)).toBeNull();
  });
});

function harness() {
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: vi.fn(() => false),
    getURL: vi.fn(() => "file:///application/renderer/index.html"),
    executeJavaScript: vi.fn(async (_source: string) => true),
  });
  const window = {
    webContents: contents,
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
  };
  const menu = { popup: vi.fn(), closePopup: vi.fn() };
  const deps = { ...dependencies(), buildMenu: vi.fn(() => menu) };
  const dispose = registerMainWindowContextMenu(
    window as unknown as BrowserWindow,
    deps,
  );
  const emit = (
    overrides: Partial<ContextMenuParams> = {},
    prevented = false,
  ) => {
    const event = { defaultPrevented: prevented, preventDefault: vi.fn() };
    contents.emit(
      "context-menu",
      event as unknown as Event,
      menuParams({ frame: contents.mainFrame as never, ...overrides }),
    );
    return event;
  };
  return { contents, window, menu, deps, dispose, emit };
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("main window native menu lifecycle", () => {
  it("targets only the live main window and frame", async () => {
    const h = harness();
    const event = h.emit();
    await flush();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(h.menu.popup).toHaveBeenCalledWith(
      expect.objectContaining({
        window: h.window,
        frame: h.contents.mainFrame,
        x: 80,
        y: 40,
        sourceType: "mouse",
      }),
    );
    expect(h.contents.executeJavaScript).toHaveBeenCalledOnce();
    h.dispose();
  });

  it("rejects subframes, changed pages, hidden windows, invalid targets and prevented events", async () => {
    const h = harness();
    h.emit({ frame: {} as never });
    h.emit({ pageURL: "https://untrusted.example" });
    h.emit({ x: Number.NaN });
    h.emit({}, true);
    h.window.isVisible.mockReturnValue(false);
    h.emit();
    await flush();
    expect(h.contents.executeJavaScript).not.toHaveBeenCalled();
    expect(h.menu.popup).not.toHaveBeenCalled();
    h.dispose();
  });

  it("does not supersede custom menus and retries after a failed DOM classification", async () => {
    const h = harness();
    h.contents.executeJavaScript.mockResolvedValueOnce(false);
    h.emit();
    await flush();
    expect(h.menu.popup).not.toHaveBeenCalled();
    h.contents.executeJavaScript.mockRejectedValueOnce(
      new Error("Renderer unavailable"),
    );
    h.emit();
    await flush();
    expect(h.menu.popup).not.toHaveBeenCalled();
    h.emit();
    await flush();
    expect(h.menu.popup).toHaveBeenCalledOnce();
    h.dispose();
  });

  it("does not run a DOM query for an ordinary non-actionable background", async () => {
    const h = harness();
    h.emit({ isEditable: false });
    await flush();
    expect(h.contents.executeJavaScript).not.toHaveBeenCalled();
    expect(h.menu.popup).not.toHaveBeenCalled();
    h.dispose();
  });

  it("rejects pending menus after teardown and never closes a destroyed window", async () => {
    const h = harness();
    let finish: ((allowed: boolean) => void) | undefined;
    h.contents.executeJavaScript.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    h.emit();
    h.dispose();
    finish?.(true);
    await flush();
    expect(h.menu.popup).not.toHaveBeenCalled();

    const second = harness();
    second.emit();
    await flush();
    second.window.isDestroyed.mockReturnValue(true);
    second.dispose();
    expect(second.menu.closePopup).not.toHaveBeenCalled();
  });

  it("rejects late classifications after navigation and newer invocations", async () => {
    const h = harness();
    let finish: ((allowed: boolean) => void) | undefined;
    h.contents.executeJavaScript.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    h.emit();
    h.contents.emit("did-start-navigation");
    finish?.(true);
    await flush();
    expect(h.menu.popup).not.toHaveBeenCalled();
    h.contents.executeJavaScript.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    h.emit();
    h.emit();
    await flush();
    finish?.(true);
    await flush();
    expect(h.menu.popup).toHaveBeenCalledOnce();
    h.dispose();
  });

  it("closes menus and removes listeners on teardown without registering another contents", async () => {
    const h = harness();
    h.emit();
    await flush();
    h.contents.emit("destroyed");
    expect(h.menu.closePopup).toHaveBeenCalledWith(h.window);
    expect(h.contents.listenerCount("context-menu")).toBe(0);
    expect(h.contents.listenerCount("did-start-navigation")).toBe(0);
    h.dispose();
    h.emit();
    await flush();
    expect(h.menu.popup).toHaveBeenCalledOnce();
  });
});
