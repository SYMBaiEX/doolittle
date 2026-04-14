import type { UserProfileRecord } from "@/types";
import { parseUserObservation } from "../parsing/user";
import type { UserProfileObservationHost } from "../types";

export function applyUserObservationSignals(
  host: UserProfileObservationHost,
  profile: UserProfileRecord,
  observation: string,
  source?: string,
): void {
  const signals = parseUserObservation(observation);

  if (signals.preference && signals.preference.length < 160) {
    profile.preferences = host.unique([
      ...profile.preferences,
      signals.preference,
    ]);
  }
  if (signals.belief && signals.belief.length < 180) {
    profile.beliefs = host.unique([...profile.beliefs, signals.belief]);
    profile.beliefSources = host.unique([
      ...(profile.beliefSources ?? []),
      source ?? "observation",
    ]);
  }
  if (signals.fact && signals.fact.length < 160) {
    if (signals.lower.startsWith("my name is")) {
      profile.displayName = signals.fact.trim();
    } else {
      profile.facts = host.unique([...profile.facts, signals.fact]);
    }
  }
  if (signals.alias && signals.alias.length < 100) {
    profile.aliases = host.unique([...(profile.aliases ?? []), signals.alias]);
  }
  if (signals.goal && signals.goal.length < 180) {
    profile.goals = host.unique([...(profile.goals ?? []), signals.goal]);
  }
  if (signals.projectContext && signals.projectContext.length < 220) {
    profile.projectContext = host.unique([
      ...(profile.projectContext ?? []),
      signals.projectContext,
    ]);
  }
  if (signals.constraint && signals.constraint.length < 220) {
    profile.constraints = host.unique([
      ...(profile.constraints ?? []),
      signals.constraint,
    ]);
  }
  if (signals.toolSignals.length) {
    profile.toolPreferences = host.unique([
      ...(profile.toolPreferences ?? []),
      ...signals.toolSignals,
    ]);
  }
  if (signals.relationshipNote) {
    const current = host.normalizeRelationship(profile.relationship);
    current.notes = host
      .unique([...(current.notes ?? []), observation])
      .slice(-15);
    current.lastInteractionAt = host.nowIso();
    current.lastSource = source ?? current.lastSource;
    profile.relationship = host.normalizeRelationship(current);
  }
  if (signals.workStyle && signals.workStyle.length < 180) {
    profile.workStyle = host.unique([
      ...(profile.workStyle ?? []),
      signals.workStyle,
    ]);
  }
  if (signals.isExplicitMemory) {
    profile.explicitMemories = host.unique([
      ...(profile.explicitMemories ?? []),
      observation,
    ]);
  }
  if (signals.relationshipSignals > 0) {
    const current = host.normalizeRelationship(profile.relationship);
    current.trust = Math.min(
      10,
      current.trust + (signals.relationshipSignals > 1 ? 2 : 1),
    );
    current.collaboration = Math.min(
      10,
      current.collaboration + (signals.relationshipSignals > 1 ? 2 : 1),
    );
    current.notes = host
      .unique([...(current.notes ?? []), observation])
      .slice(-15);
    current.lastInteractionAt = host.nowIso();
    current.lastSource = source ?? current.lastSource;
    profile.relationship = host.normalizeRelationship(current);
  }

  profile.lastSource = source ?? profile.lastSource;
}
