import type { UserProfileRecord } from "@/types";
import type { UserProfileMutationHost } from "../types";

export function appendRelationshipNote(
  host: UserProfileMutationHost,
  relationship: UserProfileRecord["relationship"],
  note: string,
  source?: string,
  limit?: number,
): NonNullable<UserProfileRecord["relationship"]> {
  const notes = host.unique([...(relationship?.notes ?? []), note]);

  return host.normalizeRelationship({
    ...host.normalizeRelationship(relationship),
    notes: typeof limit === "number" ? notes.slice(-limit) : notes,
    lastSource: source ?? relationship?.lastSource,
    lastInteractionAt: host.nowIso(),
  });
}
