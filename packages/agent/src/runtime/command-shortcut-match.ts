import type { IAgentRuntime } from "@elizaos/core";
import { commandShortcutAliases } from "../actions/command-action";

export const DOOLITTLE_COMMAND_ACTION = "DOOLITTLE_COMMAND";

/** Match only registered client controls; execution stays behind SDK gates. */
export function matchesRegisteredCommandShortcut(
  runtime: IAgentRuntime,
  text: string,
): boolean {
  if (
    !runtime.actions.some((action) => action.name === DOOLITTLE_COMMAND_ACTION)
  )
    return false;
  const command = text.trim().split(/\s|:/u, 1)[0];
  return commandShortcutAliases().includes(command);
}

export function matchesRegisteredClientControl(
  runtime: IAgentRuntime,
  text: string,
): boolean {
  return (
    matchesRegisteredCommandShortcut(runtime, text) ||
    (runtime.actions.some(
      (action) => action.name === "DOOLITTLE_SHELL_SHORTCUT",
    ) &&
      text.trim().startsWith("!") &&
      !/^!web(?:\s|:|$)/iu.test(text.trim()))
  );
}
