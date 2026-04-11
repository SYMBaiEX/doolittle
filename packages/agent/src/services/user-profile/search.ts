import type { UserProfileRecord, UserProfileSearchHit } from "@/types";
import { unique } from "./shared";
import { normalizeEngagement, normalizeRelationship } from "./storage";

export interface UserProfileSearchReader {
  list(): UserProfileRecord[];
}

export function searchProfiles(
  reader: UserProfileSearchReader,
  query: string,
  limit = 10,
): UserProfileSearchHit[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const scored = reader.list().flatMap((profile) => {
    const matches: string[] = [];
    const relationship = normalizeRelationship(profile.relationship);
    const engagement = normalizeEngagement(profile.engagement);
    const fields = [
      ["displayName", profile.displayName],
      ["alias", profile.aliases?.join(" ")],
      ["preference", profile.preferences.join(" ")],
      ["fact", profile.facts.join(" ")],
      ["belief", profile.beliefs.join(" ")],
      ["beliefSource", profile.beliefSources?.join(" ")],
      ["goal", profile.goals?.join(" ")],
      ["context", profile.projectContext?.join(" ")],
      ["constraint", profile.constraints?.join(" ")],
      ["memory", profile.explicitMemories?.join(" ")],
      ["tool", profile.toolPreferences?.join(" ")],
      ["workStyle", profile.workStyle?.join(" ")],
      ["note", profile.notes.join(" ")],
      ["relationship", profile.relationship?.notes?.join(" ")],
      ["engagement", profile.engagement?.recentSignals?.join(" ")],
      ["status", profile.relationship?.status],
    ] as const;

    let score = 0;
    const preview: string[] = [];
    for (const [field, value] of fields) {
      if (!value) {
        continue;
      }
      const lower = value.toLowerCase();
      if (!lower.includes(normalized)) {
        continue;
      }
      matches.push(field);
      score += lower === normalized ? 50 : 10;
      score += lower.startsWith(normalized) ? 8 : 0;
      preview.push(
        `${field}: ${value.length > 120 ? `${value.slice(0, 120)}…` : value}`,
      );
    }

    if (!matches.length) {
      return [];
    }

    return [
      {
        userId: profile.userId,
        displayName: profile.displayName,
        score: score + Math.max(1, 20 - profile.updatedAt.length / 4),
        matchedFields: unique(matches),
        preview: unique(preview).slice(0, 3),
        relationshipStatus: relationship.status,
        trust: relationship.trust,
        collaboration: relationship.collaboration,
        touches: engagement.touches,
        channels: engagement.channels,
        lastInteractionAt:
          engagement.lastInteractionAt ?? relationship.lastInteractionAt,
        lastSource: engagement.lastSource ?? relationship.lastSource,
      },
    ];
  });

  return scored.sort((left, right) => right.score - left.score).slice(0, limit);
}
