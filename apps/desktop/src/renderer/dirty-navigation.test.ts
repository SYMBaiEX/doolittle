import { describe, expect, it, vi } from "vitest";
import { confirmDirtyNavigation } from "./dirty-navigation";

describe("confirmDirtyNavigation", () => {
  it("preserves dirty state when navigation is cancelled", () => {
    const discard = vi.fn();
    expect(
      confirmDirtyNavigation({ dirty: true, confirm: () => false, discard }),
    ).toBe(false);
    expect(discard).not.toHaveBeenCalled();
  });

  it("discards dirty state only after navigation is confirmed", () => {
    const discard = vi.fn();
    expect(
      confirmDirtyNavigation({ dirty: true, confirm: () => true, discard }),
    ).toBe(true);
    expect(discard).toHaveBeenCalledOnce();
  });
});
