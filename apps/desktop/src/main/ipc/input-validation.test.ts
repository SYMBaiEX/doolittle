import { describe, expect, it } from "vitest";
import {
  hasControlCharacters,
  hasFilenameControlCharacters,
  isRecord,
} from "./input-validation";

describe("IPC control-character validation", () => {
  it("delegates record validation to the official Eliza plain-object guard", () => {
    expect(isRecord({ path: "workspace" })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });

  it("preserves the legacy IPC C0 and DEL contract", () => {
    expect(hasControlCharacters("safe text")).toBe(false);
    expect(hasControlCharacters(`line${String.fromCharCode(0x1f)}`)).toBe(true);
    expect(hasControlCharacters(`delete${String.fromCharCode(0x7f)}`)).toBe(
      true,
    );
    expect(hasControlCharacters(`c1${String.fromCharCode(0x80)}`)).toBe(false);
  });

  it("keeps the stricter C1 rejection used by imported filenames", () => {
    expect(
      hasFilenameControlCharacters(`filename${String.fromCharCode(0x80)}`),
    ).toBe(true);
    expect(hasFilenameControlCharacters("filename.txt")).toBe(false);
  });
});
