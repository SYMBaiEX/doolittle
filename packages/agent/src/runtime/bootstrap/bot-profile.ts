import { normalizeBotCharacter } from "@doolittle/contracts/bot-character";
import {
  type BotDefinition,
  isBotPermissions,
} from "@doolittle/contracts/bots";
import { isBotId, isUuid } from "@doolittle/contracts/identifiers";
import { type Character, parseCharacter, type UUID } from "@elizaos/core";

// Includes a <=24 KB sheet, its <=16 KB legacy persona projection, and
// route/permission metadata. Keep the launch envelope finite.
const MAX_PROFILE_LENGTH = 64_000;
let validatedProfile: { raw: string; profile: BotDefinition } | undefined;

function readSdkBotCharacter(value: unknown, name: string) {
  const sheet = normalizeBotCharacter(value);
  // Check the sheet against ElizaOS with the host-owned name. Keep the narrow
  // projection so SDK defaults cannot overwrite the shared base character.
  parseCharacter({ ...sheet, name });
  return sheet;
}

/** A named bot's process identity is fixed at launch, never selected per request. */
export function readWorkerBotProfile(
  env: NodeJS.ProcessEnv = process.env,
): BotDefinition | null {
  if (env.DOOLITTLE_BOT_RUNTIME !== "worker") return null;
  const raw = env.DOOLITTLE_BOT_PROFILE;
  if (!raw || raw.length > MAX_PROFILE_LENGTH) {
    throw new Error("A named bot requires a bounded launch profile.");
  }
  // HTTP dispatch and agent turns share the same launch payload. Return a
  // private copy so caller mutations cannot affect later authorization.
  if (validatedProfile?.raw === raw) {
    return structuredClone(validatedProfile.profile);
  }
  validatedProfile = undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("The named bot launch profile is invalid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The named bot launch profile is invalid.");
  }
  const profile = value as Partial<BotDefinition>;
  if (
    typeof profile.id !== "string" ||
    !isBotId(profile.id) ||
    typeof profile.agentId !== "string" ||
    !isUuid(profile.agentId) ||
    typeof profile.name !== "string" ||
    !profile.name.trim() ||
    typeof profile.persona !== "string" ||
    typeof profile.workspacePath !== "string" ||
    !profile.workspacePath ||
    profile.isDefault !== false ||
    !profile.model ||
    typeof profile.model.provider !== "string" ||
    typeof profile.model.model !== "string" ||
    !isBotPermissions(profile.permissions)
  ) {
    throw new Error("The named bot launch profile is incomplete.");
  }
  const character = readSdkBotCharacter(
    profile.character ?? { system: profile.persona },
    profile.name,
  );
  if (profile.persona !== character.system) {
    throw new Error("The named bot character conflicts with its persona.");
  }
  const result = { ...profile, character } as BotDefinition;
  validatedProfile = { raw, profile: result };
  return structuredClone(result);
}

/** Preserve Doolittle's safety baseline while applying a native character sheet. */
export function composeWorkerCharacter(
  base: Character,
  bot: BotDefinition,
): Character {
  const sheet = readSdkBotCharacter(
    bot.character ?? { system: bot.persona },
    bot.name,
  );
  if (sheet.system !== bot.persona) {
    throw new Error("The named bot character conflicts with its persona.");
  }
  return {
    ...base,
    ...sheet,
    bio:
      sheet.bio === undefined
        ? base.bio
        : typeof sheet.bio === "string"
          ? [sheet.bio]
          : sheet.bio,
    id: bot.agentId as UUID,
    name: bot.name,
    system: `${base.system ?? ""}\n\n${sheet.system}`,
  };
}
