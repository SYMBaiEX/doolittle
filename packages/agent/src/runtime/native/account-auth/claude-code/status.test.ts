import { describe, expect, it } from "bun:test";
import * as statusBuilders from "../claude-code-support/status-builders";
import * as legacyStatus from "./status";

describe("claude-code status façade", () => {
  it("re-exports the support status builder", () => {
    expect(legacyStatus.getClaudeCodeAccountStatus).toBe(
      statusBuilders.getClaudeCodeAccountStatus,
    );
  });
});
