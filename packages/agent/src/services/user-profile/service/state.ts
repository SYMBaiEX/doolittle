import { linkSync, lstatSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectorySync } from "../../../utils/private-directory";
import { readRegularFileSync } from "../../../utils/read-regular-file";
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
  const profileDir = join(baseDir, "profiles");
  ensurePrivateDirectorySync(profileDir);
  const legacyPath = join(baseDir, "user-profiles.json");
  const profilePath = join(profileDir, "user-profiles.json");
  let legacyExists = false;
  let currentExists = false;
  try {
    lstatSync(legacyPath);
    legacyExists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    lstatSync(profilePath);
    currentExists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (legacyExists && currentExists) {
    const legacyInfo = lstatSync(legacyPath);
    const currentInfo = lstatSync(profilePath);
    // Recover a crash between the exclusive hard-link and removal of legacy.
    if (
      legacyInfo.isFile() &&
      currentInfo.isFile() &&
      legacyInfo.nlink === 2 &&
      legacyInfo.dev === currentInfo.dev &&
      legacyInfo.ino === currentInfo.ino
    ) {
      unlinkSync(legacyPath);
      legacyExists = false;
    }
  }
  if (legacyExists && !currentExists) {
    const parsed = JSON.parse(
      readRegularFileSync(legacyPath, 4 * 1024 * 1024, {
        singleLink: true,
      }).toString("utf8"),
    ) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as Record<string, unknown>).profiles)
    ) {
      throw new Error("Legacy user profile store has invalid structure.");
    }
    // Exclusive destination creation preserves a concurrent or pre-existing store.
    linkSync(legacyPath, profilePath);
    unlinkSync(legacyPath);
  }
  const storage = createUserProfileStorage(profilePath);
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
