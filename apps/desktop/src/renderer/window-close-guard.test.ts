import { describe, expect, it, vi } from "vitest";
import { guardDirtyCodeWorkspaceClose } from "./window-close-guard";

describe("window close guard", () => {
  it("prevents teardown and marks the event when Code has unsaved edits", () => {
    const event = { preventDefault: vi.fn(), returnValue: "" };

    expect(guardDirtyCodeWorkspaceClose(event, true)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");
  });

  it("allows a clean workspace to close", () => {
    const event = { preventDefault: vi.fn(), returnValue: "" };

    expect(guardDirtyCodeWorkspaceClose(event, false)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
