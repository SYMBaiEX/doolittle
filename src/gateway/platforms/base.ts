import type { IncomingPlatformMessage, PlatformName } from "@/types";

export interface PlatformCapabilitySet {
  inbound: boolean;
  outbound: boolean;
  pairing: boolean;
  attachments: boolean;
}

export interface PlatformHealth {
  platform: PlatformName;
  status: "idle" | "running" | "stopped";
  ready: boolean;
  mode: "native" | "mock";
  capabilities: PlatformCapabilitySet;
  detail: string;
}

export interface PlatformAdapter {
  readonly name: PlatformName;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<PlatformHealth>;
  send(message: { roomId: string; userId?: string; text: string }): Promise<void>;
  canReceive(): boolean;
}

export type PlatformMessageHandler = (message: IncomingPlatformMessage) => Promise<string>;
