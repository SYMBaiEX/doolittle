import { currentConversationWorkspace } from "../../../workspace-scope";
import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeShell } from "./native-services";

export async function runEffectiveShellCommand(
  runtime: RuntimeLike,
  command: string,
  timeoutMs?: number,
  abortSignal?: AbortSignal,
  options?: { requireCancellation?: boolean },
) {
  const shell = requireNativeShell(runtime);
  return options
    ? shell.run(command, timeoutMs, abortSignal, options)
    : shell.run(command, timeoutMs, abortSignal);
}

export function getEffectiveShellHistory(runtime: RuntimeLike, limit = 10) {
  // The SDK shell history has no conversation owner; never project it into a
  // bound chat even if another chat happens to use the same repository root.
  if (currentConversationWorkspace()) return [];
  return requireNativeShell(runtime).history(limit);
}

export async function getEffectiveShellStatus(runtime: RuntimeLike) {
  return requireNativeShell(runtime).status();
}
