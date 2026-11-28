import type { ChatRunSteerRejectionCode } from "@doolittle/contracts/steer";
import { CHAT_RUN_STEER_REJECTION_CODES } from "@doolittle/contracts/steer";
import { type DisplayMessage, isCommandMessage } from "./models";

/**
 * Steer carries only user-authored text into an existing pass. Attachments,
 * hidden context capsules, and slash commands keep their established next-turn
 * queue semantics instead of being silently flattened into instructions.
 */
export function canOfferRunSteerDraft(input: {
  text: string;
  attachmentCount: number;
  hasContextCapsule: boolean;
}): boolean {
  const text = input.text.trim();
  return Boolean(
    text &&
      input.attachmentCount === 0 &&
      !input.hasContextCapsule &&
      !isCommandMessage(text),
  );
}

export function isChatRunSteerRejectionCode(
  value: unknown,
): value is ChatRunSteerRejectionCode {
  return (
    typeof value === "string" &&
    (CHAT_RUN_STEER_REJECTION_CODES as readonly string[]).includes(value)
  );
}

/** Rejections where a next-turn queue preserves the user's intent exactly. */
export function steerRejectionCanQueue(
  code: ChatRunSteerRejectionCode,
): boolean {
  return (
    code === "run_not_active" ||
    code === "run_not_steerable" ||
    code === "steer_budget_exhausted"
  );
}

export function steerQueueFallbackMessage(
  code: ChatRunSteerRejectionCode,
): string {
  switch (code) {
    case "run_not_active":
      return "The active run ended before steering, so the message was added to the queue.";
    case "steer_budget_exhausted":
      return "This run has no continuation-pass capacity left, so the message was added to the queue.";
    default:
      return "This run cannot accept steering, so the message was added to the queue.";
  }
}

/** Place accepted steer input before the run's aggregate assistant response. */
export function insertSteeredUserMessage(
  messages: DisplayMessage[],
  runId: string,
  message: DisplayMessage,
): DisplayMessage[] {
  if (messages.some((entry) => entry.id === message.id)) {
    return messages;
  }
  const next = [...messages];
  const assistantIndex = next.findIndex(
    (entry) => entry.id === `assistant:${runId}`,
  );
  if (assistantIndex >= 0) next.splice(assistantIndex, 0, message);
  else next.push(message);
  return next;
}

export type RunSteerRejectionDisposition =
  | { action: "queue"; detail: string }
  | { action: "retain"; detail: string };

/** Decide the honest recovery without hiding a rejection or queueing a changed draft. */
export function runSteerRejectionDisposition(input: {
  code: ChatRunSteerRejectionCode;
  detail: string;
  draftChanged: boolean;
}): RunSteerRejectionDisposition {
  if (!steerRejectionCanQueue(input.code)) {
    return { action: "retain", detail: input.detail };
  }
  if (input.draftChanged) {
    return {
      action: "retain",
      detail:
        "The run did not accept steering, and the draft changed while the offer was in flight. Nothing was queued.",
    };
  }
  return {
    action: "queue",
    detail: steerQueueFallbackMessage(input.code),
  };
}
