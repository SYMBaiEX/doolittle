import type { AppServices } from "@/services";
import { getNativeServices, type RuntimeLike } from "../runtime";
import type { NativePersonalitySummary, NativeRolodexSummary } from "./types";

/**
 * Identity is owned by the registered Eliza services. The product services are
 * persistence ports injected into those plugins and remain the compatibility
 * fallback while a runtime is booting or a plugin is unavailable.
 */
export type IdentityServices = Pick<
  AppServices,
  "personalities" | "userProfiles"
>;

type PersonalityProfile = ReturnType<
  IdentityServices["personalities"]["getActive"]
>;
type UserMemoryKind = Parameters<
  IdentityServices["userProfiles"]["remember"]
>[1];

export function getEffectiveActivePersonality(
  runtime: RuntimeLike,
  services: IdentityServices,
): PersonalityProfile {
  const personality = getNativeServices(runtime).personality;
  const activeId = personality?.activeId();
  return ((activeId ? personality?.get(activeId) : undefined) ??
    services.personalities.getActive()) as PersonalityProfile;
}

export function activateEffectivePersonality(
  runtime: RuntimeLike,
  services: IdentityServices,
  id: string,
): PersonalityProfile {
  return (getNativeServices(runtime).personality?.activate(id) ??
    services.personalities.setActive(id)) as PersonalityProfile;
}

export function getEffectivePersonalitySummary(
  runtime: RuntimeLike,
  services: IdentityServices,
): NativePersonalitySummary {
  return (getNativeServices(runtime).personality?.summary?.() ??
    services.personalities.summary()) as NativePersonalitySummary;
}

export function getEffectivePersonalityList(
  runtime: RuntimeLike,
  services: IdentityServices,
): PersonalityProfile[] {
  return (getNativeServices(runtime).personality?.list?.() ??
    services.personalities.list()) as PersonalityProfile[];
}

export function getEffectiveRolodexSummary(
  runtime: RuntimeLike,
  services: IdentityServices,
): NativeRolodexSummary {
  return (getNativeServices(runtime).rolodex?.summary?.() ??
    services.userProfiles.summary()) as NativeRolodexSummary;
}

export function getEffectiveUserProfileSummary(
  runtime: RuntimeLike,
  services: IdentityServices,
): NativeRolodexSummary {
  return getEffectiveRolodexSummary(runtime, services);
}

export function getEffectiveUserProfileSearch(
  runtime: RuntimeLike,
  services: IdentityServices,
  query: string,
  limit = 10,
) {
  return (
    getNativeServices(runtime).rolodex?.search?.(query, limit) ??
    services.userProfiles.search(query, limit)
  );
}

export function getEffectiveUserProfileCard(
  runtime: RuntimeLike,
  services: IdentityServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.card(userId) ??
    services.userProfiles.renderCards(userId)
  );
}

export function recallEffectiveUserProfile(
  runtime: RuntimeLike,
  services: IdentityServices,
  userId: string,
  query: string,
) {
  return (
    getNativeServices(runtime).rolodex?.recall(userId, query) ??
    services.userProfiles.recall(userId, query)
  );
}

export function rememberEffectiveUserProfile(
  runtime: RuntimeLike,
  services: IdentityServices,
  userId: string,
  kind: UserMemoryKind,
  value: string,
  source?: string,
) {
  return (
    getNativeServices(runtime).rolodex?.remember(userId, kind, value, source) ??
    services.userProfiles.remember(userId, kind, value, source)
  );
}

export function observeEffectiveAgentProfile(
  runtime: RuntimeLike,
  services: IdentityServices,
  note: string,
  source?: string,
) {
  return (
    getNativeServices(runtime).rolodex?.observeAgent(note, source) ??
    services.userProfiles.observeAgent(note, source)
  );
}

export function getEffectiveAgentProfile(
  runtime: RuntimeLike,
  services: IdentityServices,
) {
  return (
    getNativeServices(runtime).rolodex?.agentProfile() ??
    services.userProfiles.getAgent()
  );
}

export function getEffectiveAgentProfileCard(
  runtime: RuntimeLike,
  services: IdentityServices,
) {
  return (
    getNativeServices(runtime).rolodex?.agentProfile() ??
    services.userProfiles.renderAgent()
  );
}

export function getEffectiveUserBeliefs(
  runtime: RuntimeLike,
  services: IdentityServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.beliefs?.(userId) ??
    services.userProfiles.beliefs(userId)
  );
}

export function getEffectiveUserRelationship(
  runtime: RuntimeLike,
  services: IdentityServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.relationship?.(userId) ??
    services.userProfiles.relationship(userId)
  );
}

export function getEffectiveUserEngagement(
  runtime: RuntimeLike,
  services: IdentityServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.engagement?.(userId) ??
    services.userProfiles.engagement(userId)
  );
}

export function getEffectiveGeneratedSkills(
  _runtime: RuntimeLike,
  services: Pick<AppServices, "skillSynthesis">,
): unknown[] {
  return services.skillSynthesis.listGeneratedSkills();
}
