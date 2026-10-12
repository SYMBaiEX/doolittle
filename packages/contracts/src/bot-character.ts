import { type CharacterInput, parseCharacter } from "@elizaos/core";

/** User-owned personality fields, never runtime identity or configuration. */
export interface BotCharacterSheet
  extends Pick<
    CharacterInput,
    "bio" | "style" | "topics" | "adjectives" | "postExamples"
  > {
  system: string;
  messageExamples?: Array<{
    examples: Array<{ name: string; content: { text: string } }>;
  }>;
}

const FIELDS = new Set([
  "system",
  "bio",
  "style",
  "topics",
  "adjectives",
  "messageExamples",
  "postExamples",
]);
const STYLE_FIELDS = new Set(["all", "chat", "post"]);
const MAX_BYTES = 24_000;

function record(
  value: unknown,
  label: string,
  fields: Set<string>,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.has(key))
  ) {
    throw new Error(`${label} contains unsupported fields.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, limit: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > limit ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
      );
    })
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value.trim();
}

function list(value: unknown, label: string, max = 32): string[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error(`${label} is invalid.`);
  return value.map((entry) => text(entry, label, 2_000));
}

/** Strict ingress for catalog input, persisted records, and worker launch profiles. */
export function normalizeBotCharacter(
  value: unknown,
  trustedName: string,
): BotCharacterSheet {
  const sheet = record(value, "Bot character", FIELDS);
  // Parse before constructing SDK input: JSON size and allowlists must hold even
  // though the SDK normalizer silently drops unknown properties.
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) {
    throw new Error("Bot character exceeds its supported size.");
  }
  const normalized: BotCharacterSheet = {
    system: text(sheet.system, "Bot character system", 16_000),
  };
  if (sheet.bio !== undefined)
    normalized.bio =
      typeof sheet.bio === "string"
        ? text(sheet.bio, "Bot character bio", 2_000)
        : list(sheet.bio, "Bot character bio");
  if (sheet.topics !== undefined)
    normalized.topics = list(sheet.topics, "Bot character topics");
  if (sheet.adjectives !== undefined)
    normalized.adjectives = list(sheet.adjectives, "Bot character adjectives");
  if (sheet.postExamples !== undefined)
    normalized.postExamples = list(sheet.postExamples, "Bot post examples");
  if (sheet.style !== undefined) {
    const style = record(sheet.style, "Bot character style", STYLE_FIELDS);
    normalized.style = {};
    for (const key of ["all", "chat", "post"] as const) {
      if (style[key] !== undefined)
        normalized.style[key] = list(style[key], `Bot character style ${key}`);
    }
  }
  if (sheet.messageExamples !== undefined) {
    if (
      !Array.isArray(sheet.messageExamples) ||
      sheet.messageExamples.length > 8
    ) {
      throw new Error("Bot message examples are invalid.");
    }
    normalized.messageExamples = sheet.messageExamples.map((group) => {
      const entry = record(group, "Bot message example", new Set(["examples"]));
      if (!Array.isArray(entry.examples) || entry.examples.length > 12) {
        throw new Error("Bot message examples are invalid.");
      }
      return {
        examples: entry.examples.map((message) => {
          const item = record(
            message,
            "Bot message example",
            new Set(["name", "content"]),
          );
          const content = record(
            item.content,
            "Bot message content",
            new Set(["text"]),
          );
          return {
            name: text(item.name, "Bot message speaker", 80),
            content: { text: text(content.text, "Bot message text", 2_000) },
          };
        }),
      };
    });
  }
  // SDK validation is deliberately last; the name is host-owned, not accepted
  // from the sheet. Preserve our narrower projection, not SDK default fields.
  parseCharacter({ ...normalized, name: trustedName } satisfies CharacterInput);
  return normalized;
}
