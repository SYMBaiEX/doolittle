import type {
  IncomingPlatformMessage,
  OutboundPlatformMessage,
  PlatformName,
} from "@/types";

export interface PlatformCapabilitySet {
  inbound: boolean;
  outbound: boolean;
  pairing: boolean;
  attachments: boolean;
  replies: boolean;
  threads: boolean;
  metadata: boolean;
}

export interface PlatformHealth {
  platform: PlatformName;
  status: "idle" | "running" | "stopped";
  ready: boolean;
  mode: "native" | "mock";
  capabilities: PlatformCapabilitySet;
  detail: string;
  startedAt?: string;
  stoppedAt?: string;
  lastSendAt?: string;
  sendCount?: number;
  lastError?: string;
}

export interface PlatformAdapter {
  readonly name: PlatformName;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<PlatformHealth>;
  send(message: OutboundPlatformMessage): Promise<void>;
  canReceive(): boolean;
}

export type PlatformMessageHandler = (message: IncomingPlatformMessage) => Promise<string>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function capabilitiesForPlatform(platform: PlatformName): PlatformCapabilitySet {
  switch (platform) {
    case "telegram":
      return {
        inbound: true,
        outbound: true,
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
        pairing: true,
        attachments: false,
        replies: true,
        threads: false,
        metadata: true,
      };
    default:
      return {
        inbound: true,
        outbound: true,
        pairing: true,
        attachments: false,
        replies: false,
        threads: false,
        metadata: false,
      };
  }
}
