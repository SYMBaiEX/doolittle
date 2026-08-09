import { describe, expect, it } from "vitest";
import {
  branchHeadLabel,
  compactRailLabel,
  FULL_VIEW,
  QUICK_NAVIGATION,
  statusTone,
  TAB_LABELS,
} from "./models";

describe("thread workbench presentation models", () => {
  it("formats repository and workspace labels for the compact rail", () => {
    expect(branchHeadLabel("feature/chat", "1234567890abcdef")).toBe(
      "feature/chat · 12345678",
    );
    expect(branchHeadLabel("", "")).toBe("No branch");
    expect(compactRailLabel("/Users/dev/projects/doolittle/src/index.ts")).toBe(
      "…/doolittle/src/index.ts",
    );
  });

  it("maps workbench statuses and tabs to stable presentation values", () => {
    expect(statusTone("completed")).toBe("good");
    expect(statusTone("waiting")).toBe("warn");
    expect(statusTone("failed")).toBe("bad");
    expect(statusTone("unknown")).toBe("neutral");
    expect(TAB_LABELS.files).toBe("Files");
    expect(TAB_LABELS.preview).toBe("Preview");
    expect(FULL_VIEW.changes).toBe("review");
    expect(FULL_VIEW.brief).toBeUndefined();
    expect(QUICK_NAVIGATION).toHaveLength(8);
  });
});
