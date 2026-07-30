import {
  type AutomationJobRecord,
  type AutomationRunRecord,
  DOOLITTLE_AUTOMATION_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
} from "@doolittle/contracts";

export const PDF_SERVICE = "pdf";
export { DOOLITTLE_AUTOMATION_SERVICE, DOOLITTLE_SHELL_SERVICE };

export interface NativePdfService {
  convertPdfToTextWithOptions(
    pdfBuffer: Buffer | Uint8Array,
    options?: {
      startPage?: number;
      endPage?: number;
      preserveWhitespace?: boolean;
      cleanContent?: boolean;
    },
  ): Promise<{
    success: boolean;
    text?: string;
    error?: string;
  }>;
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

export interface NativeAutomationService {
  list(): AutomationJobRecord[] | Promise<AutomationJobRecord[]>;
  get(
    id: string,
  ): AutomationJobRecord | undefined | Promise<AutomationJobRecord | undefined>;
  create(input: unknown): AutomationJobRecord | Promise<AutomationJobRecord>;
  update(
    id: string,
    patch: unknown,
  ): AutomationJobRecord | Promise<AutomationJobRecord>;
  runs(limit?: number): AutomationRunRecord[] | Promise<AutomationRunRecord[]>;
  pause?(id: string): AutomationJobRecord | Promise<AutomationJobRecord>;
  resume?(id: string): AutomationJobRecord | Promise<AutomationJobRecord>;
  runNow?(id: string): AutomationJobRecord | Promise<AutomationJobRecord>;
  triggerNow?(
    id: string,
    source?: "manual" | "webhook",
    payload?: Record<string, unknown>,
  ): AutomationRunRecord | undefined | Promise<AutomationRunRecord | undefined>;
  triggerWebhook?(
    token: string,
    payload?: Record<string, unknown>,
  ): AutomationRunRecord | undefined | Promise<AutomationRunRecord | undefined>;
  remove?(id: string): void | Promise<void>;
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
