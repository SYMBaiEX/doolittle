import type { PlatformName } from "@/types";

type GatewayReplayPayload = {
  recordId?: string;
};

type GatewayMessageEditPayload = {
  deliveryId?: string;
  text?: string;
};

type GatewayProgressivePayload = {
  platform?: PlatformName;
  roomId?: string;
  parts?: string[];
};

export function getGatewayReplayValidationError(
  payload: GatewayReplayPayload,
): string | undefined {
  if (!payload.recordId) {
    return "recordId is required";
  }
  return undefined;
}

export function getGatewayMessageEditValidationError(
  payload: GatewayMessageEditPayload,
): string | undefined {
  if (!payload.deliveryId || !payload.text) {
    return "deliveryId and text are required.";
  }
  return undefined;
}

export function getGatewayProgressiveValidationError(
  payload: GatewayProgressivePayload,
): string | undefined {
  if (
    !payload.platform ||
    !payload.roomId ||
    !payload.parts ||
    payload.parts.length < 2
  ) {
    return "platform, roomId, and at least two message parts are required.";
  }
  return undefined;
}
