import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
import {
  context as getUserProfileContext,
  recall as getUserProfileRecall,
} from "./insights";
import { createUserProfileMutations } from "./mutations";
import {
  render as renderUserProfile,
  renderAgent as renderUserProfileAgent,
  renderCards as renderUserProfileCards,
  summary as summarizeUserProfiles,
} from "./rendering";
import { searchProfiles } from "./search";
import {
  createEmptyProfile,
  createUserProfileStorage,
  normalizeRelationship,
  type UserProfileInteractionContext,
  type UserProfileStorage,
} from "./storage";
import {
  buildBeliefSummary,
  buildEngagementSummary,
  buildRelationshipSummary,
} from "./summaries";
import type {
  RememberKind,
  UserProfileMutationActions,
  UserProfileRecallHit,
} from "./types";

export type { UserProfileRecallHit } from "./types";

export class UserProfileService {
  private readonly storage: UserProfileStorage;
  private readonly mutations: UserProfileMutationActions;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.storage = createUserProfileStorage(
      join(baseDir, "user-profiles.json"),
    );
    this.mutations = createUserProfileMutations(this.storage, {
      nowIso: () => new Date().toISOString(),
      unique: (items: string[]) =>
        Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))),
      normalizeRelationship,
    });
  }

  list(): UserProfileRecord[] {
    return this.storage
      .read()
      .profiles.slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(userId: string): UserProfileRecord {
    const existing = this.storage
      .read()
      .profiles.find((profile) => profile.userId === userId);
    return existing ? { ...existing } : createEmptyProfile(userId);
  }

  getAgent(): AgentIdentityRecord {
    return this.storage.read().agent;
  }

  card(userId: string): string {
    return this.renderCards(userId);
  }

  agentProfile(): string {
    return this.renderAgent();
  }

  beliefs(userId: string): UserProfileBeliefSummary {
    return buildBeliefSummary(this, userId);
  }

  relationship(userId: string): UserProfileRelationshipSummary {
    return buildRelationshipSummary(this, userId);
  }

  engagement(userId: string): UserProfileEngagementSummary {
    return buildEngagementSummary(this, userId);
  }

  search(query: string, limit = 10): UserProfileSearchHit[] {
    return searchProfiles(this, query, limit);
  }

  seedAgent(seed: {
    name?: string;
    goals?: string[];
    strengths?: string[];
    workStyle?: string[];
    notes?: string[];
  }): AgentIdentityRecord {
    return this.mutations.seedAgent(seed);
  }

  setMode(
    userId: string,
    mode: UserProfileRecord["memoryMode"],
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return this.mutations.setMode(userId, mode, context);
  }

  configureModeling(
    userId: string,
    settings: {
      userMemoryMode?: "local" | "hybrid";
      assistantMemoryMode?: "local" | "hybrid";
      dialecticMode?: "off" | "assist" | "conclude";
    },
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return this.mutations.configureModeling(userId, settings, context);
  }

  addNote(
    userId: string,
    note: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return this.mutations.addNote(userId, note, source, context);
  }

  remember(
    userId: string,
    kind: RememberKind,
    value: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return this.mutations.remember(userId, kind, value, source, context);
  }

  observe(
    userId: string,
    message: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return this.mutations.observe(userId, message, source, context);
  }

  observeAgent(note: string, source?: string): AgentIdentityRecord {
    return this.mutations.observeAgent(note, source);
  }

  recall(userId: string, query: string, limit = 8): UserProfileRecallHit[] {
    return getUserProfileRecall(this, userId, query, limit);
  }

  context(userId: string, query: string): UserProfileContextSummary {
    return getUserProfileContext(this, userId, query);
  }

  conclude(
    userId: string,
    query: string,
    conclusion: string,
    source?: string,
  ): UserProfileConclusionRecord {
    return this.mutations.conclude(userId, query, conclusion, source);
  }

  render(userId: string): string {
    return renderUserProfile(this, userId);
  }

  renderAgent(): string {
    return renderUserProfileAgent(this);
  }

  renderCards(userId: string): string {
    return renderUserProfileCards(this, userId);
  }

  summary(): UserProfileWorkspaceSummary {
    return summarizeUserProfiles(this);
  }
}
