import { describe, expect, it } from "bun:test";
import { parseAgentSeed, parseUserModelingSettings } from "./parsers";

describe("user profile parsers", () => {
  it("parses user modeling settings aliases", () => {
    expect(
      parseUserModelingSettings(
        "user:hybrid | assistantMemory:local | mode:assist",
      ),
    ).toEqual({
      userMemoryMode: "hybrid",
      assistantMemoryMode: "local",
      dialecticMode: "assist",
    });
  });

  it("parses agent seed fields with trimming and aliases", () => {
    expect(
      parseAgentSeed(
        "name:Doolittle | goals: ship, stabilize | strength: refactors, testing | workStyle: paired, careful | note: truthful",
      ),
    ).toEqual({
      name: "Doolittle",
      goals: ["ship", "stabilize"],
      strengths: ["refactors", "testing"],
      workStyle: ["paired", "careful"],
      notes: ["truthful"],
    });
  });
});
