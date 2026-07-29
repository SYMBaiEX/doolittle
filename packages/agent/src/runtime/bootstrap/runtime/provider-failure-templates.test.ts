import { describe, expect, it } from "vitest";
import {
  buildProviderAuthFailureReply,
  installProviderFailureTemplates,
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

describe("installProviderFailureTemplates", () => {
  it("reads the active route when the failure occurs", () => {
    let provider = "codex";
    const runtime: {
      character: {
        templates: Record<string, string | (() => string)>;
      };
    } = {
      character: {
        templates: {
          existing: "keep",
        },
      },
    };

    installProviderFailureTemplates(runtime as never, () => ({
      provider,
      model: provider === "codex" ? "gpt-5.4" : "claude-sonnet-4.6",
    }));

    const template = runtime.character.templates.authFailedReply;
    expect(runtime.character.templates.existing).toBe("keep");
    expect(typeof template).toBe("function");
    expect((template as () => string)()).toContain("Codex");

    provider = "claude-code";
    expect((template as () => string)()).toContain("Claude Code");
  });
});
