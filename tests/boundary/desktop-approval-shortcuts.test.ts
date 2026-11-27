import { expect, it } from "vitest";
import {
  approvalDecisionForShortcut,
  approvalShortcutAriaKey,
  approvalShortcutLabel,
} from "../../apps/desktop/src/renderer/approval-shortcuts";

it("recognizes only the quiet approval decision chords", () => {
  expect(approvalDecisionForShortcut({ altKey: true, key: "a" })).toBe(
    "approve",
  );
  expect(approvalDecisionForShortcut({ altKey: true, key: "D" })).toBe("deny");
  expect(approvalDecisionForShortcut({ key: "a" })).toBeUndefined();
  expect(
    approvalDecisionForShortcut({ altKey: true, ctrlKey: true, key: "a" }),
  ).toBeUndefined();
  expect(
    approvalDecisionForShortcut({ altKey: true, metaKey: true, key: "a" }),
  ).toBeUndefined();
  expect(
    approvalDecisionForShortcut({ altKey: true, shiftKey: true, key: "a" }),
  ).toBeUndefined();
  expect(
    approvalDecisionForShortcut({ altKey: true, isComposing: true, key: "a" }),
  ).toBeUndefined();
});

it("keeps visible labels platform-specific and AT keys canonical", () => {
  expect(approvalShortcutLabel("approve", "darwin")).toBe("⌥ A");
  expect(approvalShortcutLabel("deny", "linux")).toBe("Alt D");
  expect(approvalShortcutAriaKey("approve")).toBe("Alt+A");
  expect(approvalShortcutAriaKey("deny")).toBe("Alt+D");
});
