import { spawnSync } from "node:child_process";
import type { BootstrapWizardContext } from "../bootstrap-context";
import {
  restoreWizardScreen,
  suspendWizardScreen,
} from "../wizard-screen/lifecycle";

export function runInteractiveCommand(
  context: BootstrapWizardContext,
  command: string,
  args: string[],
  label: string,
): boolean {
  const snapshot = suspendWizardScreen(context);
  context.section("Binding", label);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  restoreWizardScreen(context, snapshot);
  if (result.error) {
    context.warn(`${label} failed: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    context.warn(`${label} exited with code ${result.status ?? "unknown"}.`);
    return false;
  }
  context.info(`${label} completed.`);
  return true;
}
