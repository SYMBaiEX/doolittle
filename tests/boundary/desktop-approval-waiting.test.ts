import { expect, it } from "vitest";
import {
  approvalWaitSnapshot,
  formatApprovalWaitDuration,
} from "../../apps/desktop/src/renderer/approval-waiting";

const now = new Date("2026-11-27T12:00:00.000Z").getTime();

it("derives compact waiting and expiry text from approval timestamps", () => {
  expect(
    approvalWaitSnapshot(
      "2026-11-27T11:58:00.000Z",
      "2026-11-27T12:13:00.000Z",
      now,
    ),
  ).toEqual({
    elapsedMs: 120_000,
    remainingMs: 780_000,
    tone: "waiting",
    elapsedText: "2m",
    waitingText: "Waiting 2m",
    expiryText: "expires in 13m",
  });
});

it("marks five-minute-old pending approvals stale", () => {
  expect(
    approvalWaitSnapshot(
      "2026-11-27T11:55:00.000Z",
      "2026-11-27T12:10:00.000Z",
      now,
    )?.tone,
  ).toBe("stale");
  expect(
    approvalWaitSnapshot(
      "2026-11-27T11:59:30.000Z",
      "2026-11-27T12:14:30.000Z",
      now,
    )?.tone,
  ).toBe("fresh");
});

it("does not invent waiting time when the record has no usable createdAt", () => {
  expect(
    approvalWaitSnapshot(undefined, "2026-11-27T12:15:00.000Z", now),
  ).toBeUndefined();
  expect(
    approvalWaitSnapshot("not-a-date", "2026-11-27T12:15:00.000Z", now),
  ).toBeUndefined();
});

it("keeps expiry and duration formatting honest at boundaries", () => {
  expect(
    approvalWaitSnapshot(
      "2026-11-27T11:50:00.000Z",
      "2026-11-27T11:59:59.000Z",
      now,
    )?.expiryText,
  ).toBe("expiry due");
  expect(formatApprovalWaitDuration(999)).toBe("1s");
  expect(formatApprovalWaitDuration(59 * 60_000)).toBe("59m");
  expect(formatApprovalWaitDuration(65 * 60_000)).toBe("1h 5m");
  expect(formatApprovalWaitDuration(25 * 60 * 60_000)).toBe("1d 1h");
});
