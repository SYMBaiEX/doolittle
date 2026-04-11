export interface TerminalServiceLike {
  run(
    command: string,
    timeoutMs?: number,
    abortSignal?: AbortSignal,
  ): Promise<unknown>;
  getHistory(limit?: number): unknown[];
  status(): Promise<{
    configured: string;
    preview: {
      backend: string;
      mode?: string;
      engine?: string;
      target?: string;
      cloud?: unknown;
      command: string;
      ready: boolean;
      detail: string;
    };
    health: Array<{
      backend: string;
      mode: string;
      ready: boolean;
      detail: string;
    }>;
  }>;
}
