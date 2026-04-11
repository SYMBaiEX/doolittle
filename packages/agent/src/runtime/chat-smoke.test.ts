import { describe, expect, it } from "bun:test";

import { handleAgentTurn } from "./chat";

describe("chat module smoke", () => {
  it("still exports the turn handler", () => {
    expect(typeof handleAgentTurn).toBe("function");
  });
});
