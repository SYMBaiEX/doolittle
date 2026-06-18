import { describe, expect, it } from "bun:test";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import type { AppServices } from "@/services";
import { createSelfAwarenessProvider } from "./provider";

function makeServices(composeSummary: () => Promise<string>): AppServices {
  return {
    awareness: { composeSummary },
  } as unknown as AppServices;
}

const runtime = {} as IAgentRuntime;
const message = { content: { text: "hi" } } as Memory;
const state = {} as State;

describe("self-awareness provider", () => {
  it("injects the composed (trimmed) summary as text and data", async () => {
    const provider = createSelfAwarenessProvider(
      makeServices(async () => "  [STATUS] 3 tasks pending  "),
    );
    const result = await provider.get(runtime, message, state);
    expect(result.text).toBe("[STATUS] 3 tasks pending");
    expect(result.data?.selfAwareness).toBe("[STATUS] 3 tasks pending");
  });

  it("injects nothing when the summary is empty/whitespace", async () => {
    const provider = createSelfAwarenessProvider(
      makeServices(async () => "   "),
    );
    const result = await provider.get(runtime, message, state);
    expect(result.text).toBe("");
    expect(result.data).toEqual({});
  });

  it("is fault-tolerant when composeSummary throws", async () => {
    const provider = createSelfAwarenessProvider(
      makeServices(async () => {
        throw new Error("contributor blew up");
      }),
    );
    const result = await provider.get(runtime, message, state);
    expect(result.text).toBe("");
  });

  it("renders late (positive position) after the main context", () => {
    const provider = createSelfAwarenessProvider(makeServices(async () => "x"));
    expect(provider.position ?? 0).toBeGreaterThan(0);
    expect(provider.name).toBe("DOOLITTLE_SELF_AWARENESS_PROVIDER");
  });
});
