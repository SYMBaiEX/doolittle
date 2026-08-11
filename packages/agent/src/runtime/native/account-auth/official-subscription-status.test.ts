import type { SubscriptionAccountStatus } from "@elizaos/agent/auth/credentials";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __officialSubscriptionStatusTestOnly,
  getOfficialSubscriptionProviderStatus,
  invalidateOfficialSubscriptionStatusCache,
} from "./official-subscription-status";

function row(
  input: Partial<SubscriptionAccountStatus> &
    Pick<SubscriptionAccountStatus, "provider" | "accountId">,
): SubscriptionAccountStatus {
  return {
    label: input.accountId,
    configured: true,
    valid: true,
    expiresAt: null,
    source: "app",
    available: true,
    ...input,
  };
}

beforeEach(() => {
  invalidateOfficialSubscriptionStatusCache();
});

describe("official subscription status projection", () => {
  it("uses a valid Codex CLI row ahead of an expired stored account", () => {
    const status = __officialSubscriptionStatusTestOnly.projectStatus("codex", [
      row({
        provider: "openai-codex",
        accountId: "expired",
        valid: false,
      }),
      row({
        provider: "openai-codex",
        accountId: "codex-cli",
        label: "Codex CLI",
        source: "codex-cli",
        allowedClient: "Codex CLI / Codex-backed provider",
      }),
    ]);

    expect(status).toMatchObject({
      provider: "codex",
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: "@elizaos/agent:codex-cli",
      accountLabel: "Codex CLI",
    });
  });

  it("keeps a Claude CLI subscription on the explicit fallback path", () => {
    const status = __officialSubscriptionStatusTestOnly.projectStatus(
      "claude-code",
      [
        row({
          provider: "anthropic-subscription",
          accountId: "claude-code-cli",
          label: "Claude Code CLI",
          source: "claude-code-cli",
          allowedClient: "Claude Code CLI",
        }),
      ],
    );

    expect(status).toMatchObject({
      provider: "claude-code",
      reusable: true,
      nativeReady: false,
      fallbackReady: true,
      source: "@elizaos/agent:claude-code-cli",
    });
  });

  it("reports an expired official account without claiming readiness", () => {
    const status = __officialSubscriptionStatusTestOnly.projectStatus(
      "claude-code",
      [
        row({
          provider: "anthropic-subscription",
          accountId: "work",
          label: "Work Claude",
          valid: false,
          expiresAt: Date.parse("2026-08-01T00:00:00.000Z"),
        }),
      ],
    );

    expect(status).toMatchObject({
      available: true,
      reusable: false,
      nativeReady: false,
      fallbackReady: false,
      lastRefresh: "2026-08-01T00:00:00.000Z",
    });
    expect(status?.detail).toContain("expired or unavailable");
  });

  it("does not let an invalid SDK expiry break the provider snapshot", () => {
    const status = __officialSubscriptionStatusTestOnly.projectStatus("codex", [
      row({
        provider: "openai-codex",
        accountId: "codex-cli",
        expiresAt: Number.MAX_VALUE,
      }),
    ]);

    expect(status?.nativeReady).toBe(true);
    expect(status?.lastRefresh).toBeUndefined();
  });

  it("caches the official machine scan and skips explicit home overrides", () => {
    const getSubscriptionStatus = vi.fn(() => [
      row({ provider: "openai-codex", accountId: "codex-cli" }),
    ]);
    const dependencies = {
      getSubscriptionStatus,
      now: () => 1_000,
    };

    expect(
      getOfficialSubscriptionProviderStatus("codex", undefined, dependencies),
    ).toBeDefined();
    expect(
      getOfficialSubscriptionProviderStatus("codex", undefined, dependencies),
    ).toBeDefined();
    expect(
      getOfficialSubscriptionProviderStatus(
        "codex",
        "/tmp/fixture-home",
        dependencies,
      ),
    ).toBeUndefined();
    expect(getSubscriptionStatus).toHaveBeenCalledTimes(1);
  });
});
