import type { AgentRuntime, IAgentRuntime } from "@elizaos/core";

export const DOOLITTLE_COMMAND_ACTION = "DOOLITTLE_COMMAND";

/** Identify control-plane input without executing or authorizing the command. */
export function matchesRegisteredCommandShortcut(
  runtime: IAgentRuntime,
  text: string,
): boolean {
  const shortcutRegistry = (
    runtime as IAgentRuntime & Pick<AgentRuntime, "shortcutRegistry">
  ).shortcutRegistry;
  if (!shortcutRegistry) return false;
  const match = shortcutRegistry.match(text, {
    actions: runtime.actions.map((action) => action.name),
    allowNatural: false,
  });
  return (
    match?.shortcut.target.kind === "action" &&
    match.shortcut.target.name === DOOLITTLE_COMMAND_ACTION
  );
}
