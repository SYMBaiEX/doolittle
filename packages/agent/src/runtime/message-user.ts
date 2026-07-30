import type { Memory } from "@elizaos/core";

export const DEFAULT_LOCAL_USER_ID = "desktop-user";

export function messageUserId(
  message: Pick<Memory, "metadata">,
  fallback = DEFAULT_LOCAL_USER_ID,
): string {
  const metadata = message.metadata as
    | { doolittle?: { userId?: unknown } }
    | undefined;
  const userId = metadata?.doolittle?.userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : fallback;
}
