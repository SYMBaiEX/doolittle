import { describe, expect, it } from "vitest";
import {
  compactControlValue,
  compactDetailValue,
  compactStatus,
  normalizeText,
} from "./models";

describe("orchestration presentation models", () => {
  it("normalizes compact labels without changing short values", () => {
    expect(normalizeText("short", 10)).toBe("short");
    expect(normalizeText("abcdefgh", 4)).toBe("abcd…");
    expect(compactStatus("needs-review")).toBe("needs review");
    expect(compactStatus()).toBe("pending");
  });

  it("keeps control and detail values deterministic for opaque data", () => {
    expect(compactControlValue(["one", "two"])).toBe("2");
    expect(compactControlValue({ ready: true })).toBe("available");
    expect(compactControlValue(null)).toBe("none");
    expect(compactDetailValue({ status: "active" })).toBe(
      '{"status":"active"}',
    );
    expect(compactDetailValue(undefined)).toBe("—");
  });
});
