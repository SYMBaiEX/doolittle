import type { PlatformName } from "@/types/gateway";

export const REMOTE_EXECUTION_PLATFORMS = new Set<PlatformName>([
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
]);

export function resolveRemoteExecutionPlatform(
  source?: string,
): PlatformName | undefined {
  if (!source) {
    return undefined;
  }
  return REMOTE_EXECUTION_PLATFORMS.has(source as PlatformName)
    ? (source as PlatformName)
    : undefined;
}
