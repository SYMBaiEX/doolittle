import type { AgentIdentityRecord, UserProfileRecord } from "@/types";
import {
  applyAgentObservationSignals,
  applyUserObservationSignals,
} from "../observation";
import type {
  UserProfileInteractionContext,
  UserProfileStorage,
} from "../storage";
import type { UserProfileMutationHost } from "../types";

export function createObserveMutation(
  storage: UserProfileStorage,
  host: UserProfileMutationHost,
): (
  userId: string,
  message: string,
  source?: string,
  context?: UserProfileInteractionContext,
) => UserProfileRecord {
  return (userId, message, source, context) => {
    const observation = message.trim();
    return storage.update(
      userId,
      (profile) => {
        applyUserObservationSignals(
          {
            nowIso: host.nowIso,
            unique: host.unique,
            normalizeRelationship: host.normalizeRelationship,
          },
          profile,
          observation,
          source,
        );
      },
      context ?? { source, channel: source, signal: observation },
    );
  };
}

export function createObserveAgentMutation(
  storage: UserProfileStorage,
  host: UserProfileMutationHost,
): (note: string, source?: string) => AgentIdentityRecord {
  return (note, source) => {
    const observation = note.trim();
    return storage.updateAgent((agent) => {
      applyAgentObservationSignals(
        { unique: host.unique },
        agent,
        observation,
        source,
      );
    });
  };
}
