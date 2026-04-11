import type { getAgentEventService } from "@elizaos/autonomous/runtime/agent-event-service";
import type { IAgentRuntime } from "@elizaos/core";

export interface NativeKnowledgeService {
  ingestPdf(path: string): Promise<unknown>;
  extractPdf?(path: string): Promise<string>;
  remember(text: string, source?: string): unknown;
  recall(query: string, limit?: number): unknown;
  search?(query: string, limit?: number): unknown;
  read?(target?: "memory" | "user"): string;
  list?(target?: "memory" | "user"): string[];
  summary?(target?: "memory" | "user"): unknown;
}

export interface NativePersonalityService {
  list(): unknown[];
  get(id: string): unknown;
  activate(id: string): unknown;
  activeId(): string | undefined;
  summary?(): unknown;
}

export interface NativeRolodexService {
  card(userId: string): unknown;
  remember(
    userId: string,
    kind: string,
    text: string,
    source?: string,
  ): unknown;
  recall(userId: string, query: string): unknown;
  observeAgent(text: string, source?: string): unknown;
  agentProfile(): unknown;
  summary?(): unknown;
  search?(query: string, limit?: number): unknown;
  beliefs?(userId: string): unknown;
  relationship?(userId: string): unknown;
  engagement?(userId: string): unknown;
}

export interface NativeExperienceService {
  usage(sessionId: string): unknown;
  recent?(limit?: number): unknown;
  memorySnapshot?(): unknown;
  summary?(): unknown;
}

export interface NativeShellService {
  run(command: string): Promise<unknown>;
  history(limit?: number): unknown[];
  status(): Promise<unknown>;
}

export interface NativeBrowserService {
  status(): Promise<unknown>;
  summary?(): {
    operations: string[];
    multimodal: boolean;
    captureReady: boolean;
    analysisReady: boolean;
  };
  fetch(url: string): Promise<string>;
  inspect(url: string): Promise<unknown>;
  snapshot(url: string): Promise<string>;
  screenshot(url: string): Promise<string>;
  capture(url: string): Promise<unknown>;
  analyze(url: string): Promise<unknown>;
  compare(leftUrl: string, rightUrl: string): Promise<unknown>;
  analyzeComparison(leftUrl: string, rightUrl: string): Promise<unknown>;
}

export interface NativeMcpService {
  status(): unknown;
  probe(): Promise<unknown>;
  discoverTools(): Promise<unknown>;
  invoke(input: string): Promise<unknown>;
  invokeTool(name: string, input: Record<string, unknown>): Promise<unknown>;
  getCachedTools(): unknown[];
  searchCachedTools(query: string): unknown[];
  describeCachedTools(limit?: number): string;
  describeTool(name: string): string;
}

export interface NativeCronService {
  list(): unknown[];
  get(id: string): unknown;
  create(input: unknown): unknown;
  update(id: string, patch: unknown): unknown;
  runs(limit?: number): unknown[];
}

export interface NativeAgentSkillsService {
  list(): unknown[];
  get(slug: string): unknown;
  generated?(): unknown[];
  summary?(): unknown;
  catalog?(limit?: number): unknown;
  searchCatalog?(query: string, limit?: number): unknown;
  synthesize(taskId: string): unknown;
}

export interface NativeTrajectoryLoggerService {
  exportLatest(): unknown;
  listBundles(): unknown[];
  compareLatest(): unknown;
  bundles?(): unknown[];
}

export interface NativeAgentOrchestratorService {
  createTask(
    title: string,
    objective: string,
    metadata?: Record<string, unknown>,
  ): unknown;
  getTask?(id: string): unknown;
  getChildren?(id: string): unknown[];
  tree?(id: string): unknown;
  aggregate?(id: string): unknown;
  queue(): unknown;
  overview?(): unknown;
  summary?(): {
    tasks: number;
    queuePending: number;
    activeWorkers: number;
    childTasksSupported: boolean;
    treeSupported: boolean;
    retrySupported: boolean;
  };
  tasks(): unknown[];
  spawnChild?(parentId: string, input: unknown): unknown;
  retryTask?(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): unknown;
  cancelTask?(id: string, note?: string): unknown;
  supervise?(
    runner: (task: unknown) => Promise<string>,
    runOptions?: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface NativeCodingAgentService {
  read(path: string): unknown;
  write(path: string, content: string): unknown;
  search(query: string, limit?: number): unknown;
  repoStatus(): Promise<unknown>;
  repoDiff(): Promise<unknown>;
  repoLog(limit?: number): Promise<unknown>;
  run(command: string): Promise<unknown>;
  inspectProject?(targetPath?: string): Promise<unknown> | unknown;
  delegate?(
    title: string,
    objective: string,
    metadata?: Record<string, unknown>,
  ): unknown;
  tasks?(): unknown[];
  context?(
    taskDescription: string,
    options?: {
      sessionId?: string;
      workingDirectory?: string;
      maxIterations?: number;
      interactionMode?: unknown;
      connectorType?: unknown;
      metadata?: Record<string, string>;
    },
  ): unknown;
}

export interface NativeApprovalService {
  requestApprovalAsync?(input: unknown): Promise<string>;
  handleSelection?(taskId: string, selectedOption: string): Promise<void>;
  getPendingApprovals?(roomId: string): Promise<unknown[]>;
}

export interface NativeToolPolicyService {
  getAllowedTools?(
    context: {
      profile?: "minimal" | "coding" | "messaging" | "full";
    },
    availableTools: string[],
  ): string[];
  getDeniedTools?(
    context: {
      profile?: "minimal" | "coding" | "messaging" | "full";
    },
    availableTools: string[],
  ): Array<{ name: string; reason: string }>;
  getEffectivePolicy?(context?: {
    profile?: "minimal" | "coding" | "messaging" | "full";
  }): unknown;
}

export interface NativePluginManagerService {
  list(): unknown[];
  categories(): unknown;
  summary?(): {
    total: number;
    enabled: number;
    official: number;
    vendored: number;
    categories: number;
  };
}

export interface NativeDiscordTransportService {
  status?: () => unknown;
  history?: (limit?: number) => unknown[];
}

export interface NativeCodeGenerationService {
  capabilityDescription?: string;
  performResearch?: (...args: unknown[]) => unknown;
  generatePRD?: (...args: unknown[]) => unknown;
  performQA?: (...args: unknown[]) => unknown;
  generateCode?: (...args: unknown[]) => unknown;
  generateCodeInternal?: (...args: unknown[]) => unknown;
  runValidationSuite?: (...args: unknown[]) => unknown;
  generateCodeInChunks?: (...args: unknown[]) => unknown;
  installDependencies?: (...args: unknown[]) => unknown;
}

export interface NativeFormsService {
  capabilityDescription?: string;
  isPersistenceAvailable?: () => boolean;
  listForms?: () => unknown[];
  getTemplates?: () => Map<string, object> | object[] | Record<string, object>;
  createForm?: (
    templateOrForm: unknown,
    metadata?: unknown,
  ) => Promise<unknown>;
  getForm?: (formId: string) => Promise<unknown>;
  cancelForm?: (formId: string) => Promise<boolean>;
  forcePersist?: () => Promise<{ path: string; total: number }>;
}

export interface NativePlanningService {
  capabilityDescription?: string;
  listPlans?: () => unknown[];
  getPlan?: (
    planId: string,
  ) => Promise<unknown | undefined> | unknown | undefined;
  createPlan?: (input: unknown) => Promise<unknown> | unknown;
  summary?: () => {
    total: number;
    active: number;
    draft: number;
    completed: number;
    linkedTasks: number;
    linkedWorkflows: number;
    delegationTasks: number;
    workflows: number;
  };
}

export interface NativeE2BService {
  capabilityDescription?: string;
  listSandboxes?: () => Array<{
    id?: string;
    path?: string;
    template?: string;
    metadata?: Record<string, string>;
    createdAt?: string;
  }>;
  createSandbox?: (options?: {
    template?: string;
    metadata?: Record<string, string>;
  }) => Promise<string>;
  killSandbox?: (id?: string) => Promise<void>;
  executeCode?: (code: string, language?: string) => Promise<unknown>;
}

export interface NativeGitHubService {
  capabilityDescription?: string;
  createRepository?: (name: string, isPrivate?: boolean) => Promise<unknown>;
  deleteRepository?: (name: string) => Promise<unknown>;
}

export interface NativeSecretsManagerService {
  capabilityDescription?: string;
  getSecret?: (key: string) => Promise<unknown> | unknown;
  setSecret?: (key: string, value: string) => Promise<unknown> | unknown;
  hasSecret?: (key: string) => Promise<boolean> | boolean;
  listSecretKeys?: () => Promise<string[]> | string[];
}

export interface NativeTelegramTransportService {
  bot?: unknown;
  messageManager?: unknown;
  knownChats?: Map<string | number, unknown>;
}

export type RuntimeLike = Partial<
  Pick<IAgentRuntime, "getService" | "getAllActions">
>;

export type NativeServices = {
  knowledge: NativeKnowledgeService | undefined;
  personality: NativePersonalityService | undefined;
  rolodex: NativeRolodexService | undefined;
  experience: NativeExperienceService | undefined;
  shell: NativeShellService | undefined;
  browser: NativeBrowserService | undefined;
  mcp: NativeMcpService | undefined;
  cron: NativeCronService | undefined;
  agentSkills: NativeAgentSkillsService | undefined;
  trajectoryLogger: NativeTrajectoryLoggerService | undefined;
  agentOrchestrator: NativeAgentOrchestratorService | undefined;
  codingAgent: NativeCodingAgentService | undefined;
  approval: NativeApprovalService | undefined;
  agentEvent: ReturnType<typeof getAgentEventService> | null;
  pluginManager: NativePluginManagerService | undefined;
  toolPolicy: NativeToolPolicyService | undefined;
  telegram: NativeTelegramTransportService | undefined;
  discordTransport: NativeDiscordTransportService | undefined;
  codeGeneration: NativeCodeGenerationService | undefined;
  e2b: NativeE2BService | undefined;
  forms: NativeFormsService | undefined;
  planning: NativePlanningService | undefined;
  github: NativeGitHubService | undefined;
  secretsManager: NativeSecretsManagerService | undefined;
};
