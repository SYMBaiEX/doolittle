import { describe, expect, it } from "bun:test";
import {
  createInteractiveWizardAnswers,
  resolveInteractiveProviderDefault,
} from "./state";

const linkedAccounts = {
  codex: {
    provider: "codex",
    available: true,
    reusable: true,
    nativeReady: true,
    detail: "codex",
  },
  claudeCode: {
    provider: "claude-code",
    available: true,
    reusable: false,
    nativeReady: false,
    fallbackReady: true,
    detail: "claude",
  },
  elizaCloud: {
    provider: "elizacloud",
    available: false,
    reusable: false,
    detail: "cloud",
  },
} as const;

describe("bootstrap wizard state helpers", () => {
  it("resolves the interactive provider default from environment precedence", () => {
    expect(
      resolveInteractiveProviderDefault(
        new Map([
          ["ELIZAOS_CLOUD_ENABLED", "true"],
          ["OPENAI_API_KEY", "openai"],
        ]),
      ),
    ).toBe("elizacloud");
    expect(
      resolveInteractiveProviderDefault(
        new Map([
          ["OPENAI_API_KEY", "openai"],
          ["ANTHROPIC_API_KEY", "anthropic"],
        ]),
      ),
    ).toBe("hybrid");
    expect(
      resolveInteractiveProviderDefault(
        new Map([["CLAUDE_CODE_OAUTH_TOKEN", "token"]]),
      ),
    ).toBe("claude-code");
  });

  it("seeds linked auth flags into the interactive wizard draft", () => {
    const answers = createInteractiveWizardAnswers(
      new Map([["OPENAI_API_KEY", "openai-key"]]),
      linkedAccounts,
    );

    expect(answers.provider).toBe("openai");
    expect(answers.useLinkedCodexAuth).toBe(true);
    expect(answers.useLinkedClaudeCodeAuth).toBe(false);
    expect(answers.mode).toBe("ritual");
  });
});
