import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { createSelfAwarenessProvider } from "./provider";

function makeRuntime(composeSummary: () => Promise<string>): IAgentRuntime {
  return {
    getService: () => ({ composeSummary }),
  } as unknown as IAgentRuntime;
}

const message = { content: { text: "hi" } } as Memory;
const state = {} as State;

describe("self-awareness provider", () => {
  it("injects the composed (trimmed) summary as text and data", async () => {
    const provider = createSelfAwarenessProvider();
    const runtime = makeRuntime(async () => "  [STATUS] 3 tasks pending  ");
    const result = await provider.get(runtime, message, state);
    expect(result.text).toBe("[STATUS] 3 tasks pending");
    expect(result.data?.selfAwareness).toBe("[STATUS] 3 tasks pending");
  });

  it("injects nothing when the summary is empty/whitespace", async () => {
    const provider = createSelfAwarenessProvider();
    const runtime = makeRuntime(async () => "   ");
    const result = await provider.get(runtime, message, state);
    expect(result.text).toBe("");
    expect(result.data).toEqual({});
  });

  it("is fault-tolerant when composeSummary throws", async () => {
    const provider = createSelfAwarenessProvider();
    const runtime = makeRuntime(async () => {
      throw new Error("contributor blew up");
    });
    const result = await provider.get(runtime, message, state);
    expect(result.text).toBe("");
  });

  it("renders late (positive position) after the main context", () => {
    const provider = createSelfAwarenessProvider();
    expect(provider.position ?? 0).toBeGreaterThan(0);
    expect(provider.name).toBe("DOOLITTLE_SELF_AWARENESS_PROVIDER");
  });
});
