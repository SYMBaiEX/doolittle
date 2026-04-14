import type { UserProfileRecord } from "@/types";
import type {
  UserProfileInteractionContext,
  UserProfileStorage,
} from "../storage";

export function createSetModeMutation(
  storage: UserProfileStorage,
): (
  userId: string,
  mode: UserProfileRecord["memoryMode"],
  context?: UserProfileInteractionContext,
) => UserProfileRecord {
  return (userId, mode, context) =>
    storage.update(
      userId,
      (profile) => {
        profile.memoryMode = mode ?? "hybrid";
        profile.userMemoryMode = mode ?? "hybrid";
        profile.assistantMemoryMode = mode ?? "hybrid";
      },
      context,
    );
}

export function createConfigureModelingMutation(storage: UserProfileStorage): (
  userId: string,
  settings: {
    userMemoryMode?: "local" | "hybrid";
    assistantMemoryMode?: "local" | "hybrid";
    dialecticMode?: "off" | "assist" | "conclude";
  },
  context?: UserProfileInteractionContext,
) => UserProfileRecord {
  return (userId, settings, context) =>
    storage.update(
      userId,
      (profile) => {
        if (settings.userMemoryMode) {
          profile.userMemoryMode = settings.userMemoryMode;
          profile.memoryMode = settings.userMemoryMode;
        }
        if (settings.assistantMemoryMode) {
          profile.assistantMemoryMode = settings.assistantMemoryMode;
        }
        if (settings.dialecticMode) {
          profile.dialecticMode = settings.dialecticMode;
        }
      },
      context,
    );
}
