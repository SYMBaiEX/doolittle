import { terminalAction } from "@elizaos/agent/actions/terminal";

export const SDK_TERMINAL_ACTION_NAME = terminalAction.name;

export function isSdkTerminalActionName(name: unknown): boolean {
  return name === SDK_TERMINAL_ACTION_NAME || name === "SHELL";
}

export function isShellResultActionName(name: unknown): boolean {
  return (
    isSdkTerminalActionName(name) ||
    name === "SHELL_COMMAND" ||
    name === "RUN_IN_TERMINAL"
  );
}
