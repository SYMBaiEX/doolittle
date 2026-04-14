import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { cloneAgent, cloneProfile } from "./clone";
import { createDefaultAgentIdentity, createEmptyProfile } from "./defaults";
import { recordInteraction } from "./interaction";
import { hydrateAgent, hydrateProfile } from "./normalization";
import type { UserProfileStorage, UserProfileStore } from "./types";

export function createUserProfileStorage(filePath: string): UserProfileStorage {
  let storeCache: UserProfileStore | undefined;

  const storage: UserProfileStorage = {
    read() {
      if (storeCache) {
        return storeCache;
      }
      if (!existsSync(filePath)) {
        storeCache = {
          profiles: [],
          agent: createDefaultAgentIdentity(),
        };
        storage.write(storeCache);
        return storeCache;
      }

      const parsed = JSON.parse(
        readFileSync(filePath, "utf8"),
      ) as Partial<UserProfileStore>;
      storeCache = {
        profiles: (parsed.profiles ?? []).map((profile) =>
          hydrateProfile(profile),
        ),
        agent: hydrateAgent(parsed.agent),
      };
      return storeCache;
    },

    write(store) {
      storeCache = store;
      writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
    },

    update(userId, mutate, context) {
      const store = storage.read();
      const existingIndex = store.profiles.findIndex(
        (profile) => profile.userId === userId,
      );
      const base =
        existingIndex >= 0
          ? store.profiles[existingIndex]
          : createEmptyProfile(userId);
      const next = cloneProfile(base);

      mutate(next);
      recordInteraction(next, context);

      if (existingIndex >= 0) {
        store.profiles[existingIndex] = next;
      } else {
        store.profiles.push(next);
      }
      storage.write(store);
      return next;
    },

    updateAgent(mutate) {
      const store = storage.read();
      const next = cloneAgent(store.agent);
      mutate(next);
      store.agent = next;
      storage.write(store);
      return next;
    },
  };

  return storage;
}
