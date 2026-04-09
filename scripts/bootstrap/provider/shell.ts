import { spawnSync } from "node:child_process";
import type { BootstrapWizardContext } from "../bootstrap-context";
import { createWizardScreen } from "../wizard-screen/surface";

export function runInteractiveCommand(
  context: BootstrapWizardContext,
  command: string,
  args: string[],
  label: string,
): boolean {
  const snapshot = context.getWizardScreen()?.snapshot();
  if (context.getWizardScreen()) {
    context.getWizardScreen()?.destroy();
    context.setWizardScreen(null);
    console.log();
  }
  context.section("Binding", label);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (snapshot) {
    context.setWizardScreen(
      createWizardScreen({
        initial: snapshot,
        formatKeyLabel: context.formatKeyLabel,
        onAbort: () => process.exit(1),
      }),
    );
  }
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
