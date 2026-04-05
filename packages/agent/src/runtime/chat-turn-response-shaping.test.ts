import { describe, expect, it } from "bun:test";

import {
  buildNativePlanningFailureMessage,
  buildSimpleGreetingReply,
  buildSystemFactsContext,
  isRecoverableNativePlanningError,
  shouldAttachSystemFacts,
} from "./chat-turn/response-shaping";

describe("chat turn response shaping helpers", () => {
  it("builds the expected simple greeting replies", () => {
    expect(buildSimpleGreetingReply("how are you today")).toBe(
      "Doing well. What do you want to work on?",
    );
    expect(buildSimpleGreetingReply("thanks")).toBe("Sure. What's next?");
    expect(buildSimpleGreetingReply("yo")).toBe(
      "Yo. What do you want to work on?",
    );
  });

  it("detects machine questions and produces system facts", () => {
    expect(shouldAttachSystemFacts("what os am I on?")).toBe(true);
    expect(shouldAttachSystemFacts("/status")).toBe(false);

    const facts = buildSystemFactsContext({
      config: { workspaceDir: "/workspaces/demo" },
      services: {
        settings: {
          get: () =>
            ({
              execution: { backend: "local" },
              model: { provider: "openai" },
            }) as ReturnType<
              Parameters<
                typeof buildSystemFactsContext
              >[0]["services"]["settings"]["get"]
            >,
        },
      },
    } as Parameters<typeof buildSystemFactsContext>[0]);

    expect(facts).toContain("workspace=/workspaces/demo");
    expect(facts).toContain("shell access=yes");
    expect(facts).toContain("execution backend=local");
    expect(facts).toContain("provider=openai");
  });

  it("flags recoverable planning failures and uses the local planner fallback text", () => {
    expect(
      isRecoverableNativePlanningError(new Error("parse error in prompt")),
    ).toBe(true);
    expect(buildNativePlanningFailureMessage()).toContain("/doctor");
  });
});
