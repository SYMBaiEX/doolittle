import { describe, expect, it } from "bun:test";
import {
  buildSelectManyFooter,
  buildSelectNumericKeyLabels,
  buildSelectOneFooter,
  buildTextPromptFooter,
  buildTextPromptSubtitle,
  buildYesNoFooter,
  buildYesNoItems,
  clampIndex,
  toggleSelection,
} from "./prompts";

describe("wizard-screen prompt helpers", () => {
  it("formats prompt subtitles and footers", () => {
    expect(buildTextPromptSubtitle("alpha")).toContain("alpha");
    expect(buildTextPromptSubtitle("alpha", true)).toContain("[stored]");
    expect(buildTextPromptSubtitle("")).toContain("Enter to keep current");
    expect(buildTextPromptFooter((label) => `<${label}>`)).toContain(
      "<Ctrl-C>",
    );
    expect(buildYesNoFooter()).toContain("Enter or Space");
    expect(buildSelectOneFooter()).toContain("Enter or Space");
    expect(buildSelectManyFooter()).toContain("Space toggle");
  });

  it("builds numeric labels and selection helpers", () => {
    expect(buildYesNoItems(true)).toEqual(["Yes (default)", "No"]);
    expect(buildYesNoItems(false)).toEqual(["Yes", "No (default)"]);
    expect(buildSelectNumericKeyLabels(3)).toEqual(["1", "2", "3"]);
    expect(clampIndex(-2, 3)).toBe(0);
    expect(clampIndex(10, 3)).toBe(2);
    expect([...toggleSelection(new Set(["a"]), "b")]).toEqual(["a", "b"]);
  });
});
