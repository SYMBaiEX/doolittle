import { describe, expect, it } from "vitest";
import { hasRenderedBrowserEvidence } from "../types/browser";

describe("rendered browser evidence", () => {
  it("requires an explicit rendered-page receipt with readiness and an artifact", () => {
    expect(
      hasRenderedBrowserEvidence({
        captureMode: "rendered-page",
        captureReady: true,
        screenshotPath: "/tmp/page.png",
      }),
    ).toBe(true);
  });

  it.each([
    "pixel",
    "raster",
    "browser",
    "screenshot",
    "capture-card",
    "placeholder",
    "structured",
    undefined,
  ])("does not mistake %s or its PNG for a page screenshot", (captureMode) => {
    expect(
      hasRenderedBrowserEvidence({
        captureMode,
        captureReady: true,
        screenshotPath: "/tmp/card.png",
      }),
    ).toBe(false);
  });

  it.each([
    { captureReady: false, screenshotPath: "/tmp/page.png" },
    { captureReady: undefined, screenshotPath: "/tmp/page.png" },
    { captureReady: true, screenshotPath: " " },
    { captureReady: true, screenshotPath: undefined },
  ])("fails closed for missing readiness or artifact %j", (receipt) => {
    expect(
      hasRenderedBrowserEvidence({ captureMode: "rendered-page", ...receipt }),
    ).toBe(false);
  });
});
