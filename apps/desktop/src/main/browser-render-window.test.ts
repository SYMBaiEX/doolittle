import { describe, expect, it, vi } from "vitest";
import { captureWindowOptions } from "./browser-render-window";

const options = Object.freeze({
  width: 1280,
  height: 720,
  useContentSize: true,
  show: false,
  skipTaskbar: true,
  webPreferences: Object.freeze({
    partition: "doolittle-capture-synthetic",
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
    backgroundThrottling: false,
    devTools: false,
  }),
});

describe("capture window platform policy", () => {
  it.each([1, 1.25, 1.5, 2, 4])(
    "preserves CSS/security options at Linux scale %s",
    (scale) => {
      const read = vi.fn(() => scale);
      expect(captureWindowOptions(options, "linux", read)).toEqual({
        ...options,
        webPreferences: {
          ...options.webPreferences,
          offscreen: { useSharedTexture: false, deviceScaleFactor: scale },
        },
      });
      expect(read).toHaveBeenCalledOnce();
      expect(Object.hasOwn(options.webPreferences, "offscreen")).toBe(false);
    },
  );
  it.each([
    NaN,
    Infinity,
    -Infinity,
    0,
    -1,
    0.5,
    4.01,
    5,
    undefined,
    "2",
    null,
  ])("refuses invalid Linux scales before construction (%s)", (scale) => {
    const construct = vi.fn();
    expect(() =>
      construct(captureWindowOptions(options, "linux", () => scale as number)),
    ).toThrow("Capture display scale is unavailable.");
    expect(construct).not.toHaveBeenCalled();
  });
  it("does not replace a failed display lookup with a fallback scale", () => {
    expect(() =>
      captureWindowOptions(options, "linux", () => {
        throw new Error("synthetic-display-failure");
      }),
    ).toThrow("synthetic-display-failure");
  });
  it.each(["darwin", "win32"] as const)(
    "leaves %s options identical without reading the display",
    (platform) => {
      const read = vi.fn(() => NaN);
      expect(captureWindowOptions(options, platform, read)).toBe(options);
      expect(read).not.toHaveBeenCalled();
    },
  );
});
