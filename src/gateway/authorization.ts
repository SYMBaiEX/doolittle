import type { GatewayConfig, IncomingPlatformMessage } from "@/types";
import type { PairingService } from "@/services/pairing-service";

export function authorizeMessage(
  message: IncomingPlatformMessage,
  gatewayConfig: GatewayConfig,
  pairing: PairingService,
): { allowed: boolean; reason?: string; pairingCode?: string } {
  const platformConfig = gatewayConfig.platforms[message.platform];
  if (!platformConfig?.enabled) {
    return { allowed: false, reason: `Platform ${message.platform} is disabled.` };
  }

  if (gatewayConfig.allowAllUsers || platformConfig.allowAllUsers) {
    return { allowed: true };
  }

  if (platformConfig.allowedUserIds.includes(message.userId) || pairing.isAllowed(message.platform, message.userId)) {
    return { allowed: true };
  }

  const pairingMode = platformConfig.pairingMode ?? "pair";
  if (pairingMode === "allow") {
    return { allowed: true };
  }
  if (pairingMode === "deny") {
    return { allowed: false, reason: "User is not allowlisted for this platform." };
  }

  const request = pairing.create(message.platform, message.userId);
  return {
    allowed: false,
    reason: "User must complete pairing approval.",
    pairingCode: request.code,
  };
}
