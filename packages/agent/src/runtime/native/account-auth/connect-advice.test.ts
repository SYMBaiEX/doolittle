import { describe, expect, it } from "bun:test";
import {
  buildLinkedProviderConnectAdvice,
  getLinkedProviderLoginCommand,
  getLinkedProviderSetupCommand,
} from "./connect-advice";

describe("account-auth connect advice helpers", () => {
  it("returns the expected login and setup commands for each provider", () => {
    expect(getLinkedProviderLoginCommand("codex")).toBe("codex login");
    expect(getLinkedProviderLoginCommand("claude-code")).toBe(
      "claude auth login",
    );
    expect(getLinkedProviderLoginCommand("elizacloud")).toBe("elizaos login");
    expect(getLinkedProviderSetupCommand("codex")).toBeUndefined();
    expect(getLinkedProviderSetupCommand("claude-code")).toBe(
      "claude setup-token",
    );
  });

  it("marks native-ready providers as immediately usable", () => {
    const advice = buildLinkedProviderConnectAdvice("codex", {
      provider: "codex",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      loginCommand: "codex login",
      detail: "ready",
    });

    expect(advice.ready).toBe(true);
    expect(advice.preferredAction).toBe("use");
    expect(advice.primaryCommand).toBe("/accounts connect codex");
  });

  it("keeps Claude fallback guidance explicit when native auth is still missing", () => {
    const advice = buildLinkedProviderConnectAdvice("claude-code", {
      provider: "claude-code",
      available: true,
      reusable: true,
      nativeReady: false,
      fallbackReady: true,
      loginCommand: "claude auth login",
      setupCommand: "claude setup-token",
      detail: "fallback-only",
    });

    expect(advice.ready).toBe(false);
    expect(advice.preferredAction).toBe("setup-token");
    expect(advice.primaryCommand).toBe("claude setup-token");
    expect(advice.secondaryCommand).toBe("/accounts connect claude-code");
  });
});
