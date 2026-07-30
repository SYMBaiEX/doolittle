import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeShell } from "./native-services";

export async function runEffectiveShellCommand(
  runtime: RuntimeLike,
  command: string,
  timeoutMs?: number,
) {
  return requireNativeShell(runtime).run(command, timeoutMs);
}

export function getEffectiveShellHistory(runtime: RuntimeLike, limit = 10) {
  return requireNativeShell(runtime).history(limit);
}

export async function getEffectiveShellStatus(runtime: RuntimeLike) {
  return requireNativeShell(runtime).status();
}
