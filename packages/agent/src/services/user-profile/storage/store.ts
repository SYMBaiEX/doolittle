import { lstatSync } from "node:fs";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { readRegularFileSync } from "../../../utils/read-regular-file";
import { cloneAgent, cloneProfile } from "./clone";
import { createDefaultAgentIdentity, createEmptyProfile } from "./defaults";
import { recordInteraction } from "./interaction";
import { hydrateAgent, hydrateProfile } from "./normalization";
import type { UserProfileStorage, UserProfileStore } from "./types";

const MAX_PROFILE_BYTES = 4 * 1024 * 1024;

function readPersistedStore(path: string): Partial<UserProfileStore> {
  const parsed = JSON.parse(
    readRegularFileSync(path, MAX_PROFILE_BYTES, { singleLink: true }).toString(
      "utf8",
    ),
  ) as Partial<UserProfileStore>;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed.profiles !== undefined && !Array.isArray(parsed.profiles)) ||
    (Array.isArray(parsed.profiles) &&
      parsed.profiles.some(
        (profile) =>
          !profile ||
          typeof profile !== "object" ||
          Array.isArray(profile) ||
          typeof profile.userId !== "string",
      )) ||
    (parsed.agent !== undefined &&
      (!parsed.agent ||
        typeof parsed.agent !== "object" ||
        Array.isArray(parsed.agent)))
  ) {
    throw new Error("User profile store has invalid structure.");
  }
  return parsed;
}

export function createUserProfileStorage(filePath: string): UserProfileStorage {
  let storeCache: UserProfileStore | undefined;

  const storage: UserProfileStorage = {
    read() {
      if (storeCache) {
        return structuredClone(storeCache);
      }
      let present = true;
      try {
        lstatSync(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        present = false;
      }
      if (!present) {
        const initial = {
          profiles: [],
          agent: createDefaultAgentIdentity(),
        };
        storage.write(initial);
        return structuredClone(initial);
      }

      const parsed = readPersistedStore(filePath);
      storeCache = {
        profiles: (parsed.profiles ?? []).map((profile) =>
          hydrateProfile(profile),
        ),
        agent: hydrateAgent(parsed.agent),
      };
      return structuredClone(storeCache);
    },

    write(store) {
      if (
        Buffer.byteLength(JSON.stringify(store, null, 2), "utf8") >
        MAX_PROFILE_BYTES
      ) {
        throw new Error("User profile store exceeds its byte limit.");
      }
      try {
        readPersistedStore(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      writeJsonAtomicSync(filePath, store);
      storeCache = structuredClone(store);
    },

    update(userId, mutate, context) {
      const store = storage.read();
      const nextStore = { ...store, profiles: [...store.profiles] };
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
        nextStore.profiles[existingIndex] = next;
      } else {
        nextStore.profiles.push(next);
      }
      storage.write(nextStore);
      return cloneProfile(next);
    },

    updateAgent(mutate) {
      const store = storage.read();
      const next = cloneAgent(store.agent);
      mutate(next);
      storage.write({ ...store, agent: next });
      return cloneAgent(next);
    },
  };

  return storage;
}
