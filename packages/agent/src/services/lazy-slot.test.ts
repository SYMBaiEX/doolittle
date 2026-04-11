import { describe, expect, it } from "bun:test";
import { createLazySlot } from "./lazy-slot";

describe("createLazySlot", () => {
  it("creates once, supports replacement, and exposes peek", () => {
    let calls = 0;
    const slot = createLazySlot(() => {
      calls += 1;
      return { value: calls };
    });

    expect(slot.peek()).toBeUndefined();
    expect(slot.get()).toEqual({ value: 1 });
    expect(slot.get()).toEqual({ value: 1 });
    expect(calls).toBe(1);

    slot.set({ value: 99 });
    expect(slot.peek()).toEqual({ value: 99 });
    expect(slot.get()).toEqual({ value: 99 });
    expect(calls).toBe(1);
  });
});
