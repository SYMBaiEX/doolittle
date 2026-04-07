import { nowIso } from "./lifecycle";
import type { LifecycleHistory, PlatformName } from "./types";

export function formatTransportDisplayName(platform: PlatformName): string {
  switch (platform) {
    case "telegram":
      return "Telegram";
    case "discord":
      return "Discord";
    case "slack":
      return "Slack";
    case "whatsapp":
      return "WhatsApp";
    case "signal":
      return "Signal";
    case "matrix":
      return "Matrix";
    case "email":
      return "Email";
    case "sms":
      return "SMS";
    case "mattermost":
      return "Mattermost";
    case "homeassistant":
      return "Home Assistant";
    case "dingtalk":
      return "DingTalk";
    case "api":
      return "API";
    case "cli":
      return "CLI";
    default:
      return platform;
  }
}

export function describeTransportHealth(
  platform: PlatformName,
  status: "idle" | "running" | "stopped",
  sendCount: number,
  ready: boolean,
): string {
  return `${formatTransportDisplayName(platform)} health check: status=${status} sends=${sendCount} ready=${ready}.`;
}

export function trackTransportStart(
  platform: PlatformName,
  configured: boolean,
  startedDetail: string,
  missingDetail: string,
  lifecycle: LifecycleHistory,
): {
  status: "idle" | "running" | "stopped";
  startedAt?: string;
  lastError?: string;
} {
  if (configured) {
    lifecycle.record("start", `${platform}: ${startedDetail}`);
    return {
      status: "running",
      startedAt: nowIso(),
      lastError: undefined,
    };
  }
  const lastError = missingDetail;
  lifecycle.record("error", `${platform}: ${lastError}`);
  return {
    status: "stopped",
    lastError,
  };
}
