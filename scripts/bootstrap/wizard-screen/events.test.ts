import { describe, expect, it } from "bun:test";
import blessed from "blessed";
import { installWizardScreenEvents } from "./events";

describe("wizard-screen events", () => {
  it("hooks resize, warning, and abort behavior", () => {
    const screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      grabKeys: true,
      mouse: false,
    });
    const warnings: string[] = [];
    let aborted = 0;
    let keyRegistered = false;
    let abortListener: (() => void) | undefined;
    screen.key = ((keys: string | string[], listener: () => void) => {
      keyRegistered = Array.isArray(keys) && keys.includes("C-c");
      abortListener = listener;
    }) as never;

    installWizardScreenEvents(screen, {
      onResize: () => warnings.push("resize"),
      onWarning: (warning) => warnings.push(String(warning)),
      onAbort: () => {
        aborted += 1;
      },
    });

    screen.emit("resize");
    screen.emit("warning", "watch carefully");
    expect(keyRegistered).toBe(true);
    expect(warnings).toEqual(["resize", "watch carefully"]);

    abortListener?.();
    expect(aborted).toBe(1);

    screen.destroy();
  });
});
