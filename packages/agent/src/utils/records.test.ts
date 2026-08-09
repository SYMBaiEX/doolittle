import { describe, expect, it } from "vitest";
import { isRecord } from "./records";

describe("isRecord", () => {
  it("accepts object payloads and rejects primitives and arrays", () => {
    expect(isRecord({ key: "value" })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("value")).toBe(false);
  });
});
