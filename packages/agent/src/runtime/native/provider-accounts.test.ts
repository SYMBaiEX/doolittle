import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";

const bootstrapSnapshot = {
  codex: {
    provider: "codex",
    available: false,
    reusable: false,
    detail: "bootstrap codex",
    loginCommand: "codex login",
  },
  claudeCode: {
    provider: "claude-code",
    available: false,
    reusable: false,
    detail: "bootstrap claude",
  },
  devin: {
    provider: "devin",
    available: false,
    reusable: false,
    detail: "bootstrap devin",
  },
  elizaCloud: {
    provider: "elizacloud",
    available: false,
    reusable: false,
    detail: "bootstrap cloud",
  },
};

vi.mock("./account-auth", () => ({
  getLinkedProviderAccountsSnapshot: () => structuredClone(bootstrapSnapshot),
}));

const { getRuntimeProviderAccountsSnapshot } = await import(
  "./provider-accounts"
);

describe("getRuntimeProviderAccountsSnapshot", () => {
  it("prefers registered Eliza provider services and preserves bootstrap metadata", () => {
    const runtime = {
      getService: (serviceType: string) =>
        serviceType === "codex"
          ? {
              status: () => ({
                provider: "codex",
                available: true,
                reusable: true,
                nativeReady: true,
                detail: "native codex service",
              }),
            }
          : null,
    } as unknown as IAgentRuntime;

    const snapshot = getRuntimeProviderAccountsSnapshot(runtime);

    expect(snapshot.codex).toMatchObject({
      provider: "codex",
      available: true,
      reusable: true,
      nativeReady: true,
      detail: "native codex service",
      loginCommand: "codex login",
    });
    expect(snapshot.claudeCode.detail).toBe("bootstrap claude");
  });

  it("falls back to bootstrap discovery while services are unavailable", () => {
    const runtime = {
      getService: () => {
        throw new Error("service warming");
      },
    } as unknown as IAgentRuntime;

    expect(getRuntimeProviderAccountsSnapshot(runtime)).toEqual(
      bootstrapSnapshot,
    );
  });
});
