export type PlatformName =
  | "api"
  | "cli"
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "signal"
  | "matrix"
  | "email"
  | "sms"
  | "mattermost"
  | "homeassistant"
  | "dingtalk";

export interface GatewayPlatformConfig {
  enabled: boolean;
  allowAllUsers?: boolean;
  allowedUserIds: string[];
  homeChannel?: string;
  pairingMode?: "pair" | "deny" | "allow";
}

export interface GatewayConfig {
  allowAllUsers: boolean;
  sessionTimeoutMinutes: number;
  mirrorResponsesToHistory: boolean;
  platforms: Record<PlatformName, GatewayPlatformConfig>;
}

export interface PairingRequestRecord {
  id: string;
  platform: PlatformName;
  userId: string;
  code: string;
  createdAt: string;
  approvedAt?: string;
  deniedAt?: string;
  status: "pending" | "approved" | "denied";
}

export interface PairingAllowlistEntry {
  platform: PlatformName;
  userId: string;
  approvedAt: string;
}

export interface IncomingPlatformMessage {
  platform: PlatformName;
  userId: string;
  roomId: string;
  text: string;
  channelId?: string;
  threadId?: string;
  messageId?: string;
  replyToMessageId?: string;
  channelType?: string;
  authorName?: string;
  timestamp?: string;
  metadata?: Record<string, string>;
}

export interface SessionRoute {
  sessionKey: string;
  activeAgentSessionId?: string;
  roomId: string;
  userId: string;
  platform: PlatformName;
  channelId?: string;
  threadId?: string;
  messageId?: string;
  replyToMessageId?: string;
  channelType?: string;
  authorName?: string;
  metadata?: Record<string, string>;
  voiceMode?: "off" | "voice_only" | "all";
  voiceChannelId?: string;
  voiceChannelState?: "disconnected" | "connected";
  voiceUpdatedAt?: string;
  voiceUpdatedReason?: string;
  isHome?: boolean;
  homeLabel?: string;
  homeUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryTarget {
  platform: PlatformName;
  channelId?: string;
  userId?: string;
  mode: "origin" | "home" | "explicit" | "local";
}

export interface OutboundPlatformMessage {
  roomId: string;
  userId?: string;
  text: string;
  threadId?: string;
  replyToId?: string;
  metadata?: Record<string, string>;
}

export interface DeliveredMessageRecord {
  id: string;
  target: DeliveryTarget;
  text: string;
  threadId?: string;
  replyToId?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt?: string;
  editOfId?: string;
  editCount?: number;
}
