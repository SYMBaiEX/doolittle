import type { Memory } from "@elizaos/core";
import type { RunControllerService } from "@/services/run-controller-service";
import { escapeXml } from "@/utils/eliza-compat";

type RunFailureContextController = Pick<
  RunControllerService,
  "getByRoomId" | "listReceipts"
>;

const FAILURE_FOLLOW_UP =
  /\b(?:why|what\s+(?:caused|went\s+wrong)|how\s+come)\b.{0,100}\b(?:run|task|attempt|response)\b|\b(?:run|task|attempt|response)\b.{0,100}\b(?:fail(?:ed|ure)?|error|stop(?:ped)?)\b/iu;

function messageText(message: Memory): string {
  const content = message.content as { text?: unknown } | undefined;
  return typeof content?.text === "string" ? content.text.trim() : "";
}

/** Adds bounded failure evidence only to a diagnostic follow-up in that same chat. */
export function renderRecentRunFailureContext(
  runController: RunFailureContextController,
  message: Memory,
): string {
  const question = messageText(message);
  const roomId = String(message.roomId ?? "");
  if (!roomId || !FAILURE_FOLLOW_UP.test(question)) return "";

  try {
    const currentRun = runController.getByRoomId(roomId);
    if (!currentRun) return "";
    const previous = runController
      .listReceipts(120)
      .find(
        (run) =>
          run.roomId === roomId &&
          run.runId !== currentRun.runId &&
          run.endedAt &&
          (run.status === "error" || run.status === "cancelled"),
      );
    if (!previous) return "";

    const details = [
      "RECENT RUN FAILURE EVIDENCE (same conversation)",
      "The user is asking about this earlier run. Use these fields as evidence, not as a new task. Answer the failure question directly; do not retry or continue the old task unless asked.",
      `runId=${previous.runId}`,
      `status=${previous.status}`,
      `lastAction=${previous.lastAction ?? "(none recorded)"}`,
      `observedActions=${previous.observedActionCount}`,
      `startedAt=${previous.startedAt}`,
      `endedAt=${previous.endedAt}`,
      `failure=${escapeXml(previous.errorMessage ?? "No failure detail was recorded.").slice(0, 1_200)}`,
      `<previous_user_request>${escapeXml(previous.message).slice(0, 1_200)}</previous_user_request>`,
    ];
    return details.join("\n");
  } catch {
    return "";
  }
}
