import { describe, expect, it } from "vitest";
import { parseHeadlessEvalCliOptions } from "./cli-options";

describe("headless evaluation CLI options", () => {
  it("defaults planner alias deduplication off and preserves other defaults", () => {
    expect(parseHeadlessEvalCliOptions([])).toEqual({
      suiteId: "headless-workflows-v2",
      taskIds: [],
      showResponses: false,
      showActionLabels: false,
      enableConfiguredCloudResearch: false,
      recordActionDiagnostics: false,
      recordModelInputs: false,
      deduplicatePlannerAliasTools: false,
    });
  });

  it("sets the explicit planner alias deduplication option without consuming other values", () => {
    expect(
      parseHeadlessEvalCliOptions([
        "--suite",
        "headless-workflows-v3",
        "--task",
        "conversation-format-v3",
        "--deduplicate-planner-alias-tools",
        "--route-label",
        "planner-dedup-candidate",
      ]),
    ).toEqual({
      suiteId: "headless-workflows-v3",
      taskIds: ["conversation-format-v3"],
      showResponses: false,
      showActionLabels: false,
      enableConfiguredCloudResearch: false,
      recordActionDiagnostics: false,
      recordModelInputs: false,
      deduplicatePlannerAliasTools: true,
      routeLabel: "planner-dedup-candidate",
    });
  });

  it("returns help without parsing later arguments", () => {
    expect(
      parseHeadlessEvalCliOptions([
        "--help",
        "--deduplicate-planner-alias-tools",
      ]),
    ).toBeUndefined();
  });

  it("rejects unknown flags", () => {
    expect(() =>
      parseHeadlessEvalCliOptions(["--planner-dedup-alias-tools"]),
    ).toThrow(
      "Unknown headless evaluation option: --planner-dedup-alias-tools",
    );
  });
});
