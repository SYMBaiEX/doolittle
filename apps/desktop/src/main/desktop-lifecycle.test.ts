import { describe, expect, it, vi } from "vitest";
import { handleWindowClose, shouldHideOnClose } from "./desktop-lifecycle";

describe("desktop background lifecycle", () => {
  it("only hides a window after the user opted into background mode", () => {
    expect(shouldHideOnClose({ keepRunningInBackground: false }, false)).toBe(
      false,
    );
    expect(shouldHideOnClose({ keepRunningInBackground: true }, false)).toBe(
      true,
    );
  });

  it("never intercepts an explicit quit", () => {
    const hide = vi.fn();
    const preventDefault = vi.fn();
    expect(
      handleWindowClose(
        { hide },
        { preventDefault },
        { keepRunningInBackground: true },
        true,
      ),
    ).toBe(false);
    expect(hide).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
