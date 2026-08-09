import type {
  SandboxManager,
  SandboxManagerConfig,
} from "@elizaos/agent/services/sandbox-manager";

export const DOOLITTLE_SANDBOX_IMAGE = "eliza-sandbox:bookworm-slim";
export const DOOLITTLE_SANDBOX_PREFIX = "doolittle-e2b";
export const SANDBOX_OWNER_LOCK_SUFFIX = ".owner.lock";

export type SupportedSandboxTemplate = "node-js" | "python";

export interface E2BSandboxOptions {
  template?: string;
  metadata?: Record<string, string>;
}

export interface E2BSandboxRecord {
  id: string;
  path: string;
  template: SupportedSandboxTemplate;
  metadata: Record<string, string>;
  createdAt: string;
}

export interface E2BExecutionError {
  value: string;
  traceback?: string;
}

export interface E2BExecutionResult {
  success: boolean;
  text: string;
  stdout: string;
  stderr: string;
  error?: E2BExecutionError;
  language: string;
  sandboxId?: string;
}

export type SandboxManagerLike = Pick<
  SandboxManager,
  "getContainerWorkspacePath" | "getEventLog" | "getStatus" | "start" | "stop"
>;

export interface LocalSandboxServiceOptions {
  rootDir?: string;
  containerPrefix?: string;
  managerFactory?: (config: SandboxManagerConfig) => SandboxManagerLike;
  processId?: number;
  nonceFactory?: () => string;
  isProcessAlive?: (processId: number) => boolean;
}

export interface SandboxOwnerRecord {
  pid: number;
  nonce: string;
}

export class SandboxNotFoundError extends Error {
  readonly code = "SANDBOX_NOT_FOUND";

  constructor(readonly sandboxId: string) {
    super(`Sandbox not found: ${sandboxId}`);
    this.name = "SandboxNotFoundError";
  }
}

export class UnsupportedSandboxTemplateError extends Error {
  readonly code = "UNSUPPORTED_SANDBOX_TEMPLATE";

  constructor(readonly template: string) {
    super(`Unsupported sandbox template: ${template}`);
    this.name = "UnsupportedSandboxTemplateError";
  }
}

export class SandboxClosingError extends Error {
  readonly code = "SANDBOX_CLOSING";

  constructor(readonly sandboxId: string) {
    super(`Sandbox is closing: ${sandboxId}`);
    this.name = "SandboxClosingError";
  }
}

export class SandboxOwnershipError extends Error {
  readonly code = "SANDBOX_OWNERSHIP_CONFLICT";

  constructor(
    message: string,
    readonly lockPath: string,
    readonly ownerPid?: number,
  ) {
    super(message);
    this.name = "SandboxOwnershipError";
  }
}

export class SandboxCleanupVerificationError extends Error {
  readonly code = "SANDBOX_CLEANUP_UNVERIFIED";

  constructor(message: string) {
    super(message);
    this.name = "SandboxCleanupVerificationError";
  }
}
