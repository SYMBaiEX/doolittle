import type { UserProfileRecord } from "@/types";
import type { UserProfileInteractionContext } from "../storage";
import type { RememberKind } from "../types";

export type RememberFn = (
  userId: string,
  kind: RememberKind,
  value: string,
  source?: string,
  context?: UserProfileInteractionContext,
) => UserProfileRecord;

export function createAddNoteMutation(
  remember: RememberFn,
): (
  userId: string,
  note: string,
  source?: string,
  context?: UserProfileInteractionContext,
) => UserProfileRecord {
  return (userId, note, source, context) =>
    remember(userId, "note", note, source, context);
}
