import type { BootstrapOptions } from "./types";
import type { WizardScreenContext } from "./wizard-screen/types";

export interface BootstrapWizardContext {
  root: string;
  options: Pick<BootstrapOptions, "headless" | "skipWizard">;
  banner: () => void;
  section: (title: string, detail: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  formatKeyLabel: (label: string) => string;
  getWizardScreen: () => WizardScreenContext | null;
  setWizardScreen: (screen: WizardScreenContext | null) => void;
}
