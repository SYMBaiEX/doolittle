import { describe, expect, it } from "vitest";
import { asArray, asNumber, asRecord, asString } from "./value-guards";

describe("asRecord", () => {
  it("preserves the renderer empty-record fallback over Eliza's type guard", () => {
    const record = { ready: true };

    expect(asRecord(record)).toBe(record);
    expect(asRecord(null)).toEqual({});
    expect(asRecord([])).toEqual({});
  });
});

describe("renderer value normalizers", () => {
  it("keeps arrays and falls back for non-arrays", () => {
    const entries = ["one"];

    expect(asArray(entries)).toBe(entries);
    expect(asArray(null)).toEqual([]);
  });

  it("preserves strings and finite numbers with explicit fallbacks", () => {
    expect(asString("value", "fallback")).toBe("value");
    expect(asString(null, "fallback")).toBe("fallback");
    expect(asNumber(4, 9)).toBe(4);
    expect(asNumber(Number.NaN, 9)).toBe(9);
  });
});
