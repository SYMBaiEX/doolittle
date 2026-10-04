import type { BotDefinition } from "@doolittle/contracts/bots";

const BOT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const AGENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** A named bot's process identity is fixed at launch, never selected per request. */
export function readWorkerBotProfile(
  env: NodeJS.ProcessEnv = process.env,
): BotDefinition | null {
  if (env.DOOLITTLE_BOT_RUNTIME !== "worker") return null;
  const raw = env.DOOLITTLE_BOT_PROFILE;
  if (!raw || raw.length > 32_000) {
    throw new Error("A named bot requires a bounded launch profile.");
  }
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
    !BOT_ID_PATTERN.test(profile.id) ||
    typeof profile.agentId !== "string" ||
    !AGENT_ID_PATTERN.test(profile.agentId) ||
    typeof profile.name !== "string" ||
    !profile.name.trim() ||
    typeof profile.persona !== "string" ||
    typeof profile.workspacePath !== "string" ||
    !profile.workspacePath ||
    profile.isDefault !== false ||
    !profile.model ||
    typeof profile.model.provider !== "string" ||
    typeof profile.model.model !== "string" ||
    !profile.permissions ||
    !Array.isArray(profile.permissions.connectionIds) ||
    !Array.isArray(profile.permissions.workspacePaths) ||
    !Array.isArray(profile.permissions.toolIds) ||
    typeof profile.permissions.allowMutation !== "boolean" ||
    typeof profile.permissions.allowDelegation !== "boolean"
  ) {
    throw new Error("The named bot launch profile is incomplete.");
  }
  return profile as BotDefinition;
}
