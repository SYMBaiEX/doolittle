import type { UserProfileRecord } from "@/types";

export interface UserProfileAgentSeed {
  name?: string;
  goals?: string[];
  strengths?: string[];
  workStyle?: string[];
  notes?: string[];
}

export interface UserProfileModelingSettings {
  userMemoryMode?: "local" | "hybrid";
  assistantMemoryMode?: "local" | "hybrid";
  dialecticMode?: "off" | "assist" | "conclude";
}

export type UserProfileMemoryMode = UserProfileRecord["memoryMode"];
