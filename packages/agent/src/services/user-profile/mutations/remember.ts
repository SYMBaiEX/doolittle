import type { UserProfileRecord } from "@/types";
import type {
  UserProfileInteractionContext,
  UserProfileStorage,
} from "../storage";
import type { RememberKind, UserProfileMutationHost } from "../types";
import { appendRelationshipNote } from "./relationship";

export function createRememberMutation(
  storage: UserProfileStorage,
  host: UserProfileMutationHost,
): (
  userId: string,
  kind: RememberKind,
  value: string,
  source?: string,
  context?: UserProfileInteractionContext,
) => UserProfileRecord {
  return (userId, kind, value, source, context) => {
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
            profile.relationship = appendRelationshipNote(
              host,
              profile.relationship,
              nextValue,
              source,
            );
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
}
