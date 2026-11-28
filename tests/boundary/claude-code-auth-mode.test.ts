import { expect, it, vi } from "vitest";
import {
  buildProviderRuntimeSettings,
  hasReadyOfficialClaudeAccount,
} from "../../packages/agent/src/runtime/linked-provider-accounts/model-settings";

function context() {
  return {
    config: {
      claudeCodeCliFallback: true,
      elizaCloudEnabled: false,
      elizaCloudSmallModel: "small",
    },
    runtime: {
      getSetting: () => undefined,
    },
    services: {
      settings: {
        get: () => ({}),
      },
    },
  } as never;
}

function settings(provider = "claude-code") {
  return {
    model: {
      provider,
      model: "claude-sonnet-5",
      baseUrl: "",
      temperature: 0.4,
      maxTokens: 1200,
    },
  } as never;
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    claudeCodeAccessTokenIsExpiring: vi.fn(() => false),
    getLinkedClaudeCodeCredentials: vi.fn(() => undefined),
    hasReadyOfficialClaudeAccount: vi.fn(() => false),
    ...overrides,
  } as never;
}

it("falls back to the Claude CLI only when no OAuth credential exists", () => {
  const runtimeSettings = buildProviderRuntimeSettings(
    context(),
    settings(),
    dependencies(),
  );
  expect(runtimeSettings.get("ANTHROPIC_AUTH_MODE")).toBe("claude-cli");
});

it("uses native OAuth when an in-app sign-in account exists without CLI artifacts", () => {
  // Regression coverage: before the fix, an in-app OAuth sign-in (saved in the
  // official account store under its own id) was invisible to the linked
  // credential lookup, so the route degraded to the CLI fallback and every
  // turn failed on machines without a signed-in Claude CLI.
  const runtimeSettings = buildProviderRuntimeSettings(
    context(),
    settings(),
    dependencies({
      hasReadyOfficialClaudeAccount: vi.fn(() => true),
    }),
  );
  expect(runtimeSettings.get("ANTHROPIC_AUTH_MODE")).toBe("oauth");
});

it("keeps native OAuth when linked credentials are already usable", () => {
  const runtimeSettings = buildProviderRuntimeSettings(
    context(),
    settings(),
    dependencies({
      getLinkedClaudeCodeCredentials: vi.fn(() => ({
        accessToken: "linked-access",
        expiresAt: String(Date.now() + 3_600_000),
      })),
    }),
  );
  expect(runtimeSettings.get("ANTHROPIC_AUTH_MODE")).toBe("oauth");
});

it("does not consult official accounts for the direct anthropic provider", () => {
  const hasReadyOfficialClaudeAccount = vi.fn(() => true);
  const runtimeSettings = buildProviderRuntimeSettings(
    context(),
    settings("anthropic"),
    dependencies({ hasReadyOfficialClaudeAccount }),
  );
  expect(runtimeSettings.get("ANTHROPIC_AUTH_MODE")).toBe("apikey");
  expect(hasReadyOfficialClaudeAccount).not.toHaveBeenCalled();
});

it("detects usable official accounts and rejects empty or expired ones", () => {
  const ready = {
    credentials: {
      access: "access",
      refresh: "",
      expires: Date.now() + 3_600_000,
    },
  };
  const expiredButRefreshable = {
    credentials: {
      access: "access",
      refresh: "refresh",
      expires: Date.now() - 1_000,
    },
  };
  const dead = {
    credentials: { access: "access", refresh: "", expires: Date.now() - 1_000 },
  };
  const empty = {
    credentials: { access: "", refresh: "", expires: Date.now() + 3_600_000 },
  };
  const policy = vi.fn(() => ({})) as never;
  expect(
    hasReadyOfficialClaudeAccount(vi.fn(() => [ready]) as never, policy),
  ).toBe(true);
  expect(
    hasReadyOfficialClaudeAccount(
      vi.fn(() => [expiredButRefreshable]) as never,
      policy,
    ),
  ).toBe(true);
  expect(
    hasReadyOfficialClaudeAccount(vi.fn(() => [dead]) as never, policy),
  ).toBe(false);
  expect(
    hasReadyOfficialClaudeAccount(vi.fn(() => [empty]) as never, policy),
  ).toBe(false);
  expect(
    hasReadyOfficialClaudeAccount(
      vi.fn(() => {
        throw new Error("vault locked");
      }) as never,
      policy,
    ),
  ).toBe(false);
});
