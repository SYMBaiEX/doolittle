import { describe, expect, it } from "bun:test";

import {
  classifyTurnMessage,
  isSimpleGreetingMessage,
  isSimpleSocialMessage,
  resolveAgentContextScope,
  resolveTurnCapabilityProfile,
} from "./message";

describe("message classification edge cases", () => {
  it("marks slash commands as non-conversational", () => {
    const slash = classifyTurnMessage("/status");
    expect(slash).toEqual({
      simpleChat: false,
      likelyLocalTask: false,
      requiresFullContext: false,
      actionOriented: false,
      informationalOnly: false,
      shouldUseMultiStep: false,
    });
  });

  it("marks command-marker messages as non-conversational", () => {
    const shell = classifyTurnMessage("!list files");
    expect(shell).toEqual({
      simpleChat: false,
      likelyLocalTask: false,
      requiresFullContext: false,
      actionOriented: false,
      informationalOnly: false,
      shouldUseMultiStep: false,
    });
  });

  it("preserves social detection for simple greetings with punctuation", () => {
    expect(isSimpleGreetingMessage("Hi!")).toBe(true);
    expect(isSimpleSocialMessage("How are you today?")).toBe(true);
    expect(classifyTurnMessage("How are you today?").simpleChat).toBe(true);
  });

  it("treats code-heavy messages as non-simple informational turns", () => {
    const message =
      "Can you run this?\n```bash\nls -la\n``` with `grep` and maybe inline checks.";
    const classification = classifyTurnMessage(message);

    expect(classification.simpleChat).toBe(false);
    expect(classification.actionOriented).toBe(true);
    expect(classification.shouldUseMultiStep).toBe(true);
  });

  it("does not classify URL-only turns as simple", () => {
    const classification = classifyTurnMessage("https://example.com");

    expect(classification.simpleChat).toBe(false);
    expect(classification.informationalOnly).toBe(true);
  });

  it("prefers full context when full-context cues are present", () => {
    expect(
      resolveAgentContextScope("check provider settings and plugin health"),
    ).toBe("full");
  });

  it("uses capability profile boundaries for action vs info turns", () => {
    expect(resolveTurnCapabilityProfile("run smoke test suite")).toBe("coding");
    expect(
      resolveTurnCapabilityProfile("what is the status of plugin health?"),
    ).toBe("full");
    expect(resolveTurnCapabilityProfile("hello")).toBe("minimal");
  });
});
