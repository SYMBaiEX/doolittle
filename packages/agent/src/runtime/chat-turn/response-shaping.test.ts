import { describe, expect, it } from "bun:test";
import {
  buildNativePlanningFailureMessage,
  buildSimpleGreetingReply,
  buildSystemFactsContext,
  isRecoverableNativePlanningError,
  shouldAttachSystemFacts,
} from "./response-shaping";

describe("chat turn response shaping", () => {
  it("builds stable greeting replies for common operator phrasing", () => {
    expect(buildSimpleGreetingReply("how are you today")).toBe(
      "Doing well. What do you want to work on?",
    );
    expect(buildSimpleGreetingReply("thanks")).toBe("Sure. What's next?");
    expect(buildSimpleGreetingReply("yo doolittle")).toBe(
      "Yo. What do you want to work on?",
    );
    expect(buildSimpleGreetingReply("howdy partner")).toBe(
      "Howdy. What can I help you with?",
    );
    expect(buildSimpleGreetingReply("hello there")).toBe(
      "Hey! What can I help you with?",
    );
  });

  it("recognizes recoverable native planning prompt-shaping failures", () => {
    expect(
      isRecoverableNativePlanningError(new Error("Failed to parse JSON state")),
    ).toBe(true);
    expect(
      isRecoverableNativePlanningError("DynamicPromptExecFromState exploded"),
    ).toBe(true);
    expect(
      isRecoverableNativePlanningError(new Error("permission denied")),
    ).toBe(false);
    expect(buildNativePlanningFailureMessage()).toContain(
      "native planner hit a local prompt-shaping error",
    );
  });

  it("attaches live system facts only for machine-oriented questions", () => {
    expect(shouldAttachSystemFacts("what machine am I on?")).toBe(true);
    expect(shouldAttachSystemFacts("can you use the terminal here?")).toBe(
      true,
    );
    expect(shouldAttachSystemFacts("/doctor")).toBe(false);
    expect(shouldAttachSystemFacts("")).toBe(false);
  });

  it("builds system facts from runtime settings and workspace context", () => {
    const context: Parameters<typeof buildSystemFactsContext>[0] = {
      config: {
        workspaceDir: "/tmp/doolittle-workspace",
      } as never,
      runtime: {} as never,
      services: {
        settings: {
          get: () => ({
            execution: { backend: "docker" },
            model: { provider: "openai" },
          }),
        },
      } as never,
    };

    const message = buildSystemFactsContext(context);

    expect(message).toContain("Live machine facts:");
    expect(message).toContain("- workspace=/tmp/doolittle-workspace");
    expect(message).toContain("- shell access=yes via terminal service");
    expect(message).toContain("- execution backend=docker");
    expect(message).toContain("- provider=openai");
  });
});
