import type { UserProfileRecord } from "@/types";
import type { UserProfileStorage } from "../storage";
import type { UserProfileMutationHost } from "../types";

export function createSetExplicitMemoriesMutation(
  storage: UserProfileStorage,
  host: UserProfileMutationHost,
): (userId: string, memories: string[], source?: string) => UserProfileRecord {
  return (userId, memories, source) =>
    storage.update(
      userId,
      (profile) => {
        profile.explicitMemories = host.unique(memories);
        profile.lastSource = source ?? profile.lastSource;
      },
      { source },
    );
}
