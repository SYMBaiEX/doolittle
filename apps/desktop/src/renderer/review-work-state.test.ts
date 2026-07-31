import { describe, expect, test } from "bun:test";
import { reviewWorkState } from "./review-work-state";

describe("reviewWorkState", () => {
  test("puts failing checks ahead of every other state", () => {
    expect(
      reviewWorkState({
        failingChecks: 2,
        pendingApprovals: 3,
        changedFiles: 8,
        agentRuns: 1,
      }),
    ).toMatchObject({
      tone: "bad",
      title: "Needs attention",
      detail: "2 verification checks are failing before this work is ready.",
    });
  });

  test("surfaces pending decisions when checks are clear", () => {
    expect(
      reviewWorkState({
        failingChecks: 0,
        pendingApprovals: 1,
        changedFiles: 4,
        agentRuns: 1,
      }),
    ).toMatchObject({
      tone: "warn",
      title: "Waiting on your decision",
      detail: "1 approval needs your decision before the agent can continue.",
    });
  });

  test("summarizes completed agent work", () => {
    expect(
      reviewWorkState({
        failingChecks: 0,
        pendingApprovals: 0,
        changedFiles: 5,
        agentRuns: 2,
      }),
    ).toMatchObject({
      tone: "good",
      title: "Ready for your review",
      detail: "Doolittle completed 2 agent runs with 5 changed files.",
    });
  });

  test("explains the empty state", () => {
    expect(
      reviewWorkState({
        failingChecks: 0,
        pendingApprovals: 0,
        changedFiles: 0,
        agentRuns: 0,
      }),
    ).toMatchObject({
      tone: "neutral",
      title: "No completed work yet",
    });
  });
});
