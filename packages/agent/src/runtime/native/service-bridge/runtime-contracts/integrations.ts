export interface NativePluginManagerService {
  getAllPlugins?(): unknown[];
  getLoadedPlugins?(): unknown[];
  list?(): unknown[];
  categories?(): unknown;
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

export interface NativeTelegramTransportService {
  bot?: unknown;
  messageManager?: unknown;
  knownChats?: Map<string | number, unknown>;
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

export interface NativeActionPlanningService {
  capabilityDescription?: string;
  createSimplePlan?: (...args: unknown[]) => Promise<unknown>;
  createComprehensivePlan?: (...args: unknown[]) => Promise<unknown>;
  executePlan?: (...args: unknown[]) => Promise<unknown>;
  validatePlan?: (...args: unknown[]) => Promise<unknown>;
  adaptPlan?: (...args: unknown[]) => Promise<unknown>;
  getPlanStatus?: (planId: string) => Promise<unknown>;
  cancelPlan?: (planId: string) => Promise<boolean>;
}

export interface NativeOperatorPlanningService {
  capabilityDescription?: string;
  listPlans?: () => unknown[];
  getPlan?: (
    planId: string,
  ) => Promise<unknown | undefined> | unknown | undefined;
  createPlan?: (input: unknown) => Promise<unknown> | unknown;
  approvePlan?: (planId: string) => Promise<unknown> | unknown;
  steerPlan?: (
    planId: string,
    instruction: string,
  ) => Promise<unknown> | unknown;
  summary?: () => {
    total: number;
    active: number;
    draft: number;
    completed: number;
    linkedTasks: number;
    linkedWorkflows: number;
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
