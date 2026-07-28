import { describe, expect, it } from "vitest";
import { buildCloudRecoveryOptions } from "./provider/recovery";

describe("bootstrap provider flow helpers", () => {
  it("offers only the recovery paths that are actually available", () => {
    const options = buildCloudRecoveryOptions(
      {
        codex: {
          provider: "codex",
          available: false,
          reusable: false,
          detail: "codex",
        },
        claudeCode: {
          provider: "claude-code",
          available: false,
          reusable: false,
          detail: "claude",
        },
        devin: {
          provider: "devin",
          available: false,
          reusable: false,
          detail: "devin",
        },
        elizaCloud: {
          provider: "elizacloud",
          available: false,
          reusable: false,
          detail: "cloud",
        },
      },
      "",
      "",
    );

    expect(options.map((option) => option.value)).toEqual([
      "retry",
      "key",
      "ollama",
      "offline",
    ]);
  });

  it("adds linked and API fallback choices when the inputs exist", () => {
    const options = buildCloudRecoveryOptions(
      {
        codex: {
          provider: "codex",
          available: true,
          reusable: true,
          detail: "codex",
        },
        claudeCode: {
          provider: "claude-code",
          available: true,
          reusable: true,
          detail: "claude",
        },
        devin: {
          provider: "devin",
          available: false,
          reusable: false,
          detail: "devin",
        },
        elizaCloud: {
          provider: "elizacloud",
          available: false,
          reusable: false,
          detail: "cloud",
        },
      },
      "openai-key",
      "anthropic-key",
    );

    expect(options.map((option) => option.value)).toEqual([
      "retry",
      "key",
      "codex",
      "claude-code",
      "ollama",
      "openai",
      "anthropic",
      "offline",
    ]);
  });
});
