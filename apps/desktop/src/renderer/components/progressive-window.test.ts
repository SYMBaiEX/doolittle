import { describe, expect, it } from "vitest";
import { progressiveWindow } from "./progressive-window";

describe("progressiveWindow", () => {
  const entries = Array.from({ length: 55 }, (_, index) => index);

  it("returns a bounded first page and remaining count", () => {
    const window = progressiveWindow(entries, {
      pageSize: 20,
      requested: 20,
    });

    expect(window.visible).toEqual(entries.slice(0, 20));
    expect(window.limit).toBe(20);
    expect(window.remaining).toBe(35);
  });

  it("keeps a selected entry visible without exceeding the collection", () => {
    expect(
      progressiveWindow(entries, {
        pageSize: 20,
        requested: 20,
        selectedIndex: 42,
      }).visible,
    ).toEqual(entries.slice(0, 43));

    expect(
      progressiveWindow(entries, {
        pageSize: 20,
        requested: 200,
      }).limit,
    ).toBe(entries.length);
  });

  it("fails safely for invalid window sizes", () => {
    expect(
      progressiveWindow(entries, {
        pageSize: Number.NaN,
        requested: Number.POSITIVE_INFINITY,
      }).visible,
    ).toEqual(entries.slice(0, 1));
  });
});
