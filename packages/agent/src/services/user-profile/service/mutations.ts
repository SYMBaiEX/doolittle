import type {
  AgentIdentityRecord,
  UserProfileConclusionRecord,
  UserProfileRecord,
} from "@/types";
import type { UserProfileInteractionContext } from "../storage";
import type { RememberKind, UserProfileMutationActions } from "../types";
import type {
  UserProfileAgentSeed,
  UserProfileModelingSettings,
} from "./types";

export function seedAgentProfile(
  mutations: UserProfileMutationActions,
  seed: UserProfileAgentSeed,
): AgentIdentityRecord {
  return mutations.seedAgent(seed);
}

export function setUserProfileMode(
  mutations: UserProfileMutationActions,
  userId: string,
  mode: UserProfileRecord["memoryMode"],
  context?: UserProfileInteractionContext,
): UserProfileRecord {
  return mutations.setMode(userId, mode, context);
}

export function configureUserProfileModeling(
  mutations: UserProfileMutationActions,
  userId: string,
  settings: UserProfileModelingSettings,
  context?: UserProfileInteractionContext,
): UserProfileRecord {
  return mutations.configureModeling(userId, settings, context);
}

export function addUserProfileNote(
  mutations: UserProfileMutationActions,
  userId: string,
  note: string,
  source?: string,
  context?: UserProfileInteractionContext,
): UserProfileRecord {
  return mutations.addNote(userId, note, source, context);
}

export function rememberUserProfileValue(
  mutations: UserProfileMutationActions,
  userId: string,
  kind: RememberKind,
  value: string,
  source?: string,
  context?: UserProfileInteractionContext,
): UserProfileRecord {
  return mutations.remember(userId, kind, value, source, context);
}

export function observeUserProfile(
  mutations: UserProfileMutationActions,
  userId: string,
  message: string,
  source?: string,
  context?: UserProfileInteractionContext,
): UserProfileRecord {
  return mutations.observe(userId, message, source, context);
}

export function observeAgentProfile(
  mutations: UserProfileMutationActions,
  note: string,
  source?: string,
): AgentIdentityRecord {
  return mutations.observeAgent(note, source);
}

export function concludeUserProfile(
  mutations: UserProfileMutationActions,
  userId: string,
  query: string,
  conclusion: string,
  source?: string,
): UserProfileConclusionRecord {
  return mutations.conclude(userId, query, conclusion, source);
}
