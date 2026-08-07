import type { RuntimeLike } from "../runtime";
import type {
  NativeCodeGenerationService,
  NativeFormsService,
  NativeGitHubPlanningService,
  NativeSecretsManagerService,
} from "../runtime-contracts";

export type { RuntimeLike };

export type NativeResearchServices = {
  codeGeneration?: NativeCodeGenerationService;
  forms?: NativeFormsService;
  githubPlanning?: NativeGitHubPlanningService;
  secretsManager?: NativeSecretsManagerService;
};

export interface NativePlanningControlPlane {
  source: "product-plugin" | "unavailable";
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
