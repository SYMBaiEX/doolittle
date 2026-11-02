import { expect, it } from "vitest";
import { hasOnlyStrongCopyleftOptions } from "../../apps/desktop/scripts/runtime-requirements";

it("accepts a permissive license choice while retaining copyleft requirements", () => {
  expect(hasOnlyStrongCopyleftOptions("(MIT OR GPL-3.0-or-later)")).toBe(false);
  expect(hasOnlyStrongCopyleftOptions("MIT AND GPL-3.0-or-later")).toBe(true);
  expect(hasOnlyStrongCopyleftOptions("GPL-3.0-only OR AGPL-3.0-only")).toBe(
    true,
  );
  expect(
    hasOnlyStrongCopyleftOptions("(MIT AND GPL-3.0-only) OR Apache-2.0"),
  ).toBe(false);
  expect(hasOnlyStrongCopyleftOptions("MIT")).toBe(false);
});
