export type RuntimeSection = "overview" | "gateway" | "inventory";

export interface RuntimeResourcePolicy {
  runtime: boolean;
  accountPool: boolean;
  autonomy: boolean;
  gatewayHealth: boolean;
  gatewayRuntime: boolean;
  plugins: boolean;
  ecosystem: boolean;
  insights: boolean;
}

export interface GatewayHealthResponse {
  summary?: Record<string, unknown>;
  transportControl?: Record<string, unknown>;
  sessions?: unknown[];
  deliveries?: unknown[];
  traces?: unknown[];
}

export interface GatewayRuntimeResponse {
  summary?: Record<string, unknown>;
  runtime?: Record<string, unknown>;
  transportControl?: Record<string, unknown>;
  transportInventory?: unknown[];
  messagingPlugins?: unknown[];
}

export function runtimeResourcePolicy(
  section: RuntimeSection,
  active: boolean,
): RuntimeResourcePolicy {
  return {
    runtime: active && section === "overview",
    accountPool: active && section === "overview",
    autonomy: active && section === "overview",
    gatewayHealth: active && section === "gateway",
    gatewayRuntime: active && section === "gateway",
    plugins: active && section === "inventory",
    ecosystem: active && section === "inventory",
    insights: active && section === "inventory",
  };
}
