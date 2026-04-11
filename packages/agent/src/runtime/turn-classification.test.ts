import { describe, expect, it } from "bun:test";

import {
  classifyTurnMessage,
  isSimpleGreetingMessage,
  isSimpleSocialMessage,
} from "./turn-classification";

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
});
