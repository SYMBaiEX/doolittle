import type { AppServices } from "@/services";
import { getNativeServices, type RuntimeLike } from "../runtime";
import type { NativePersonalitySummary, NativeRolodexSummary } from "./types";

export function getEffectivePersonalitySummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativePersonalitySummary {
  return (getNativeServices(runtime).personality?.summary?.() ?? {
    ...(services.personalities?.summary?.() ?? {
      total: 0,
      names: [],
    }),
  }) as NativePersonalitySummary;
}

export function getEffectiveRolodexSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeRolodexSummary {
  return (getNativeServices(runtime).rolodex?.summary?.() ?? {
    ...services.userProfiles.summary(),
  }) as NativeRolodexSummary;
}

export function getEffectiveUserProfileSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeRolodexSummary {
  return getEffectiveRolodexSummary(runtime, services);
}

export function getEffectiveUserProfileSearch(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 10,
) {
  return (
    getNativeServices(runtime).rolodex?.search?.(query, limit) ??
    services.userProfiles.search(query, limit)
  );
}

export function getEffectiveUserBeliefs(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.beliefs?.(userId) ??
    services.userProfiles.beliefs(userId)
  );
}

export function getEffectiveUserRelationship(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.relationship?.(userId) ??
    services.userProfiles.relationship(userId)
  );
}

export function getEffectiveUserEngagement(
  runtime: RuntimeLike,
  services: AppServices,
  userId: string,
) {
  return (
    getNativeServices(runtime).rolodex?.engagement?.(userId) ??
    services.userProfiles.engagement(userId)
  );
}

export function getEffectivePersonalityList(
  runtime: RuntimeLike,
  services: AppServices,
): unknown[] {
  return (
    getNativeServices(runtime).personality?.list?.() ??
    services.personalities.list()
  );
}

export function getEffectiveGeneratedSkills(
  runtime: RuntimeLike,
  services: AppServices,
): unknown[] {
  return (
    getNativeServices(runtime).agentSkills?.generated?.() ??
    services.skillSynthesis.listGeneratedSkills()
  );
}
