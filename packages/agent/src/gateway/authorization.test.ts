import { describe, expect, it, vi } from "vitest";
import type { GatewayPairingProjection } from "@/services/gateway-pairing";
import type { GatewayConfig, IncomingPlatformMessage } from "@/types/gateway";
import { authorizeMessage } from "./authorization";

function message(): IncomingPlatformMessage {
  return {
    platform: "telegram",
    userId: "alice",
    roomId: "room",
    text: "hello",
    metadata: { username: "alice" },
  };
}

function config(pairingMode: "pair" | "deny" | "allow"): GatewayConfig {
  return {
    allowAllUsers: false,
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
    platforms: {
      telegram: {
        enabled: true,
        allowedUserIds: [],
        pairingMode,
      },
    },
  } as unknown as GatewayConfig;
}

describe("authorizeMessage", () => {
  it("delegates pair-mode decisions to the official pairing projection", async () => {
    const checkOrRequest = vi.fn(async () => ({
      allowed: false,
      pairingCode: "ABCDEFGH",
    }));
    const pairing = { checkOrRequest } as unknown as GatewayPairingProjection;

    await expect(
      authorizeMessage(message(), config("pair"), pairing),
    ).resolves.toEqual({
      allowed: false,
      reason: "User must complete pairing approval.",
      pairingCode: "ABCDEFGH",
    });
    expect(checkOrRequest).toHaveBeenCalledWith(
      "telegram",
      "alice",
      message().metadata,
    );
  });

  it("does not touch pairing persistence for explicit allow or deny policies", async () => {
    const checkOrRequest = vi.fn();
    const pairing = { checkOrRequest } as unknown as GatewayPairingProjection;

    await expect(
      authorizeMessage(message(), config("allow"), pairing),
    ).resolves.toEqual({ allowed: true });
    await expect(
      authorizeMessage(message(), config("deny"), pairing),
    ).resolves.toEqual({
      allowed: false,
      reason: "User is not allowlisted for this platform.",
    });
    expect(checkOrRequest).not.toHaveBeenCalled();
  });
});
