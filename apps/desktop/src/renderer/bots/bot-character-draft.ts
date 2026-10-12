import type { BotCharacterSheet } from "@doolittle/contracts/bots";

/** Interview answers become native Eliza personality fields, never access grants. */
export function botCharacterDraft(
  purpose: string,
  workingStyle: string,
): BotCharacterSheet {
  return {
    system: purpose.trim(),
    bio: [purpose.trim().slice(0, 2000)],
    style: { all: [workingStyle.trim()], chat: [workingStyle.trim()] },
  };
}
