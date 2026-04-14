import type {
  AgentIdentityRecord,
  UserProfileBeliefSummary,
  UserProfileConclusionRecord,
  UserProfileContextSummary,
  UserProfileEngagementSummary,
  UserProfileRecord,
  UserProfileRelationshipSummary,
  UserProfileSearchHit,
  UserProfileWorkspaceSummary,
} from "@/types";
import type { ProfileReader } from "../insights";
import type { ProfileRenderReader } from "../render/reader";
import type { UserProfileSearchReader } from "../search";
import type {
  UserProfileInteractionContext,
  UserProfileStorage,
} from "../storage";
import type {
  RememberKind,
  UserProfileMutationActions,
  UserProfileRecallHit,
} from "../types";
import {
  addUserProfileNote,
  concludeUserProfile,
  configureUserProfileModeling,
  observeAgentProfile,
  observeUserProfile,
  rememberUserProfileValue,
  seedAgentProfile,
  setUserProfileMode,
} from "./mutations";
import {
  buildUserProfileContext,
  getAgentProfile,
  getBeliefSummary,
  getEngagementSummary,
  getRelationshipSummary,
  getUserProfile,
  listUserProfiles,
  recallUserProfileContext,
  searchUserProfiles,
} from "./queries";
import {
  renderAgentProfile,
  renderUserProfileCard,
  renderUserProfileDetail,
  summarizeUserProfileWorkspace,
} from "./render";
import { createUserProfileServiceState } from "./state";
import type {
  UserProfileAgentSeed,
  UserProfileMemoryMode,
  UserProfileModelingSettings,
} from "./types";

export type { UserProfileRecallHit } from "../types";
export type {
  UserProfileAgentSeed,
  UserProfileMemoryMode,
  UserProfileModelingSettings,
} from "./types";

export class UserProfileService
  implements ProfileReader, ProfileRenderReader, UserProfileSearchReader
{
  private readonly storage: UserProfileStorage;
  private readonly mutations: UserProfileMutationActions;

  constructor(baseDir: string) {
    const state = createUserProfileServiceState(baseDir);
    this.storage = state.storage;
    this.mutations = state.mutations;
  }

  list(): UserProfileRecord[] {
    return listUserProfiles(this.storage);
  }

  get(userId: string): UserProfileRecord {
    return getUserProfile(this.storage, userId);
  }

  getAgent(): AgentIdentityRecord {
    return getAgentProfile(this.storage);
  }

  card(userId: string): string {
    return this.renderCards(userId);
  }

  agentProfile(): string {
    return this.renderAgent();
  }

  beliefs(userId: string): UserProfileBeliefSummary {
    return getBeliefSummary(this, userId);
  }

  relationship(userId: string): UserProfileRelationshipSummary {
    return getRelationshipSummary(this, userId);
  }

  engagement(userId: string): UserProfileEngagementSummary {
    return getEngagementSummary(this, userId);
  }

  search(query: string, limit = 10): UserProfileSearchHit[] {
    return searchUserProfiles(this, query, limit);
  }

  seedAgent(seed: UserProfileAgentSeed): AgentIdentityRecord {
    return seedAgentProfile(this.mutations, seed);
  }

  setMode(
    userId: string,
    mode: UserProfileMemoryMode,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return setUserProfileMode(this.mutations, userId, mode, context);
  }

  configureModeling(
    userId: string,
    settings: UserProfileModelingSettings,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return configureUserProfileModeling(
      this.mutations,
      userId,
      settings,
      context,
    );
  }

  addNote(
    userId: string,
    note: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return addUserProfileNote(this.mutations, userId, note, source, context);
  }

  remember(
    userId: string,
    kind: RememberKind,
    value: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return rememberUserProfileValue(
      this.mutations,
      userId,
      kind,
      value,
      source,
      context,
    );
  }

  observe(
    userId: string,
    message: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return observeUserProfile(this.mutations, userId, message, source, context);
  }

  observeAgent(note: string, source?: string): AgentIdentityRecord {
    return observeAgentProfile(this.mutations, note, source);
  }

  recall(userId: string, query: string, limit = 8): UserProfileRecallHit[] {
    return recallUserProfileContext(this, userId, query, limit);
  }

  context(userId: string, query: string): UserProfileContextSummary {
    return buildUserProfileContext(this, userId, query);
  }

  conclude(
    userId: string,
    query: string,
    conclusion: string,
    source?: string,
  ): UserProfileConclusionRecord {
    return concludeUserProfile(
      this.mutations,
      userId,
      query,
      conclusion,
      source,
    );
  }

  render(userId: string): string {
    return renderUserProfileDetail(this, userId);
  }

  renderAgent(): string {
    return renderAgentProfile(this);
  }

  renderCards(userId: string): string {
    return renderUserProfileCard(this, userId);
  }

  summary(): UserProfileWorkspaceSummary {
    return summarizeUserProfileWorkspace(this);
  }
}
