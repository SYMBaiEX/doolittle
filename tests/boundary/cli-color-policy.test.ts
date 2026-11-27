import { describe, expect, it } from "vitest";
import {
  paintText,
  resolveTerminalColorPolicy,
} from "../../apps/cli/src/cli/terminal-color";

const tty = { isTTY: true };
const notTty = { isTTY: false };

describe("terminal color policy", () => {
  it("follows the stream TTY state by default", () => {
    expect(resolveTerminalColorPolicy(tty, {}).enabled).toBe(true);
    expect(resolveTerminalColorPolicy(notTty, {}).enabled).toBe(false);
  });

  it("respects NO_COLOR even on a TTY", () => {
    expect(resolveTerminalColorPolicy(tty, { NO_COLOR: "1" }).enabled).toBe(
      false,
    );
    // An empty NO_COLOR is a no-op per no-color.org.
    expect(resolveTerminalColorPolicy(tty, { NO_COLOR: "" }).enabled).toBe(
      true,
    );
  });

  it("respects FORCE_COLOR off the TTY and its explicit disable", () => {
    expect(
      resolveTerminalColorPolicy(notTty, { FORCE_COLOR: "1" }).enabled,
    ).toBe(true);
    expect(resolveTerminalColorPolicy(tty, { FORCE_COLOR: "0" }).enabled).toBe(
      false,
    );
    expect(
      resolveTerminalColorPolicy(notTty, { FORCE_COLOR: "" }).enabled,
    ).toBe(false);
  });

  it("lets an explicit FORCE_COLOR override NO_COLOR, matching Node and chalk", () => {
    expect(
      resolveTerminalColorPolicy(notTty, {
        FORCE_COLOR: "2",
        NO_COLOR: "1",
      }).enabled,
    ).toBe(true);
  });

  it("detects light terminal backgrounds through COLORFGBG", () => {
    expect(resolveTerminalColorPolicy(tty, {}).background).toBe("dark");
    expect(
      resolveTerminalColorPolicy(tty, { COLORFGBG: "15;0" }).background,
    ).toBe("dark");
    expect(
      resolveTerminalColorPolicy(tty, { COLORFGBG: "0;15" }).background,
    ).toBe("light");
    expect(
      resolveTerminalColorPolicy(tty, { COLORFGBG: "0;7" }).background,
    ).toBe("light");
    expect(
      resolveTerminalColorPolicy(tty, { COLORFGBG: "7;0;8" }).background,
    ).toBe("dark");
  });

  it("paints semantic roles only when enabled and resets afterwards", () => {
    const dark = { enabled: true, background: "dark" as const };
    const off = { enabled: false, background: "dark" as const };
    expect(paintText("hi", "accent", dark)).toBe("\x1b[35mhi\x1b[0m");
    expect(paintText("hi", "accent", dark, { bold: true })).toBe(
      "\x1b[1m\x1b[35mhi\x1b[0m",
    );
    expect(paintText("hi", "accent", off)).toBe("hi");
  });

  it("keeps severity roles fixed and shifts the info role on light terminals", () => {
    const dark = { enabled: true, background: "dark" as const };
    const light = { enabled: true, background: "light" as const };
    // Severity never derives from decorative accents: same fixed ANSI everywhere.
    expect(paintText("e", "error", dark)).toBe("\x1b[31me\x1b[0m");
    expect(paintText("e", "error", light)).toBe("\x1b[31me\x1b[0m");
    expect(paintText("w", "warning", dark)).toBe("\x1b[33mw\x1b[0m");
    // Cyan reads poorly on white backgrounds; the info role shifts to blue.
    expect(paintText("i", "info", dark)).toBe("\x1b[36mi\x1b[0m");
    expect(paintText("i", "info", light)).toBe("\x1b[34mi\x1b[0m");
  });
});
