import { describe, expect, it } from "vitest";
import { formatShortcutLabel } from "../../apps/desktop/src/renderer/shortcut-label";

describe("formatShortcutLabel", () => {
  it.each([
    ["darwin", "⌘ J"],
    ["win32", "Ctrl J"],
    ["linux", "Ctrl J"],
  ] as const)("formats the primary modifier for %s", (platform, expected) => {
    expect(formatShortcutLabel({ key: "j", mod: true }, platform)).toBe(
      expected,
    );
  });

  it.each([
    ["darwin", "⌘ ⇧ R"],
    ["win32", "Ctrl Shift R"],
    ["linux", "Ctrl Shift R"],
  ] as const)("formats shifted shortcuts for %s", (platform, expected) => {
    expect(
      formatShortcutLabel({ key: "r", mod: true, shift: true }, platform),
    ).toBe(expected);
  });

  it.each([
    ["darwin", "⌘ ⌥ B"],
    ["win32", "Ctrl Alt B"],
    ["linux", "Ctrl Alt B"],
  ] as const)("formats alternate modifiers for %s", (platform, expected) => {
    expect(
      formatShortcutLabel({ key: "b", mod: true, alt: true }, platform),
    ).toBe(expected);
  });

  it.each([
    ["darwin", "⌃ C"],
    ["win32", "Ctrl C"],
    ["linux", "Ctrl C"],
  ] as const)(
    "formats explicit control chords for %s",
    (platform, expected) => {
      expect(formatShortcutLabel({ key: "c", control: true }, platform)).toBe(
        expected,
      );
    },
  );

  it("keeps named key labels and rejects empty chords", () => {
    expect(formatShortcutLabel({ key: "Enter", mod: true }, "darwin")).toBe(
      "⌘ Enter",
    );
    expect(() => formatShortcutLabel({ key: " " }, "linux")).toThrow(
      "A shortcut key is required.",
    );
  });
});
