import { asRecordOrUndefined } from "@elizaos/shared/type-guards";

export interface PendingInputRequestOption {
  label: string;
  description?: string;
}

export interface PendingInputRequestQuestion {
  question: string;
  header?: string;
  options: PendingInputRequestOption[];
  multiSelect?: boolean;
}

export interface PendingInputRequest extends Record<string, unknown> {
  id: string;
  questions: PendingInputRequestQuestion[];
}

function isQuestion(value: unknown): value is PendingInputRequestQuestion {
  const record = asRecordOrUndefined(value);
  if (!record || typeof record.question !== "string" || !record.question.trim())
    return false;
  if (record.options === undefined) return true;
  return (
    Array.isArray(record.options) &&
    record.options.every((option) => {
      const entry = asRecordOrUndefined(option);
      return Boolean(entry && typeof entry.label === "string");
    })
  );
}

/** Match the input panel's exact room/session scope before showing requests. */
export function pendingInputRequestsForSession(
  value: unknown,
  roomId: string,
): PendingInputRequest[] {
  if (!roomId || !Array.isArray(value)) return [];
  return value
    .map(asRecordOrUndefined)
    .filter((request): request is PendingInputRequest => {
      if (!request) return false;
      return (
        request.status === "pending" &&
        typeof request.id === "string" &&
        request.id.length <= 256 &&
        /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(request.id) &&
        request.roomId === roomId &&
        Array.isArray(request.questions) &&
        request.questions.length > 0 &&
        request.questions.every(isQuestion)
      );
    });
}
