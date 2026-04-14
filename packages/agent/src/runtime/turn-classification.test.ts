import { describe, expect, it } from "bun:test";

import {
  classifyTurnMessage,
  isSimpleGreetingMessage,
  isSimpleSocialMessage,
  resolveAgentContextScope,
  resolveTurnCapabilityProfile,
} from "./turn-classification/message";
import { deriveTurnExecutionPolicy } from "./turn-classification/policy";

describe("turn classification", () => {
  it("treats common conversational greetings as simple chat", () => {
    expect(isSimpleGreetingMessage("hey there")).toBe(true);
    expect(isSimpleGreetingMessage("hello there")).toBe(true);

    const greeting = classifyTurnMessage("hey there");
    expect(greeting.simpleChat).toBe(true);
    expect(greeting.informationalOnly).toBe(true);
    expect(greeting.shouldUseMultiStep).toBe(false);
  });

  it("treats short social turns as simple chat", () => {
    expect(isSimpleSocialMessage("How are you today")).toBe(true);
    expect(isSimpleSocialMessage("thanks")).toBe(true);

    const social = classifyTurnMessage("How are you today");
    expect(social.simpleChat).toBe(true);
    expect(social.informationalOnly).toBe(true);
    expect(social.shouldUseMultiStep).toBe(false);
  });

  it("marks local folder overviews as actionable local tasks", () => {
    const classification = classifyTurnMessage(
      "Give me a overview of the dev/milady-ai/milady folder",
    );

    expect(classification.likelyLocalTask).toBe(true);
    expect(classification.actionOriented).toBe(true);
    expect(classification.simpleChat).toBe(false);
  });

  it("maps turn messages to context scope", () => {
    expect(
      resolveAgentContextScope("ask for a high-level project status update"),
    ).toBe("full");
    expect(resolveAgentContextScope("inspect the repository root files")).toBe(
      "local",
    );
  });

  it("maps turn messages to capability profile", () => {
    expect(resolveTurnCapabilityProfile("what is the weather?")).toBe(
      "minimal",
    );
    expect(resolveTurnCapabilityProfile("search and open repo logs")).toBe(
      "coding",
    );
    expect(
      resolveTurnCapabilityProfile("search and open repo logs", {
        localInteractive: false,
      }),
    ).toBe("coding");
    expect(
      resolveTurnCapabilityProfile("understand architecture drift over time", {
        localInteractive: true,
      }),
    ).toBe("messaging");
    expect(
      resolveTurnCapabilityProfile("implement a monitoring dashboard", {
        localInteractive: false,
      }),
    ).toBe("messaging");
  });
});

describe("turn execution policy", () => {
  it("keeps conversational turns shallow and fast", () => {
    const policy = deriveTurnExecutionPolicy(
      "hi",
      {
        runDepth: "deep",
        maxIterations: 12,
        toolProgressMode: "verbose",
      },
      {
        localInteractive: true,
      },
    );
    expect(policy).toEqual({
      runDepth: "quick",
      maxIterations: 1,
      toolProgressMode: "new",
      useMultiStep: false,
    });
  });

  it("derives deeper policy for local interactive coding turns", () => {
    const policy = deriveTurnExecutionPolicy(
      "inspect and fix the broken tests",
      {
        runDepth: "standard",
        maxIterations: 12,
        toolProgressMode: "off",
      },
      {
        localInteractive: true,
      },
    );
    expect(policy.runDepth).toBe("standard");
    expect(policy.maxIterations).toBe(4);
    expect(policy.toolProgressMode).toBe("off");
    expect(policy.useMultiStep).toBe(true);
  });

  it("leaves non-interactive flow close to base policy", () => {
    const policy = deriveTurnExecutionPolicy(
      "design a release process",
      {
        runDepth: "quick",
        maxIterations: 9,
        toolProgressMode: "all",
      },
      {
        localInteractive: false,
      },
    );
    expect(policy).toEqual({
      runDepth: "quick",
      maxIterations: 9,
      toolProgressMode: "all",
      useMultiStep: false,
    });
  });
});
