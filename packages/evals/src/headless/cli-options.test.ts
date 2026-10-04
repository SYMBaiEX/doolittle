import { describe, expect, it } from "vitest";
import { parseHeadlessEvalCliOptions } from "./cli-options";

describe("headless evaluation CLI options", () => {
  it("defaults planner alias deduplication off and preserves other defaults", () => {
    expect(parseHeadlessEvalCliOptions([])).toEqual({
      suiteId: "headless-workflows-v2",
      taskIds: [],
      showResponses: false,
      captureSyntheticResponses: false,
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
      captureSyntheticResponses: false,
      showActionLabels: false,
      enableConfiguredCloudResearch: false,
      recordActionDiagnostics: false,
      recordModelInputs: false,
      deduplicatePlannerAliasTools: true,
      routeLabel: "planner-dedup-candidate",
    });
  });

  it("enables silent synthetic response capture without consuming selection or configuration", () => {
    expect(
      parseHeadlessEvalCliOptions([
        "--suite",
        "headless-representative-v1",
        "--capture-synthetic-responses",
        "--task",
        "conversation-project-handoff-v1",
        "--report-dir",
        "/private/eval-evidence",
        "--route-label",
        "frozen-baseline",
      ]),
    ).toEqual({
      suiteId: "headless-representative-v1",
      taskIds: ["conversation-project-handoff-v1"],
      showResponses: false,
      captureSyntheticResponses: true,
      showActionLabels: false,
      enableConfiguredCloudResearch: false,
      recordActionDiagnostics: false,
      recordModelInputs: false,
      deduplicatePlannerAliasTools: false,
      reportDir: "/private/eval-evidence",
      routeLabel: "frozen-baseline",
    });
  });

  it.each([
    ["--capture-synthetic-responses", "--show-responses"],
    ["--show-responses", "--capture-synthetic-responses"],
  ])("rejects raw-response echo with capture: %s %s", (...flags) => {
    expect(() => parseHeadlessEvalCliOptions(flags)).toThrow(
      "--capture-synthetic-responses cannot be combined with --show-responses.",
    );
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
