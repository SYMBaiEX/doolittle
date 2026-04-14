import { ensureEnvFile, readEnvEntries } from "../core/env-file";
import { applyBootstrapAnswers } from "../persistence/apply";
import { buildBootstrapCheckSummary } from "../summary";
import type { WizardAnswers } from "../types";
import { getDependencyProbes } from "../wizard/dependencies";
import { runWizard } from "../wizard-flow";
import { createBootstrapProgramContext } from "./context";
import { resolveBootstrapOptions } from "./options";
import {
  ensureBootstrapDirectories,
  resolveBootstrapDirectories,
  resolveBootstrapPaths,
} from "./paths";
import { printBootstrapSummary } from "./summary";

export async function runBootstrapProgram(
  options: { args?: string[]; root?: string } = {},
): Promise<number> {
  const root = options.root ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const bootstrapOptions = resolveBootstrapOptions(args);
  const directories = resolveBootstrapDirectories();
  const paths = resolveBootstrapPaths(root);
  const { wizardContext, section, isAbortError } =
    createBootstrapProgramContext({
      root,
      bootstrapOptions,
    });

  const createdDirs = ensureBootstrapDirectories({
    root,
    directories,
    checkOnly: bootstrapOptions.checkOnly,
  });
  const initialEnvMessages = ensureEnvFile({
    envPath: paths.envPath,
    envExamplePath: paths.envExamplePath,
    checkOnly: bootstrapOptions.checkOnly,
  });
  const dependencyProbes = getDependencyProbes(
    root,
    readEnvEntries(paths.envPath),
  );

  if (bootstrapOptions.checkOnly) {
    console.log(
      buildBootstrapCheckSummary({
        createdDirs,
        dependencyProbes,
        envMessages: initialEnvMessages,
      }),
    );
    return 0;
  }

  const existingEnv = readEnvEntries(paths.envPath);
  let answers: WizardAnswers;
  try {
    answers = await runWizard(existingEnv, wizardContext);
  } catch (error) {
    if (isAbortError(error)) {
      return 1;
    }
    throw error;
  }

  const { envMessages, onboarding } = await applyBootstrapAnswers(
    answers,
    {
      envPath: paths.envPath,
      settingsPath: paths.settingsPath,
      gatewayPath: paths.gatewayPath,
      onboardingPath: paths.onboardingPath,
      nativeOnboardingPath: paths.nativeOnboardingPath,
    },
    bootstrapOptions,
  );

  printBootstrapSummary({
    checkOnly: bootstrapOptions.checkOnly,
    createdDirs,
    envMessages: [...initialEnvMessages, ...envMessages],
    onboarding,
    section,
  });

  return 0;
}
