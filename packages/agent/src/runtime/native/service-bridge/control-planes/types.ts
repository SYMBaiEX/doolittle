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
  source: "native-plugin" | "product";
  available: boolean;
  capability: string;
  plans: {
    total: number;
    linkedTasks: number;
    linkedWorkflows: number;
  };
  supportsCreate: boolean;
  detail: string;
}
