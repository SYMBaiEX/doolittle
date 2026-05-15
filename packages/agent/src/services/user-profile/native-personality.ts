import type { UserProfileRecord } from "@/types";

export const NATIVE_USER_PERSONALITY_PREFERENCES_TABLE =
  "user_personality_preferences";

export const NATIVE_USER_PERSONALITY_MAX_PREFERENCES = 10;

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function buildNativeUserPersonalityPreferences(
  profile: Pick<
    UserProfileRecord,
    "aliases" | "displayName" | "preferences" | "toolPreferences" | "workStyle"
  >,
  limit = NATIVE_USER_PERSONALITY_MAX_PREFERENCES,
): string[] {
  const preferredName = profile.displayName ?? profile.aliases?.at(-1);
  return unique([
    preferredName ? `Address the user as ${preferredName} when natural.` : "",
    ...profile.preferences,
    ...(profile.workStyle ?? []).map((entry) => `Interaction style: ${entry}`),
    ...(profile.toolPreferences ?? []).map(
      (entry) => `Tool preference: ${entry}`,
    ),
  ]).slice(0, Math.max(0, limit));
}
