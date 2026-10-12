/** Match the approval panel's exact room/session scope before showing wait state. */
export function sessionPendingApprovalCount(
  value: unknown,
  roomId: string,
): number {
  if (!roomId || !Array.isArray(value)) return 0;
  return value.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return false;
    const approval = entry as Record<string, unknown>;
    return (
      approval.status === "pending" &&
      typeof approval.id === "string" &&
      approval.id.length <= 256 &&
      /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(approval.id) &&
      approval.roomId === roomId &&
      (approval.sessionKey === undefined || approval.sessionKey === roomId)
    );
  }).length;
}
