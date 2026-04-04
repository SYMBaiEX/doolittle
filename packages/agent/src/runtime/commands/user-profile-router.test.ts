import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import { handleUserProfileCommand } from "./user-profile-router";

function createInput(
  overrides: Partial<ChatTurnRequest> = {},
): ChatTurnRequest {
  return {
    message: "/user",
    userId: "user-1",
    roomId: "telegram:room-1:user-1:root",
    source: "telegram",
    ...overrides,
  };
}

describe("user profile command router", () => {
  it("renders native cards and agent profiles when rolodex is available", async () => {
    const context = {
      runtime: {
        getService: (service: string) =>
          service === "rolodex"
            ? {
                card: (userId: string) => ({ userId, source: "native" }),
                agentProfile: () => "native-agent-profile",
              }
            : undefined,
      },
      services: {
        userProfiles: {
          render: () => "fallback-render",
          renderCards: () => "fallback-cards",
          renderAgent: () => "fallback-agent",
        },
      },
    } as unknown as AgentExecutionContext;

    expect(
      await handleUserProfileCommand(
        createInput({ message: "/user" }),
        "/user",
        context,
      ),
    ).toContain('"source": "native"');
    expect(
      await handleUserProfileCommand(
        createInput({ message: "/user card" }),
        "/user card",
        context,
      ),
    ).toContain('"userId": "user-1"');
    expect(
      await handleUserProfileCommand(
        createInput({ message: "/agent profile" }),
        "/agent profile",
        context,
      ),
    ).toBe("native-agent-profile");
  });

  it("parses user modeling configuration and remember commands", async () => {
    const context = {
      runtime: {},
      services: {
        userProfiles: {
          configureModeling: (
            userId: string,
            settings: {
              userMemoryMode?: "local" | "hybrid";
              assistantMemoryMode?: "local" | "hybrid";
              dialecticMode?: "off" | "assist" | "conclude";
            },
          ) => ({
            userId,
            settings,
          }),
          remember: (
            userId: string,
            kind: string,
            value: string,
            source?: string,
          ) => ({
            userId,
            kind,
            value,
            source,
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    const modeling = await handleUserProfileCommand(
      createInput({
        message:
          "/user modeling user:hybrid | assistant:local | dialectic:assist",
      }),
      "/user modeling user:hybrid | assistant:local | dialectic:assist",
      context,
    );
    const remember = await handleUserProfileCommand(
      createInput({
        message: "/user remember preference :: likes concise updates",
      }),
      "/user remember preference :: likes concise updates",
      context,
    );

    expect(modeling).toContain('"userMemoryMode": "hybrid"');
    expect(modeling).toContain('"assistantMemoryMode": "local"');
    expect(modeling).toContain('"dialecticMode": "assist"');
    expect(remember).toContain('"kind": "preference"');
    expect(remember).toContain('"value": "likes concise updates"');
  });

  it("composes user conclusions and agent observation fallbacks", async () => {
    const context = {
      runtime: {},
      services: {
        userProfiles: {
          context: (userId: string, query: string) => ({ userId, query }),
          conclude: (
            userId: string,
            query: string,
            conclusion: string,
            source?: string,
          ) => ({
            userId,
            query,
            conclusion,
            source,
          }),
          observeAgent: (note: string, source?: string) => ({
            note,
            source,
          }),
        },
      },
    } as unknown as AgentExecutionContext;

    const conclusion = await handleUserProfileCommand(
      createInput({
        message: "/user conclude deployment :: prefers gradual rollouts",
      }),
      "/user conclude deployment :: prefers gradual rollouts",
      context,
    );
    const observed = await handleUserProfileCommand(
      createInput({
        message: "/agent observe likes pairing on risky refactors",
      }),
      "/agent observe likes pairing on risky refactors",
      context,
    );

    expect(conclusion).toContain('"query": "deployment"');
    expect(conclusion).toContain('"conclusion": "prefers gradual rollouts"');
    expect(observed).toContain('"note": "likes pairing on risky refactors"');
  });

  it("parses agent seed input into structured profile data", async () => {
    const context = {
      runtime: {},
      services: {
        userProfiles: {
          seedAgent: (seed: {
            name?: string;
            goals?: string[];
            strengths?: string[];
            workStyle?: string[];
            notes?: string[];
          }) => seed,
        },
      },
    } as unknown as AgentExecutionContext;

    const seeded = await handleUserProfileCommand(
      createInput({
        message:
          "/agent seed name:Doolittle | goals:ship,stabilize | strengths:refactors,testing | style:paired,careful | notes:truthful",
      }),
      "/agent seed name:Doolittle | goals:ship,stabilize | strengths:refactors,testing | style:paired,careful | notes:truthful",
      context,
    );

    expect(seeded).toContain('"name": "Doolittle"');
    expect(seeded).toContain('"goals": [');
    expect(seeded).toContain('"ship"');
    expect(seeded).toContain('"workStyle": [');
    expect(seeded).toContain('"paired"');
  });
});
