import type { RuntimeLike } from "../runtime";
import type {
  NativeCodeGenerationService,
  NativeFormsService,
  NativeGitHubService,
  NativeSecretsManagerService,
} from "../runtime-contracts";

export type { RuntimeLike };

export type NativeResearchServices = {
  codeGeneration?: NativeCodeGenerationService;
  forms?: NativeFormsService;
  github?: NativeGitHubService;
  secretsManager?: NativeSecretsManagerService;
};

export interface NativePlanningControlPlane {
  source: "native-plugin" | "unavailable";
  available: boolean;
  actionPlanningAvailable: boolean;
  capability: string;
  plans: {
    total: number;
    linkedTasks: number;
    linkedWorkflows: number;
  };
  supportsCreate: boolean;
  supportsApprove: boolean;
  supportsSteer: boolean;
  detail: string;
}
