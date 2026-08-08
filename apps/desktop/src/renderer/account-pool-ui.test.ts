import { describe, expect, it } from "vitest";
import { toElizaAccount } from "./account-pool-ui";

describe("toElizaAccount", () => {
  it("maps the desktop pool snapshot into the official account card contract", () => {
    expect(
      toElizaAccount({
        providerId: "openai-codex",
        accountId: "work",
        label: "Work",
        source: "oauth",
        enabled: true,
        priority: 2,
        createdAt: 100,
        lastUsedAt: 200,
        health: "ok",
        healthDetail: { lastChecked: 300 },
        usage: { sessionPct: 45, refreshedAt: 400 },
      }),
    ).toEqual({
      id: "work",
      providerId: "openai-codex",
      label: "Work",
      source: "oauth",
      enabled: true,
      priority: 2,
      createdAt: 100,
      lastUsedAt: 200,
      health: "ok",
      healthDetail: { lastChecked: 300 },
      usage: { sessionPct: 45, refreshedAt: 400 },
      hasCredential: true,
    });
  });

  it("normalizes unknown health and ignores arbitrary usage fields", () => {
    const account = toElizaAccount({
      providerId: "anthropic-subscription",
      accountId: "personal",
      label: "Personal",
      source: "oauth",
      enabled: false,
      priority: 0,
      createdAt: 100,
      health: "surprising",
      usage: { requests: 42 },
    });

    expect(account.health).toBe("unknown");
    expect(account.usage).toBeUndefined();
  });
});
