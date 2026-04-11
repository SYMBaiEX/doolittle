export interface E2BSandboxOptions {
  template?: string;
  metadata?: Record<string, string>;
}

export interface E2BSandboxRecord {
  id: string;
  path: string;
  template: string;
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
