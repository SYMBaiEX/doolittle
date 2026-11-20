import { asRecordOrUndefined } from "@elizaos/shared/type-guards";

export interface PendingSessionApproval extends Record<string, unknown> {
  id: string;
}

/** Match the approval panel's exact room/session scope before showing wait state. */
export function pendingApprovalsForSession(
  value: unknown,
  roomId: string,
): PendingSessionApproval[] {
  if (!roomId || !Array.isArray(value)) return [];
  return value
    .map(asRecordOrUndefined)
    .filter((approval): approval is PendingSessionApproval => {
      if (!approval) return false;
      return (
        approval.status === "pending" &&
        typeof approval.id === "string" &&
        approval.id.length <= 256 &&
        /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(approval.id) &&
        approval.roomId === roomId &&
        (approval.sessionKey === undefined || approval.sessionKey === roomId)
      );
    });
}
