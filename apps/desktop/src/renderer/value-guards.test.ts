import { describe, expect, it } from "vitest";
import { asRecord } from "./value-guards";

describe("asRecord", () => {
  it("preserves the renderer empty-record fallback over Eliza's type guard", () => {
    const record = { ready: true };

    expect(asRecord(record)).toBe(record);
    expect(asRecord(null)).toEqual({});
    expect(asRecord([])).toEqual({});
  });
});
