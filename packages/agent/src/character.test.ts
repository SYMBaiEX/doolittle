import { describe, expect, it } from "vitest";
import { character } from "./character";

describe("Doolittle character instructions", () => {
  it("treats explicit no-tool requests as hard action constraints", () => {
    expect(character.system).toContain(
      "Honor explicit requests not to use tools, commands, or actions as hard constraints",
    );
    expect(character.system).toContain(
      "including read-only listing. If a request cannot be completed without tools",
    );
  });
});
