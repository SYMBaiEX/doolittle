import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { sanitizeCommand } from "../../execution/subprocess";

export interface ResolvedExecutionContext {
  settings: RuntimeSettings;
  safeCommand: string;
  effectiveTimeoutMs: number;
}

export function resolveExecutionContext(input: {
  command: string;
  timeoutMs?: number;
  getSettings: () => RuntimeSettings;
  settings?: RuntimeSettings;
}): ResolvedExecutionContext {
  const settings = input.settings ?? input.getSettings();
  return {
    settings,
    safeCommand: sanitizeCommand(input.command),
    effectiveTimeoutMs:
      input.timeoutMs ?? settings.execution.commandTimeoutMs ?? 30_000,
  };
}
