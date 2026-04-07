import { describe, expect, it } from "bun:test";
import { createLazySlot } from "../lazy-slot";
import { defineSlotBackedProperties } from "./slot-properties";

describe("defineSlotBackedProperties", () => {
  it("defines live enumerable getter/setter pairs for slots", () => {
    const scoreSlot = createLazySlot(() => ({ value: 1 }));
    const labelSlot = createLazySlot(() => "alpha");
    const target = defineSlotBackedProperties(
      {},
      { score: scoreSlot, label: labelSlot },
    );

    expect(target.score).toEqual({ value: 1 });
    expect(target.label).toBe("alpha");

    target.score = { value: 42 };
    target.label = "beta";

    expect(scoreSlot.peek()).toEqual({ value: 42 });
    expect(labelSlot.peek()).toBe("beta");
    expect(Object.keys(target)).toEqual(["score", "label"]);
  });
});
