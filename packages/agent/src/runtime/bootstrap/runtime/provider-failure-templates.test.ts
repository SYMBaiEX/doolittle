import { describe, expect, it } from "vitest";
import {
  buildProviderAuthFailureReply,
  createProviderFailureTemplates,
} from "./provider-failure-templates";

describe("buildProviderAuthFailureReply", () => {
  it("names the active linked provider instead of blaming Eliza Cloud", () => {
    expect(
      buildProviderAuthFailureReply({
        provider: "codex",
        model: "gpt-5.4",
      }),
    ).toContain("Codex (gpt-5.4)");
    expect(
      buildProviderAuthFailureReply({
        provider: "claude-code",
        model: "claude-sonnet-4.6",
      }),
    ).toContain("reconnect Claude Code");
  });

  it("keeps Eliza Cloud guidance scoped to the cloud provider", () => {
    const reply = buildProviderAuthFailureReply({
      provider: "elizacloud",
      model: "cloud-large",
    });

    expect(reply).toContain("Eliza Cloud");
    expect(reply).toContain("cloud credentials");
  });
});

describe("createProviderFailureTemplates", () => {
  it("reads the active route when the failure occurs", () => {
    let provider = "codex";
    const templates = createProviderFailureTemplates(() => ({
      provider,
      model: provider === "codex" ? "gpt-5.4" : "claude-sonnet-4.6",
    }));

    const template = templates.authFailedReply;
    expect(typeof template).toBe("function");
    expect(template?.()).toContain("Codex");

    provider = "claude-code";
    expect(template?.()).toContain("Claude Code");
  });
});
