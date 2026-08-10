import { describe, expect, it } from "vitest";
import {
  isChatTerminalShortcut,
  isEditableShortcutTarget,
  shouldIgnoreShellShortcut,
} from "./shell-shortcuts";

describe("shell shortcut guards", () => {
  it.each(["input", "textarea", "select"])(
    "treats %s as an editable shortcut target",
    (tagName) => {
      expect(isEditableShortcutTarget({ tagName })).toBe(true);
    },
  );

  it("detects contenteditable ancestors", () => {
    expect(
      isEditableShortcutTarget({
        tagName: "span",
        parentElement: {
          tagName: "div",
          isContentEditable: true,
        },
      }),
    ).toBe(true);
    expect(
      isEditableShortcutTarget({
        tagName: "div",
        getAttribute: (name) =>
          name === "contenteditable" ? "plaintext-only" : null,
      }),
    ).toBe(true);
  });

  it("allows shortcuts from ordinary shell surfaces", () => {
    expect(
      shouldIgnoreShellShortcut({
        target: { tagName: "button" },
      }),
    ).toBe(false);
  });

  it("ignores shortcuts during IME composition", () => {
    expect(
      shouldIgnoreShellShortcut({
        isComposing: true,
        target: { tagName: "main" },
      }),
    ).toBe(true);
  });

  it("recognizes the chat terminal shortcut without stealing modified chords", () => {
    expect(
      isChatTerminalShortcut({
        key: "j",
        metaKey: true,
        target: { tagName: "textarea" },
      }),
    ).toBe(true);
    expect(isChatTerminalShortcut({ key: "J", ctrlKey: true })).toBe(true);
    expect(
      isChatTerminalShortcut({ key: "j", metaKey: true, shiftKey: true }),
    ).toBe(false);
    expect(
      isChatTerminalShortcut({ key: "j", metaKey: true, isComposing: true }),
    ).toBe(false);
  });
});
