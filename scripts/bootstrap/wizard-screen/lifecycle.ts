import type { BootstrapWizardContext } from "../bootstrap-context";
import { createWizardScreen } from "./surface";
import type { WizardSnapshot } from "./types";

export function suspendWizardScreen(
  context: BootstrapWizardContext,
): WizardSnapshot | null {
  const screen = context.getWizardScreen();
  if (!screen) {
    return null;
  }

  const snapshot = screen.snapshot();
  screen.destroy();
  context.setWizardScreen(null);
  console.log();
  return snapshot;
}

export function restoreWizardScreen(
  context: BootstrapWizardContext,
  snapshot: Partial<WizardSnapshot> | null,
): void {
  if (!snapshot) {
    return;
  }

  context.setWizardScreen(
    createWizardScreen({
      initial: snapshot,
      formatKeyLabel: context.formatKeyLabel,
      onAbort: () => context.abortBootstrap(),
    }),
  );
}

export function initializeWizardScreen(
  context: BootstrapWizardContext,
  initial?: Partial<WizardSnapshot>,
): void {
  context.setWizardScreen(
    createWizardScreen({
      initial,
      formatKeyLabel: context.formatKeyLabel,
      onAbort: () => context.abortBootstrap(),
    }),
  );
}
