import type { PlatformName } from "@/types/gateway";
import type { PlatformCapabilitySet } from "./types";

export function capabilitiesForPlatform(
  platform: PlatformName,
): PlatformCapabilitySet {
  switch (platform) {
    case "telegram":
      return {
        inbound: true,
        outbound: true,
        edits: true,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "discord":
      return {
        inbound: true,
        outbound: true,
        edits: true,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "slack":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: false,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "whatsapp":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: false,
        metadata: true,
      };
    case "signal":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: false,
        metadata: true,
      };
    case "matrix":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "email":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: false,
        metadata: true,
      };
    case "sms":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: false,
        replies: true,
        threads: false,
        metadata: true,
      };
    case "mattermost":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    case "homeassistant":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: false,
        attachments: false,
        replies: false,
        threads: false,
        metadata: true,
      };
    case "dingtalk":
      return {
        inbound: true,
        outbound: true,
        edits: false,
        pairing: true,
        attachments: true,
        replies: true,
        threads: true,
        metadata: true,
      };
    default:
      return {
        inbound: true,
        outbound: true,
        edits: true,
        pairing: true,
        attachments: false,
        replies: false,
        threads: false,
        metadata: false,
      };
  }
}
