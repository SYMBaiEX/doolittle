import type { BrowserWindowConstructorOptions } from "electron";

/** Capture-only policy; the ordinary desktop UI does not use this factory. */
export function captureWindowOptions(
  options: BrowserWindowConstructorOptions,
  platform: NodeJS.Platform,
  primaryDisplayScale: () => number,
): BrowserWindowConstructorOptions {
  if (platform !== "linux") return options;
  const scale = primaryDisplayScale();
  // The rendered-capture consumer accepts DPR1..4. Refuse unsupported displays
  // before allocation rather than clamping and silently changing fidelity.
  if (!Number.isFinite(scale) || scale < 1 || scale > 4)
    throw new Error("Capture display scale is unavailable.");
  // An intentional primary-display policy, not preservation of implicit
  // native-window placement on multi-display hosts. OSR defaults to DPR1.
  return {
    ...options,
    webPreferences: {
      ...options.webPreferences,
      offscreen: { useSharedTexture: false, deviceScaleFactor: scale },
    },
  };
}
