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

export interface NativeTelegramSentMessage {
  message_id: string | number;
  chat: {
    id: string | number;
  };
}

export interface NativeTelegramMessageManager {
  sendMessage(
    chatId: string | number,
    content: {
      text?: string;
      source?: string;
      metadata?: Record<string, string>;
    },
    replyToMessageId?: number,
    messageThreadId?: number,
  ): Promise<NativeTelegramSentMessage[]>;
  editMessage(
    chatId: string | number,
    messageId: number,
    text: string,
    messageThreadId?: number,
  ): Promise<void>;
}

export interface NativeTelegramBot {
  telegram: {
    sendVoice(
      chatId: string | number,
      voice: { source: unknown },
      options?: {
        caption?: string;
        message_thread_id?: number;
        reply_parameters?: { message_id: number };
      },
    ): Promise<NativeTelegramSentMessage>;
  };
}

export interface NativeTelegramTransportService {
  getBot?: () => NativeTelegramBot | null;
  getBots?: () => NativeTelegramBot[];
  messageManager?: NativeTelegramMessageManager | null;
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
  getActiveSandboxId?: () => string | undefined;
  killSandbox?: (id?: string) => Promise<void>;
  executeCode?: (
    code: string,
    language?: string,
    sandboxId?: string,
  ) => Promise<unknown>;
}

export interface NativeGitHubPlanningService {
  capabilityDescription?: string;
  createRepository?: (name: string, isPrivate?: boolean) => Promise<unknown>;
  deleteRepository?: (name: string) => Promise<unknown>;
}

export interface NativeSecretsService {
  capabilityDescription?: string;
  getGlobal?: (key: string) => Promise<string | null>;
  setGlobal?: (key: string, value: string) => Promise<boolean>;
  list?: (context: {
    level: "global";
    agentId: string;
  }) => Promise<Record<string, unknown>>;
}
