import { describe, expect, it } from "bun:test";

import {
  classifyTurnMessage,
  isSimpleGreetingMessage,
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

  it("marks local folder overviews as actionable local tasks", () => {
    const classification = classifyTurnMessage(
      "Give me a overview of the dev/milady-ai/milady folder",
    );

    expect(classification.likelyLocalTask).toBe(true);
    expect(classification.actionOriented).toBe(true);
    expect(classification.simpleChat).toBe(false);
  });
});
