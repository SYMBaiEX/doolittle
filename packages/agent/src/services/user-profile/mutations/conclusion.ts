import type { UserProfileConclusionRecord } from "@/types";
import type { UserProfileStorage } from "../storage";
import type { UserProfileMutationHost } from "../types";
import { appendRelationshipNote } from "./relationship";

export function createConcludeMutation(
  storage: UserProfileStorage,
  host: UserProfileMutationHost,
): (
  userId: string,
  query: string,
  conclusion: string,
  source?: string,
) => UserProfileConclusionRecord {
  return (userId, query, conclusion, source) => {
    const trimmedQuery = query.trim();
    const trimmedConclusion = conclusion.trim();

    storage.update(
      userId,
      (profile) => {
        profile.notes = host.unique([
          ...profile.notes,
          `Conclusion: ${trimmedConclusion}`,
        ]);
        profile.explicitMemories = host.unique([
          ...(profile.explicitMemories ?? []),
          `${trimmedQuery} => ${trimmedConclusion}`,
        ]);
        profile.relationship = appendRelationshipNote(
          host,
          profile.relationship,
          `Conclusion: ${trimmedConclusion}`,
          source,
          15,
        );
        profile.lastSource = source ?? profile.lastSource;
      },
      { source, channel: source, signal: trimmedConclusion },
    );

    return {
      userId,
      query: trimmedQuery,
      conclusion: trimmedConclusion,
      source,
      recordedAt: host.nowIso(),
    };
  };
}
