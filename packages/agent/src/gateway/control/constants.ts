import type { PlatformName } from "@/types/gateway";

import type { GatewayTraceKind } from "./types";

export const TRANSPORT_PLATFORM_NAMES: PlatformName[] = [
  "api",
  "cli",
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "email",
  "sms",
  "mattermost",
  "homeassistant",
  "dingtalk",
];

export const GATEWAY_TRACE_KINDS: GatewayTraceKind[] = [
  "receive",
  "authorize",
  "session",
  "route",
  "respond",
  "deliver",
  "update",
  "heartbeat",
  "reject",
  "lifecycle",
];
