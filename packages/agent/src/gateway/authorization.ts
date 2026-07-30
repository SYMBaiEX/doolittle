import type { GatewayPairingProjection } from "@/services/gateway-pairing";
import type { GatewayConfig, IncomingPlatformMessage } from "@/types/gateway";

export async function authorizeMessage(
  message: IncomingPlatformMessage,
  gatewayConfig: GatewayConfig,
  pairing: GatewayPairingProjection,
): Promise<{ allowed: boolean; reason?: string; pairingCode?: string }> {
  const platformConfig = gatewayConfig.platforms[message.platform];
  if (!platformConfig?.enabled) {
    return {
      allowed: false,
      reason: `Platform ${message.platform} is disabled.`,
    };
  }

  if (gatewayConfig.allowAllUsers || platformConfig.allowAllUsers) {
    return { allowed: true };
  }

  if (platformConfig.allowedUserIds.includes(message.userId)) {
    return { allowed: true };
  }

  const pairingMode = platformConfig.pairingMode ?? "pair";
  if (pairingMode === "allow") {
    return { allowed: true };
  }
  if (pairingMode === "deny") {
    return {
      allowed: false,
      reason: "User is not allowlisted for this platform.",
    };
  }

  const request = await pairing.checkOrRequest(
    message.platform,
    message.userId,
    message.metadata,
  );
  if (request.allowed) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "User must complete pairing approval.",
    pairingCode: request.pairingCode,
  };
}
