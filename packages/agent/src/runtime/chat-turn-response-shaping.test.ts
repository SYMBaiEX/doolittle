import { describe, expect, it } from "vitest";

import {
  buildNativePlanningFailureMessage,
  buildSystemFactsContext,
  isRecoverableNativePlanningError,
} from "./chat-turn/response-shaping";

describe("chat turn response shaping helpers", () => {
  it("produces live system facts", () => {
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
