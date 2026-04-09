import type {
  DiagnosticCheck,
  ExecutionCloudProfile,
  ExecutionRemoteSyncPlan,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";

export type CloudExecutionProvider = "daytona" | "modal";

export interface CloudPlanningSummary {
  binary: string;
  target: string;
  shell: string;
  bootstrapCommand?: string;
  statusCommand?: string;
  inspectCommand?: string;
  profile: ExecutionCloudProfile;
}

export type CloudRuntimeChecks = DiagnosticCheck[];

export type CloudSettings = RuntimeSettings;

export type CloudSyncPlan = ExecutionRemoteSyncPlan;
