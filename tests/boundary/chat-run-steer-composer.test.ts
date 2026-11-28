import { expect, it } from "vitest";
import {
  canOfferRunSteerDraft,
  insertSteeredUserMessage,
  isChatRunSteerRejectionCode,
  runSteerRejectionDisposition,
  steerQueueFallbackMessage,
  steerRejectionCanQueue,
} from "../../apps/desktop/src/renderer/chat/steer";

it("offers steer only for plain user text that the steer contract can represent", () => {
  expect(
    canOfferRunSteerDraft({
      text: "Use the narrower fix instead",
      attachmentCount: 0,
      hasContextCapsule: false,
    }),
  ).toBe(true);

  for (const input of [
    {
      text: "Use the narrower fix instead",
      attachmentCount: 1,
      hasContextCapsule: false,
    },
    {
      text: "Use the narrower fix instead",
      attachmentCount: 0,
      hasContextCapsule: true,
    },
    {
      text: "/retry",
      attachmentCount: 0,
      hasContextCapsule: false,
    },
    {
      text: "   ",
      attachmentCount: 0,
      hasContextCapsule: false,
    },
  ]) {
    expect(canOfferRunSteerDraft(input)).toBe(false);
  }
});

it("queues only rejections where a next turn preserves the user's intent", () => {
  for (const code of [
    "run_not_active",
    "run_not_steerable",
    "steer_budget_exhausted",
  ] as const) {
    expect(steerRejectionCanQueue(code)).toBe(true);
    expect(steerQueueFallbackMessage(code)).toContain("queue");
  }

  for (const code of [
    "empty_message",
    "session_mismatch",
    "user_mismatch",
    "steer_persistence_failed",
  ] as const) {
    expect(steerRejectionCanQueue(code)).toBe(false);
  }
});

it("places accepted steer input before the aggregate assistant response without duplication", () => {
  const existing = [
    {
      id: "user-original",
      runId: "run-1",
      role: "user" as const,
      content: "Fix the file",
      createdAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "assistant:run-1",
      runId: "run-1",
      role: "assistant" as const,
      content: "Working",
      createdAt: "2026-01-01T00:00:01Z",
      pending: true,
    },
  ];
  const steered = {
    id: "steer-memory-1",
    runId: "run-1",
    role: "user" as const,
    content: "Use the narrower fix",
    createdAt: "2026-01-01T00:00:02Z",
  };

  const inserted = insertSteeredUserMessage(existing, "run-1", steered);
  expect(inserted.map((message) => message.id)).toEqual([
    "user-original",
    "steer-memory-1",
    "assistant:run-1",
  ]);
  expect(
    insertSteeredUserMessage(inserted, "run-1", steered).map(
      (message) => message.id,
    ),
  ).toEqual(["user-original", "steer-memory-1", "assistant:run-1"]);
});

it("keeps rejection recovery explicit when the draft changed or persistence failed", () => {
  expect(
    runSteerRejectionDisposition({
      code: "run_not_steerable",
      detail: "not steerable",
      draftChanged: false,
    }),
  ).toEqual({
    action: "queue",
    detail:
      "This run cannot accept steering, so the message was added to the queue.",
  });
  expect(
    runSteerRejectionDisposition({
      code: "run_not_steerable",
      detail: "not steerable",
      draftChanged: true,
    }).action,
  ).toBe("retain");
  expect(
    runSteerRejectionDisposition({
      code: "steer_persistence_failed",
      detail:
        "The steer message could not be durably persisted, so it was not admitted.",
      draftChanged: false,
    }),
  ).toEqual({
    action: "retain",
    detail:
      "The steer message could not be durably persisted, so it was not admitted.",
  });
});

it("recognizes only contracted steer rejection codes", () => {
  expect(isChatRunSteerRejectionCode("run_not_steerable")).toBe(true);
  expect(isChatRunSteerRejectionCode("backend_unavailable")).toBe(false);
  expect(isChatRunSteerRejectionCode(undefined)).toBe(false);
});
