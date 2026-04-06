import type { PlatformName } from "@/types/gateway";

export interface TransportInventoryEntry {
  platform: string;
  source: string;
  configEnabled: boolean;
  gatewayEnabled: boolean;
  operational: boolean;
  reason: string;
  detail: string;
}

export interface TransportRequirementRecord {
  platform: PlatformName;
  label: string;
  enabled: boolean;
  configured: boolean;
  missing: string[];
  mode: "all" | "any" | "none";
  summary: string;
  checklist: string | null;
  status: "pass" | "warn" | "fail";
}
