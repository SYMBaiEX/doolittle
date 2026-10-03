import { describe, expect, it } from "vitest";
import { getNativeCapabilityTruth } from "./capability-truth";

describe("browser capability truth", () => {
  it("distinguishes scoped real pixels from text cards without overstating model or interaction coverage", () => {
    const browser = getNativeCapabilityTruth("browser.browser");
    expect(browser?.summary).toContain("active managed apps");
    expect(browser?.realBehavior.join("\n")).toContain(
      "captureMode=rendered-page",
    );
    expect(browser?.realBehavior.join("\n")).toContain("captureReady=false");
    expect(browser?.degradedBehavior.join("\n")).toContain(
      "text-only fallback",
    );
    expect(browser?.caveats.join("\n")).toContain(
      "selected provider and model",
    );
    expect(browser?.caveats.join("\n")).toContain("not a human quality score");
    expect(browser?.caveats.join("\n")).toContain("no existing profiles");
    expect(JSON.stringify(browser)).not.toContain(
      "no current evidence backend captures rendered-page pixels",
    );
    expect(JSON.stringify(browser)).not.toContain("not image pixels");
  });
});
