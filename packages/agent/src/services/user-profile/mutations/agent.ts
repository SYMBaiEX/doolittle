import type { AgentIdentityRecord } from "@/types";
import type { UserProfileStorage } from "../storage";
import type { UserProfileMutationHost } from "../types";

export function createSeedAgentMutation(
  storage: UserProfileStorage,
  host: UserProfileMutationHost,
): (seed: {
  name?: string;
  goals?: string[];
  strengths?: string[];
  workStyle?: string[];
  notes?: string[];
}) => AgentIdentityRecord {
  return (seed) =>
    storage.updateAgent((agent) => {
      if (seed.name?.trim()) {
        agent.name = seed.name.trim();
      }
      if (seed.goals?.length) {
        agent.goals = host.unique([...agent.goals, ...seed.goals]);
      }
      if (seed.strengths?.length) {
        agent.strengths = host.unique([...agent.strengths, ...seed.strengths]);
      }
      if (seed.workStyle?.length) {
        agent.workStyle = host.unique([...agent.workStyle, ...seed.workStyle]);
      }
      if (seed.notes?.length) {
        agent.notes = host.unique([...agent.notes, ...seed.notes]);
      }
    });
}
