import type { TrajectoryRole } from "./shared";

export interface TrajectoryRecord {
  sessionId: string;
  createdAt: string;
  role: TrajectoryRole;
  text: string;
}

export interface GatewayTraceLike {
  at: string;
  kind: string;
  platform: string;
  detail: string;
  sessionId?: string;
  userId?: string;
  roomId?: string;
}

export interface GatewayMessageLike {
  at: string;
  platform: string;
  userId?: string;
  roomId?: string;
  sessionId?: string;
  text?: string;
  detail?: string;
  status?: string;
}
