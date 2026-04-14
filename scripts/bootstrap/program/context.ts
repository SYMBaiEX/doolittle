import {
  createBootstrapAbortHandle,
  isBootstrapAbortError,
} from "../abort";
import type { BootstrapWizardContext } from "../bootstrap-context";
import { createBootstrapOutput } from "../core/output";
import type { BootstrapOptions } from "../types";
import type { WizardScreenContext } from "../wizard-screen/types";
import { formatBootstrapInstallerKeyLabel } from "./options";

export function createBootstrapProgramContext(options: {
  root: string;
  bootstrapOptions: BootstrapOptions;
}) {
  let wizardScreen: WizardScreenContext | null = null;
  const bootstrapOutput = createBootstrapOutput(() => wizardScreen);
  const abortHandle = createBootstrapAbortHandle();

  const wizardContext: BootstrapWizardContext = {
    root: options.root,
    options: {
      headless: options.bootstrapOptions.headless,
      skipWizard: options.bootstrapOptions.skipWizard,
    },
    banner: bootstrapOutput.banner,
    section: bootstrapOutput.section,
    info: bootstrapOutput.info,
    warn: bootstrapOutput.warn,
    formatKeyLabel: formatBootstrapInstallerKeyLabel,
    getWizardScreen: () => wizardScreen,
    setWizardScreen: (screen) => {
      wizardScreen = screen;
    },
    abortBootstrap: abortHandle.abort,
    raceBootstrapAbort: abortHandle.race,
    throwIfBootstrapAborted: abortHandle.throwIfAborted,
  };

  return {
    wizardContext,
    section: bootstrapOutput.section,
    isAbortError: isBootstrapAbortError,
  };
}
