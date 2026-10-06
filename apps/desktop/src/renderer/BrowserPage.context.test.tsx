// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { browser } = vi.hoisted(() => ({
  browser: {
    address: "http://localhost:3000",
    busy: "",
    canGoBack: false,
    canGoForward: true,
    clearResult: vi.fn(),
    compare: vi.fn(),
    compareUrl: "",
    currentUrl: "http://localhost:3000",
    embedded: true,
    error: "",
    errorField: "",
    fail: vi.fn(),
    navigate: vi.fn(),
    previewSize: "responsive",
    reloadPreview: vi.fn(),
    result: null,
    resultStatusMessage: "",
    runAction: vi.fn(),
    setPreviewSize: vi.fn(),
    status: { data: {}, loading: false, error: "", reload: vi.fn() },
    statusLabel: "Ready",
    travelHistory: vi.fn(),
    updateAddress: vi.fn(),
    updateCompareUrl: vi.fn(),
  },
}));
vi.mock("./browser/useBrowserWorkspace", async () => ({
  ...(await vi.importActual<typeof import("./browser/useBrowserWorkspace")>(
    "./browser/useBrowserWorkspace",
  )),
  useBrowserWorkspace: () => browser,
}));

import { BrowserPage } from "./BrowserPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Browser context actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    browser.busy = "";
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  async function openMenu() {
    await act(async () =>
      container.querySelector("[data-browser-preview-size]")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    return [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
  }
  it("uses actual navigation and sizing actions without replacing the single iframe", async () => {
    await act(async () => root.render(<BrowserPage active />));
    const frame = container.querySelector("iframe");
    let items = await openMenu();
    expect(
      items
        .find((item) => item.textContent === "Go back")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    await act(async () =>
      items.find((item) => item.textContent === "Go forward")?.click(),
    );
    expect(browser.travelHistory).toHaveBeenCalledExactlyOnceWith(1);
    items = await openMenu();
    await act(async () =>
      items.find((item) => item.textContent === "Tablet preview")?.click(),
    );
    expect(browser.setPreviewSize).toHaveBeenCalledExactlyOnceWith("tablet");
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(container.querySelector("iframe")).toBe(frame);
  });
  it("disables tools while busy and removes browser action surfaces offline", async () => {
    browser.busy = "capture";
    await act(async () => root.render(<BrowserPage active />));
    const items = await openMenu();
    expect(
      items
        .find((item) => item.textContent === "Reload preview")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    await act(async () =>
      items.find((item) => item.textContent === "Reload preview")?.click(),
    );
    expect(browser.reloadPreview).not.toHaveBeenCalled();
    await act(async () => root.render(<BrowserPage active={false} />));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("[data-context-action-menu]")).toBeNull();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
