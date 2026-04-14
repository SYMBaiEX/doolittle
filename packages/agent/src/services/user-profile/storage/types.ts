import type { AgentIdentityRecord, UserProfileRecord } from "@/types";

export interface UserProfileStore {
  profiles: UserProfileRecord[];
  agent: AgentIdentityRecord;
}

export interface UserProfileInteractionContext {
  source?: string;
  channel?: string;
  sessionId?: string;
  signal?: string;
}

export interface UserProfileStorage {
  read(): UserProfileStore;
  write(store: UserProfileStore): void;
  update(
    userId: string,
    mutate: (profile: UserProfileRecord) => void,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord;
  updateAgent(
    mutate: (agent: AgentIdentityRecord) => void,
  ): AgentIdentityRecord;
}
