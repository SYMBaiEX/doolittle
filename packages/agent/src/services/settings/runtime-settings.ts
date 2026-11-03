import type { RuntimeModelSettings } from "@doolittle/contracts/model-route";
import type { TuiThemeName } from "../../runtime/theme-catalog/index";
import type {
  ExecutionBackendName,
  RemoteArtifactPolicy,
  RemoteWorkspaceSyncMode,
  RunDepth,
  ToolProgressMode,
} from "../../types/index";
import type { ElizaMcpSettings, LegacyMcpSettings } from "../mcp/settings";

export {
  RUNTIME_REASONING_EFFORTS,
  type RuntimeReasoningEffort,
} from "@doolittle/contracts/model-route";

export interface RuntimeSettings {
  model: RuntimeModelSettings;
  gateway: {
    sessionTimeoutMinutes: number;
    mirrorResponsesToHistory: boolean;
  };
  execution: {
    backend: ExecutionBackendName;
    remoteSyncMode: RemoteWorkspaceSyncMode;
    remoteSyncInclude: string[];
    remoteSyncExclude: string[];
    remoteArtifactPaths: string[];
    remoteArtifactPolicy: RemoteArtifactPolicy;
    remoteWorkspaceLabel: string;
    dockerImage: string;
    dockerNetwork: string;
    dockerWorkspacePath: string;
    dockerEnvPassthrough: string[];
    singularityImage: string;
    daytonaTarget: string;
    daytonaCommand: string;
    daytonaShell: string;
    daytonaWorkspacePath: string;
    daytonaSnapshot: string;
    daytonaBootstrapCommand: string;
    daytonaStatusCommand: string;
    daytonaInspectCommand: string;
    modalTarget: string;
    modalCommand: string;
    modalShell: string;
    modalWorkspacePath: string;
    modalEnvironment: string;
    modalBootstrapCommand: string;
    modalStatusCommand: string;
    modalInspectCommand: string;
    commandTimeoutMs?: number;
    healthTimeoutMs?: number;
    containerCpuLimit?: string;
    containerMemoryLimit?: string;
    containerPidsLimit?: number;
    containerReadOnlyRoot?: boolean;
    sshHost: string;
    sshUser: string;
    sshPath: string;
    sshPort: number;
    sshKeyPath: string;
    sshStrictHostKeyChecking: boolean;
  };
  mcp: ElizaMcpSettings;
  agent: {
    runDepth: RunDepth;
    maxIterations: number;
    toolProgressMode: ToolProgressMode;
  };
  ui: {
    theme: TuiThemeName;
  };
}

export interface ParsedRuntimeSettings
  extends Omit<
    RuntimeSettings,
    "model" | "gateway" | "execution" | "mcp" | "agent" | "ui"
  > {
  model?: Partial<RuntimeSettings["model"]>;
  gateway?: Partial<RuntimeSettings["gateway"]>;
  execution?: Partial<RuntimeSettings["execution"]>;
  mcp?: Partial<RuntimeSettings["mcp"]> & LegacyMcpSettings;
  agent?: Partial<RuntimeSettings["agent"]>;
  ui?: Partial<RuntimeSettings["ui"]>;
}
