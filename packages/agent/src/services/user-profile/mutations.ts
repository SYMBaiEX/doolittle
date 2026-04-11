import type { UserProfileRecord } from "@/types";
import {
  applyAgentObservationSignals,
  applyUserObservationSignals,
} from "./observation";
import { nowIso, unique } from "./shared";
import type {
  UserProfileInteractionContext,
  UserProfileStorage,
} from "./storage";
import { normalizeRelationship } from "./storage";
import type {
  RememberKind,
  UserProfileMutationActions,
  UserProfileMutationHost,
} from "./types";

export function createUserProfileMutations(
  storage: UserProfileStorage,
  host: UserProfileMutationHost = {
    nowIso,
    unique,
    normalizeRelationship,
  },
): UserProfileMutationActions {
  const remember = (
    userId: string,
    kind: RememberKind,
    value: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord => {
    const nextValue = value.trim();
    return storage.update(
      userId,
      (profile) => {
        switch (kind) {
          case "preference":
            profile.preferences = host.unique([
              ...profile.preferences,
              nextValue,
            ]);
            break;
          case "fact":
            profile.facts = host.unique([...profile.facts, nextValue]);
            break;
          case "belief":
            profile.beliefs = host.unique([...profile.beliefs, nextValue]);
            profile.beliefSources = host.unique([
              ...(profile.beliefSources ?? []),
              source ?? "manual",
            ]);
            break;
          case "goal":
            profile.goals = host.unique([...(profile.goals ?? []), nextValue]);
            break;
          case "context":
            profile.projectContext = host.unique([
              ...(profile.projectContext ?? []),
              nextValue,
            ]);
            break;
          case "constraint":
            profile.constraints = host.unique([
              ...(profile.constraints ?? []),
              nextValue,
            ]);
            break;
          case "relationship":
            profile.relationship = host.normalizeRelationship({
              ...host.normalizeRelationship(profile.relationship),
              notes: host.unique([
                ...(profile.relationship?.notes ?? []),
                nextValue,
              ]),
              lastSource: source ?? profile.relationship?.lastSource,
              lastInteractionAt: host.nowIso(),
            });
            break;
          case "memory":
            profile.explicitMemories = host.unique([
              ...(profile.explicitMemories ?? []),
              nextValue,
            ]);
            break;
          default:
            profile.notes = host.unique([...profile.notes, nextValue]);
            break;
        }
        profile.lastSource = source ?? profile.lastSource;
      },
      context ?? { source },
    );
  };

  return {
    seedAgent(seed) {
      return storage.updateAgent((agent) => {
        if (seed.name?.trim()) {
          agent.name = seed.name.trim();
        }
        if (seed.goals?.length) {
          agent.goals = host.unique([...agent.goals, ...seed.goals]);
        }
        if (seed.strengths?.length) {
          agent.strengths = host.unique([
            ...agent.strengths,
            ...seed.strengths,
          ]);
        }
        if (seed.workStyle?.length) {
          agent.workStyle = host.unique([
            ...agent.workStyle,
            ...seed.workStyle,
          ]);
        }
        if (seed.notes?.length) {
          agent.notes = host.unique([...agent.notes, ...seed.notes]);
        }
      });
    },

    setMode(userId, mode, context) {
      return storage.update(
        userId,
        (profile) => {
          profile.memoryMode = mode ?? "hybrid";
          profile.userMemoryMode = mode ?? "hybrid";
          profile.assistantMemoryMode = mode ?? "hybrid";
        },
        context,
      );
    },

    configureModeling(userId, settings, context) {
      return storage.update(
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
    },

    addNote(userId, note, source, context) {
      return remember(userId, "note", note, source, context);
    },

    remember,

    observe(userId, message, source, context) {
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
    },

    observeAgent(note, source) {
      const observation = note.trim();
      return storage.updateAgent((agent) => {
        applyAgentObservationSignals(
          { unique: host.unique },
          agent,
          observation,
          source,
        );
      });
    },

    conclude(userId, query, conclusion, source) {
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
          profile.relationship = host.normalizeRelationship({
            ...host.normalizeRelationship(profile.relationship),
            notes: host
              .unique([
                ...(profile.relationship?.notes ?? []),
                `Conclusion: ${trimmedConclusion}`,
              ])
              .slice(-15),
            lastSource: source ?? profile.relationship?.lastSource,
            lastInteractionAt: host.nowIso(),
          });
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
    },
  };
}
