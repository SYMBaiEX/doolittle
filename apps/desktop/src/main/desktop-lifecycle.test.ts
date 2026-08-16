import { describe, expect, it, vi } from "vitest";
import {
  configureDesktopSingleInstance,
  ensureDesktopWindow,
  handleWindowClose,
  shouldHideOnClose,
  shouldQuitAfterAllWindowsClosed,
  shouldStayOnDirtyClosePrompt,
} from "./desktop-lifecycle";

describe("desktop background lifecycle", () => {
  it("quits a second process before it starts a shared runtime", () => {
    const quit = vi.fn();
    const on = vi.fn();
    expect(
      configureDesktopSingleInstance(
        { requestSingleInstanceLock: () => false, quit, on },
        vi.fn(),
      ),
    ).toBe(false);
    expect(quit).toHaveBeenCalledOnce();
    expect(on).not.toHaveBeenCalled();
  });

  it("focuses the existing process when another launch is requested", () => {
    const focusExisting = vi.fn();
    const on = vi.fn((_event: "second-instance", listener: () => void) =>
      listener(),
    );
    expect(
      configureDesktopSingleInstance(
        { requestSingleInstanceLock: () => true, quit: vi.fn(), on },
        focusExisting,
      ),
    ).toBe(true);
    expect(on).toHaveBeenCalledWith("second-instance", focusExisting);
    expect(focusExisting).toHaveBeenCalledOnce();
  });

  it("recreates a destroyed window for a later launch", () => {
    const replacement = { isDestroyed: () => false };
    const create = vi.fn(() => replacement);

    expect(ensureDesktopWindow({ isDestroyed: () => true }, create)).toBe(
      replacement,
    );
    expect(create).toHaveBeenCalledOnce();

    const existing = { isDestroyed: () => false };
    expect(ensureDesktopWindow(existing, create)).toBe(existing);
    expect(create).toHaveBeenCalledOnce();
  });

  it("only hides a window after the user opted into background mode", () => {
    expect(shouldHideOnClose({ keepRunningInBackground: false }, false)).toBe(
      false,
    );
    expect(shouldHideOnClose({ keepRunningInBackground: true }, false)).toBe(
      true,
    );
  });

  it("quits after the final window unless background mode is enabled", () => {
    expect(
      shouldQuitAfterAllWindowsClosed({ keepRunningInBackground: false }),
    ).toBe(true);
    expect(
      shouldQuitAfterAllWindowsClosed({ keepRunningInBackground: true }),
    ).toBe(false);
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

  it("keeps the window open only for Stay in the dirty-close prompt", () => {
    expect(shouldStayOnDirtyClosePrompt(0)).toBe(true);
    expect(shouldStayOnDirtyClosePrompt(1)).toBe(false);
  });
});
