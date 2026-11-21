import type { IAgentRuntime } from "@elizaos/core";
import { commandShortcutAliases } from "../actions/command-action";

export const DOOLITTLE_COMMAND_ACTION = "DOOLITTLE_COMMAND";
export const DOOLITTLE_SHELL_SHORTCUT_ACTION = "DOOLITTLE_SHELL_SHORTCUT";

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

export function resolveRegisteredClientControl(
  runtime: IAgentRuntime,
  text: string,
): string | undefined {
  if (matchesRegisteredCommandShortcut(runtime, text))
    return DOOLITTLE_COMMAND_ACTION;
  const trimmed = text.trim();
  if (
    trimmed.startsWith("!") &&
    !/^!web(?:\s|:|$)/iu.test(trimmed) &&
    runtime.actions.some(
      (action) => action.name === DOOLITTLE_SHELL_SHORTCUT_ACTION,
    )
  )
    return DOOLITTLE_SHELL_SHORTCUT_ACTION;
}
