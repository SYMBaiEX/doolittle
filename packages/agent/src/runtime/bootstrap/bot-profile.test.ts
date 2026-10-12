import type { BotDefinition } from "@doolittle/contracts/bots";
import { describe, expect, it } from "vitest";
import character from "@/character";
import { composeWorkerCharacter, readWorkerBotProfile } from "./bot-profile";

const bot: BotDefinition = {
  id: "research",
  agentId: "12345678-1234-1234-1234-123456789abc",
  name: "Research",
  persona: "Investigate carefully",
  character: {
    system: "Investigate carefully",
    bio: ["Archivist"],
    style: { chat: ["Cite evidence"] },
    topics: ["history"],
  },
  model: { provider: "offline", model: "offline" },
  permissions: {
    connectionIds: [],
    workspacePaths: ["/tmp"],
    toolIds: [],
    allowMutation: false,
    allowDelegation: false,
  },
  workspacePath: "/tmp",
  isDefault: false,
  createdAt: "",
  updatedAt: "",
};

const env = (profile: unknown) => ({
  DOOLITTLE_BOT_RUNTIME: "worker",
  DOOLITTLE_BOT_PROFILE: JSON.stringify(profile),
});

describe("named bot character launch", () => {
  it("retains stable identity and Doolittle baseline while applying native fields", () => {
    const profile = readWorkerBotProfile(env(bot));
    expect(profile?.agentId).toBe(bot.agentId);
    if (!profile) throw new Error("Expected a worker profile.");
    const composed = composeWorkerCharacter(character, profile);
    expect(composed.id).toBe(bot.agentId);
    expect(composed.name).toBe("Research");
    expect(composed.system).toContain(character.system);
    expect(composed.system).toContain(bot.persona);
    expect(composed.system).toBe(`${character.system}\n\n${bot.persona}`);
    expect(composed.bio).toEqual(["Archivist"]);
    expect(composed.style?.chat).toEqual(["Cite evidence"]);
    expect(composed.topics).toEqual(["history"]);
    expect(composed.settings).toEqual(character.settings);
  });

  it("hydrates a legacy worker profile", () => {
    const { character: _unused, ...legacy } = bot;
    expect(readWorkerBotProfile(env(legacy))?.character?.system).toBe(
      bot.persona,
    );
  });

  it("rejects tampered sheets at the worker boundary", () => {
    expect(() =>
      readWorkerBotProfile(
        env({
          ...bot,
          character: {
            system: bot.persona,
            settings: { toolProfile: "full" },
          },
        }),
      ),
    ).toThrow(/unsupported/i);
    expect(() =>
      readWorkerBotProfile(env({ ...bot, character: { system: "Different" } })),
    ).toThrow(/conflicts/i);
  });

  it("accepts a rich sheet with the full legacy persona projection", () => {
    const system = "S".repeat(16_000);
    const largeBot = {
      ...bot,
      persona: system,
      character: {
        system,
        style: {
          all: ["A".repeat(2_000), "B".repeat(2_000), "C".repeat(2_000)],
        },
      },
    };
    expect(JSON.stringify(largeBot).length).toBeGreaterThan(32_000);
    expect(readWorkerBotProfile(env(largeBot))?.character?.system).toBe(system);
  });

  it("rejects profiles beyond the finite launch envelope", () => {
    expect(() =>
      readWorkerBotProfile({
        DOOLITTLE_BOT_RUNTIME: "worker",
        DOOLITTLE_BOT_PROFILE: "X".repeat(64_001),
      }),
    ).toThrow(/bounded launch profile/i);
  });
});
