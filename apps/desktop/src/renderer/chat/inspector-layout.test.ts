// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { THEME_MANIFEST_CHANGE_EVENT } from "../desktop-theme";
import {
  INSPECTOR_WIDTH_KEY,
  inspectorResizeBounds,
  loadInspectorWidth,
  observeInspectorGeometry,
  saveInspectorWidth,
} from "./inspector-layout";

describe("conversation inspector layout", () => {
  it("refreshes theme geometry without a pane resize and cleans up its listeners", () => {
    const panel = document.createElement("div");
    Object.defineProperty(panel, "clientWidth", { value: 1200 });
    panel.style.setProperty("--inspector-width", "320px");
    document.body.append(panel);
    const onGeometry = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    const storage = { getItem: () => "440", setItem: vi.fn() };
    const cleanup = observeInspectorGeometry(panel, onGeometry);
    try {
      expect(onGeometry).toHaveBeenLastCalledWith({
        paneWidth: 1200,
        themeWidth: 320,
      });
      panel.style.setProperty("--inspector-width", "380px");
      window.dispatchEvent(new Event(THEME_MANIFEST_CHANGE_EVENT));
      expect(onGeometry).toHaveBeenLastCalledWith({
        paneWidth: 1200,
        themeWidth: 380,
      });
      expect(inspectorResizeBounds(1200, 380).default).toBe(380);
      expect(loadInspectorWidth(storage)).toBe(440);
      expect(storage.setItem).not.toHaveBeenCalled();
      cleanup();
      window.dispatchEvent(new Event(THEME_MANIFEST_CHANGE_EVENT));
      expect(onGeometry).toHaveBeenCalledTimes(2);
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      cleanup();
      vi.unstubAllGlobals();
      panel.remove();
    }
  });
  it("retains a preferred width independently of a narrow conversation tile", () => {
    const storage = { getItem: () => "540", setItem: vi.fn() };
    expect(loadInspectorWidth(storage)).toBe(540);
    expect(inspectorResizeBounds(760)).toEqual({
      min: 280,
      max: 360,
      default: 320,
    });
    expect(inspectorResizeBounds(1400).max).toBe(560);
    expect(loadInspectorWidth(storage)).toBe(540);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reserves conversation room and clamps theme defaults to local bounds", () => {
    expect(inspectorResizeBounds(721, 450)).toEqual({
      min: 280,
      max: 321,
      default: 321,
    });
    expect(inspectorResizeBounds(1000, 380).default).toBe(380);
    expect(inspectorResizeBounds(0).max).toBe(560);
    expect(inspectorResizeBounds(Number.NaN).max).toBe(560);
  });

  it.each([null, "null", "false", '"440"', "{}", "not-json"])(
    "ignores invalid stored width %s",
    (raw) => {
      expect(loadInspectorWidth({ getItem: () => raw })).toBeNull();
    },
  );

  it("bounds valid preferences and tolerates unavailable storage", () => {
    expect(loadInspectorWidth({ getItem: () => "9999" })).toBe(560);
    expect(loadInspectorWidth({ getItem: () => "12" })).toBe(280);
    expect(
      loadInspectorWidth({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toBeNull();
    const storage = { getItem: () => null, setItem: vi.fn() };
    expect(saveInspectorWidth(storage, 440)).toBe(true);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      INSPECTOR_WIDTH_KEY,
      "440",
    );
    expect(saveInspectorWidth(storage, null)).toBe(true);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      INSPECTOR_WIDTH_KEY,
      "null",
    );
    expect(
      saveInspectorWidth(
        {
          ...storage,
          setItem: () => {
            throw new Error("full");
          },
        },
        440,
      ),
    ).toBe(false);
  });
});
