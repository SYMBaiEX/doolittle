import { ProviderTransportError } from "@elizaos/provider-transport";
import { describe, expect, it } from "vitest";
import {
  formatAccountsOverview,
  formatLinkedAccountSummary,
} from "./formatters";
import {
  buildProviderFailureMessage,
  buildProviderNoResponseMessage,
} from "./messages";

describe("linked-provider-accounts messages", () => {
  it("formats provider failure guidance for cloud connectivity issues", () => {
    const message = buildProviderFailureMessage(
      "elizacloud",
      "openai/gpt-5.4",
      new Error("Could not be resolved"),
      "https://cloud.example.com",
    );

    expect(message).toContain("could not resolve");
    expect(message).toContain("cloud.example.com");
    expect(message).toContain("/accounts doctor");
  });

  it("falls back to no-response guidance for generic failures", () => {
    const message = buildProviderFailureMessage(
      "codex",
      "gpt-5.4",
      new Error("No output generated"),
    );

    expect(message).toBe(buildProviderNoResponseMessage("codex", "gpt-5.4"));
  });

  it("renders recovery guidance from structured provider failures", () => {
    const message = buildProviderFailureMessage(
      "codex",
      "gpt-5.4",
      new ProviderTransportError("expired", {
        code: "unauthorized",
        provider: "codex",
        status: 401,
      }),
    );

    expect(message).toContain("no longer authorized");
    expect(message).toContain("/accounts connect codex");
    expect(message).not.toContain("Last error");
  });

  it("renders retry guidance from structured availability failures", () => {
    const message = buildProviderFailureMessage(
      "elizacloud",
      "openai/gpt-5.4",
      new ProviderTransportError("maintenance", {
        code: "unavailable",
        provider: "elizacloud",
        retryable: true,
        status: 503,
      }),
      "https://cloud.example.com",
    );

    expect(message).toContain("temporarily unavailable");
    expect(message).toContain("cloud.example.com");
  });

  it("renders account summaries and overviews", () => {
    const snapshot = {
      codex: {
        provider: "codex",
        available: true,
        reusable: true,
        nativeReady: true,
        fallbackReady: false,
        detail: "Codex ready.",
      },
      claudeCode: {
        provider: "claude-code",
        available: true,
        reusable: true,
        nativeReady: false,
        fallbackReady: true,
        detail: "Claude fallback ready.",
      },
      devin: {
        provider: "devin",
        available: true,
        reusable: false,
        nativeReady: false,
        fallbackReady: false,
        detail: "Devin available.",
      },
      elizaCloud: {
        provider: "elizacloud",
        available: true,
        reusable: true,
        nativeReady: true,
        fallbackReady: false,
        detail: "Cloud ready.",
      },
    } as const;

    expect(formatLinkedAccountSummary("codex", snapshot as never)).toContain(
      "nativeReady: yes",
    );
    const overview = formatAccountsOverview("codex", snapshot as never);
    expect(overview).toContain("Managed path");
    expect(overview).toContain("Local specialist providers");
    expect(overview).toContain("claude-code");
  });
});
