import { describe, expect, it } from "bun:test";
import blessed from "blessed";
import { createWizardOverlay } from "./overlay";

describe("wizard-screen overlay", () => {
  it("mounts and closes overlays with cleanup hooks", async () => {
    const screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      grabKeys: true,
      mouse: false,
    });
    let afterCloseCount = 0;

    const resultPromise = createWizardOverlay(
      screen,
      "Input",
      "Body",
      (overlay, settle) => {
        expect(overlay.options.label).toContain("Input");
        settle("done");
      },
      () => {
        afterCloseCount += 1;
      },
    );

    await expect(resultPromise).resolves.toBe("done");
    expect(afterCloseCount).toBe(1);

    screen.destroy();
  });
});
