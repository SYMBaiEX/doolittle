export type GatewayTraceKind =
  | "receive"
  | "authorize"
  | "session"
  | "route"
  | "respond"
  | "deliver"
  | "update"
  | "heartbeat"
  | "reject"
  | "lifecycle";

export interface GatewayFilterOptions {
  limit?: number;
  platform?: import("@/types/gateway").PlatformName;
  sessionId?: string;
  kind?: GatewayTraceKind;
}

export type GatewayFilterSelection = Required<
  Pick<GatewayFilterOptions, "limit">
> &
  GatewayFilterOptions;
