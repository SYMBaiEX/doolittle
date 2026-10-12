import { describe, expect, it } from "vitest";
import { normalizeBotCharacter } from "./bot-character";

describe("bot character sheet ingress", () => {
  it("validates a bounded native sheet with a trusted name", () => {
    expect(
      normalizeBotCharacter(
        { system: "Be helpful", style: { chat: ["Be precise"] } },
        "Research",
      ),
    ).toEqual({ system: "Be helpful", style: { chat: ["Be precise"] } });
  });

  it.each([
    "name",
    "id",
    "settings",
    "secrets",
    "plugins",
    "documents",
    "knowledge",
    "templates",
    "advancedMemory",
  ])("rejects forbidden %s", (field) => {
    expect(() =>
      normalizeBotCharacter(
        { system: "Safe", [field]: "injected" },
        "Research",
      ),
    ).toThrow(/unsupported/i);
  });

  it("rejects unknown nested fields, malformed examples, and oversized input", () => {
    expect(() =>
      normalizeBotCharacter(
        { system: "Safe", style: { settings: [] } },
        "Research",
      ),
    ).toThrow(/unsupported/i);
    expect(() =>
      normalizeBotCharacter(
        {
          system: "Safe",
          messageExamples: [
            {
              examples: [
                { name: "User", content: { text: "Hi", extra: true } },
              ],
            },
          ],
        },
        "Research",
      ),
    ).toThrow(/unsupported/i);
    expect(() =>
      normalizeBotCharacter({ system: "X".repeat(16_001) }, "Research"),
    ).toThrow(/invalid|size/i);
    expect(() =>
      normalizeBotCharacter(
        { system: "Safe", topics: Array(33).fill("topic") },
        "Research",
      ),
    ).toThrow(/invalid/i);
  });
});
