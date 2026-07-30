import {
  DOOLITTLE_PERSONALITY_SERVICE,
  DOOLITTLE_ROLODEX_SERVICE,
} from "@doolittle/contracts";
import { getScopedTurnPersonalityId } from "@/runtime/turn-runtime-scope";
import type { AppServices } from "@/services";
import type { PersonalityProfile } from "@/types";
import { getNativeServices, type RuntimeLike } from "../runtime";
import type {
  NativePersonalityService,
  NativeRolodexService,
} from "../runtime-contracts";
import type { NativePersonalitySummary, NativeRolodexSummary } from "./types";

type UserMemoryKind = Parameters<NativeRolodexService["remember"]>[1];

function requirePersonalityService(
  runtime: RuntimeLike,
): NativePersonalityService {
  const service = getNativeServices(runtime).personality;
  if (!service) {
    throw new Error(
      `Required Eliza service ${DOOLITTLE_PERSONALITY_SERVICE} is unavailable.`,
    );
  }
  return service;
}

function requireRolodexService(runtime: RuntimeLike): NativeRolodexService {
  const service = getNativeServices(runtime).rolodex;
  if (!service) {
    throw new Error(
      `Required Eliza service ${DOOLITTLE_ROLODEX_SERVICE} is unavailable.`,
    );
  }
  return service;
}

export function getEffectiveActivePersonality(
  runtime: RuntimeLike,
): PersonalityProfile {
  const service = requirePersonalityService(runtime);
  const activeId = getScopedTurnPersonalityId(runtime) ?? service.activeId();
  const profile = activeId ? service.get(activeId) : undefined;
  if (!profile) {
    throw new Error("The Eliza personality service has no active profile.");
  }
  return profile as PersonalityProfile;
}

export function activateEffectivePersonality(
  runtime: RuntimeLike,
  id: string,
): PersonalityProfile {
  return requirePersonalityService(runtime).activate(id) as PersonalityProfile;
}

export function getEffectivePersonalitySummary(
  runtime: RuntimeLike,
): NativePersonalitySummary {
  return requirePersonalityService(
    runtime,
  ).summary() as NativePersonalitySummary;
}

export function getEffectivePersonalityList(
  runtime: RuntimeLike,
): PersonalityProfile[] {
  return requirePersonalityService(runtime).list() as PersonalityProfile[];
}

export function getEffectiveRolodexSummary(
  runtime: RuntimeLike,
): NativeRolodexSummary {
  return requireRolodexService(runtime).summary() as NativeRolodexSummary;
}

export function getEffectiveUserProfileSummary(
  runtime: RuntimeLike,
): NativeRolodexSummary {
  return getEffectiveRolodexSummary(runtime);
}

export function listEffectiveUserProfiles(runtime: RuntimeLike) {
  return requireRolodexService(runtime).list();
}

export function getEffectiveUserProfile(runtime: RuntimeLike, userId: string) {
  return requireRolodexService(runtime).get(userId);
}

export function getEffectiveUserProfileSearch(
  runtime: RuntimeLike,
  query: string,
  limit = 10,
) {
  return requireRolodexService(runtime).search(query, limit);
}

export function getEffectiveUserProfileCard(
  runtime: RuntimeLike,
  userId: string,
) {
  return requireRolodexService(runtime).card(userId);
}

export function recallEffectiveUserProfile(
  runtime: RuntimeLike,
  userId: string,
  query: string,
) {
  return requireRolodexService(runtime).recall(userId, query);
}

export function rememberEffectiveUserProfile(
  runtime: RuntimeLike,
  userId: string,
  kind: UserMemoryKind,
  value: string,
  source?: string,
) {
  return requireRolodexService(runtime).remember(userId, kind, value, source);
}

export function observeEffectiveAgentProfile(
  runtime: RuntimeLike,
  note: string,
  source?: string,
) {
  return requireRolodexService(runtime).observeAgent(note, source);
}

export function observeEffectiveUserProfile(
  runtime: RuntimeLike,
  userId: string,
  message: string,
  source?: string,
  context?: Parameters<NativeRolodexService["observe"]>[3],
) {
  return requireRolodexService(runtime).observe(
    userId,
    message,
    source,
    context,
  );
}

export function getEffectiveUserProfileContext(
  runtime: RuntimeLike,
  userId: string,
  query: string,
) {
  return requireRolodexService(runtime).context(userId, query);
}

export function concludeEffectiveUserProfile(
  runtime: RuntimeLike,
  userId: string,
  query: string,
  conclusion: string,
  source?: string,
) {
  return requireRolodexService(runtime).conclude(
    userId,
    query,
    conclusion,
    source,
  );
}

export function setEffectiveUserProfileMode(
  runtime: RuntimeLike,
  userId: string,
  mode: "local" | "hybrid",
) {
  return requireRolodexService(runtime).setMode(userId, mode);
}

export function configureEffectiveUserProfileModeling(
  runtime: RuntimeLike,
  userId: string,
  settings: Parameters<NativeRolodexService["configureModeling"]>[1],
) {
  return requireRolodexService(runtime).configureModeling(userId, settings);
}

export function seedEffectiveAgentProfile(
  runtime: RuntimeLike,
  seed: Parameters<NativeRolodexService["seedAgent"]>[0],
) {
  return requireRolodexService(runtime).seedAgent(seed);
}

export function getEffectiveAgentProfile(runtime: RuntimeLike) {
  return requireRolodexService(runtime).agentProfile();
}

export function getEffectiveAgentProfileCard(runtime: RuntimeLike) {
  return requireRolodexService(runtime).agentProfile();
}

export function getEffectiveUserBeliefs(runtime: RuntimeLike, userId: string) {
  return requireRolodexService(runtime).beliefs(userId);
}

export function getEffectiveUserRelationship(
  runtime: RuntimeLike,
  userId: string,
) {
  return requireRolodexService(runtime).relationship(userId);
}

export function getEffectiveUserEngagement(
  runtime: RuntimeLike,
  userId: string,
) {
  return requireRolodexService(runtime).engagement(userId);
}

export function getEffectiveGeneratedSkills(
  _runtime: RuntimeLike,
  services: Pick<AppServices, "skillSynthesis">,
): unknown[] {
  return services.skillSynthesis.listGeneratedSkills();
}
