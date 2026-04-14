import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createUserProfileMutations } from "../mutations";
import type { UserProfileStorage } from "../storage";
import { createUserProfileStorage, normalizeRelationship } from "../storage";
import type { UserProfileMutationActions } from "../types";

export interface UserProfileServiceState {
  storage: UserProfileStorage;
  mutations: UserProfileMutationActions;
}

export function createUserProfileServiceState(
  baseDir: string,
): UserProfileServiceState {
  mkdirSync(baseDir, { recursive: true });
  const storage = createUserProfileStorage(join(baseDir, "user-profiles.json"));
  const mutations = createUserProfileMutations(storage, {
    nowIso: () => new Date().toISOString(),
    unique: (items: string[]) =>
      Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))),
    normalizeRelationship,
  });

  return {
    storage,
    mutations,
  };
}
