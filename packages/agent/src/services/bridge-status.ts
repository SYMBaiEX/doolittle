export interface CommandBridgeStatusBase {
  enabled: boolean;
  detail: string;
  command?: string;
  timeoutMs: number;
  lastProbeAt?: string;
  lastInvocationAt?: string;
  lastError?: string;
}

export function createCommandBridgeStatus(params: {
  command?: string;
  timeoutMs: number;
  detail: string;
  lastProbeAt?: string;
  lastInvocationAt?: string;
  lastError?: string;
}): CommandBridgeStatusBase {
  return {
    enabled: Boolean(params.command),
    detail: params.detail,
    command: params.command || undefined,
    timeoutMs: params.timeoutMs,
    lastProbeAt: params.lastProbeAt,
    lastInvocationAt: params.lastInvocationAt,
    lastError: params.lastError,
  };
}
