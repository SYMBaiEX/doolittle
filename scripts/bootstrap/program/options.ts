import { platform } from "node:os";
import { stdin as input, stdout as output } from "node:process";
import type { BootstrapOptions } from "../types";

const IS_MACOS = platform() === "darwin";

export function formatBootstrapInstallerKeyLabel(label: string): string {
  if (!IS_MACOS) {
    return label;
  }
  return label
    .replaceAll("Alt-", "Option-")
    .replaceAll("Alt", "Option")
    .replaceAll("Ctrl-", "Control-")
    .replaceAll("Ctrl", "Control");
}

export function isBootstrapShellInteractive(): boolean {
  return input.isTTY && output.isTTY;
}

export function resolveBootstrapOptions(
  args: string[],
  interactiveShell = isBootstrapShellInteractive(),
): BootstrapOptions {
  return {
    checkOnly: args.includes("--check"),
    headless:
      args.includes("--headless") ||
      args.includes("--non-interactive") ||
      !interactiveShell,
    skipWizard: args.includes("--skip-wizard"),
    yes: args.includes("--yes"),
  };
}
