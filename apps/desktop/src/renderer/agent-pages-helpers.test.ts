import { describe, expect, it } from "vitest";
import type { AccountPoolAccount } from "../shared/contracts";
import {
  accountPoolProgress,
  clearAccountImportDraft,
} from "./agent-pages-helpers";

const account = (
  overrides: Partial<AccountPoolAccount> = {},
): AccountPoolAccount => ({
  providerId: "openai-codex",
  accountId: "account-1",
  label: "Primary",
  source: "oauth",
  enabled: true,
  priority: 1,
  createdAt: 1,
  health: "healthy",
  ...overrides,
});

describe("accountPoolProgress", () => {
  it("guides first account, second account, strategy, and verification", () => {
    expect(accountPoolProgress([]).nextStep).toBe("first-account");
    expect(accountPoolProgress([account()]).nextStep).toBe("second-account");
    expect(
      accountPoolProgress([
        account({ enabled: false }),
        account({ accountId: "2", enabled: false }),
      ]).nextStep,
    ).toBe("strategy");
    expect(
      accountPoolProgress([
        account(),
        account({ accountId: "2", health: "degraded" }),
      ]),
    ).toEqual({ enabled: 2, healthy: 1, nextStep: "verify" });
  });
});

describe("clearAccountImportDraft", () => {
  it("clears only the provider imported successfully", () => {
    expect(
      clearAccountImportDraft(
        {
          "openai-codex": { accountId: "codex-2", label: "Codex two" },
          "anthropic-subscription": {
            accountId: "claude-2",
            label: "Claude two",
          },
        },
        "openai-codex",
      ),
    ).toEqual({
      "anthropic-subscription": {
        accountId: "claude-2",
        label: "Claude two",
      },
    });
  });
});
