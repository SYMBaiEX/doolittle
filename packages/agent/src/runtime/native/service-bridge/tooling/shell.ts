import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime-contracts";
import { getNativeShell } from "./native-services";

export async function runEffectiveShellCommand(
  runtime: RuntimeLike,
  services: AppServices,
  command: string,
) {
  const shell = getNativeShell(runtime);
  return shell ? shell.run(command) : services.terminal.run(command);
}

export function getEffectiveShellHistory(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 10,
): unknown[] {
  return (
    getNativeShell(runtime)?.history(limit) ?? services.terminal.recent(limit)
  );
}

export async function getEffectiveShellStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeShell(runtime)?.status()) ?? services.terminal.status()
  );
}
