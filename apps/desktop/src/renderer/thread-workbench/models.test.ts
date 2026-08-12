import { describe, expect, it } from "vitest";
import {
  branchHeadLabel,
  compactRailLabel,
  FULL_VIEW,
  QUICK_NAVIGATION,
  statusTone,
  TAB_LABELS,
  workbenchPanelMeta,
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

  it("keeps panel metadata concise and domain-specific", () => {
    const metrics = {
      approvals: 2,
      changes: 3,
      commands: 4,
      files: 5,
      plans: 6,
      preview: "Connected",
      settings: 7,
      tasks: 8,
    };
    expect(workbenchPanelMeta("files", metrics)).toBe("5 entries");
    expect(workbenchPanelMeta("brief", metrics)).toBe("2 approvals · 8 tasks");
    expect(workbenchPanelMeta("preview", metrics)).toBe("Connected");
  });
});
