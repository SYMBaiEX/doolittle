import { describe, expect, it } from "bun:test";
import { resolveClaudeCodeBondDefault } from "./claude-code-defaults";

describe("resolveClaudeCodeBondDefault", () => {
  it("prefers the most specific bound path before falling back to login", () => {
    expect(
      resolveClaudeCodeBondDefault({
        claudeCodeCliFallback: true,
        claudeCodeOauthToken: "",
      }),
    ).toBe("local-cli-fallback");
    expect(
      resolveClaudeCodeBondDefault({
        claudeCodeCliFallback: false,
        claudeCodeOauthToken: "token",
      }),
    ).toBe("setup-token");
    expect(
      resolveClaudeCodeBondDefault({
        claudeCodeCliFallback: false,
        claudeCodeOauthToken: "",
      }),
    ).toBe("login");
  });
});
