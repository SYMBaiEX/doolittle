import { describe, expect, it } from "vitest";
import {
  hasAsciiControlCharacters,
  hasEncodedAsciiControlCharacters,
} from "./text-validation";

describe("text validation", () => {
  it("detects ASCII C0 and DEL controls without rejecting printable Unicode", () => {
    expect(hasAsciiControlCharacters("safe text ✓")).toBe(false);
    expect(hasAsciiControlCharacters("line\nbreak")).toBe(true);
    expect(hasAsciiControlCharacters("nul\0byte")).toBe(true);
    expect(
      hasAsciiControlCharacters(`delete${String.fromCharCode(0x7f)}`),
    ).toBe(true);
  });

  it("detects nested encoded controls and tolerates malformed escapes", () => {
    expect(hasEncodedAsciiControlCharacters("safe%20text")).toBe(false);
    expect(hasEncodedAsciiControlCharacters("nested%250Aline")).toBe(true);
    expect(hasEncodedAsciiControlCharacters("malformed%2")).toBe(false);
  });

  it("requires a positive decode-pass bound", () => {
    expect(() => hasEncodedAsciiControlCharacters("safe", 0)).toThrow(
      RangeError,
    );
  });
});
