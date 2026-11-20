import { join, relative } from "node:path";
import { loadProcessEnv } from "@doolittle/agent/config/env/load";
import { getDefaultRepoRoot } from "@doolittle/agent/config/env/paths";
import { ensureEnvFile, readEnvEntries } from "../core/env-file";
import { applyBootstrapAnswers } from "../persistence/apply";
import { buildBootstrapCheckSummary } from "../summary";
import type { WizardAnswers } from "../types";
import { getDependencyProbes } from "../wizard/dependencies";
import { runWizard } from "../wizard-flow";
import { createBootstrapProgramContext } from "./context";
import { resolveBootstrapOptions } from "./options";
import { ensureBootstrapDirectories, resolveBootstrapPaths } from "./paths";
import { assertHeadlessProviderAvailable } from "./provider-guard";
import { printBootstrapSummary } from "./summary";

export async function runBootstrapProgram(
  options: { args?: string[]; root?: string } = {},
): Promise<number> {
  const root = options.root ?? getDefaultRepoRoot();
  const args = options.args ?? process.argv.slice(2);
  const bootstrapOptions = resolveBootstrapOptions(args);
  const { wizardContext, section, isAbortError } =
    createBootstrapProgramContext({
      root,
      bootstrapOptions,
    });

  const envPath = join(root, ".env");
  const initialEnvMessages = ensureEnvFile({
    envPath,
    envExamplePath: join(root, ".env.example"),
    checkOnly: bootstrapOptions.checkOnly,
  });
  const runtimeEnv = { ...process.env };
  loadProcessEnv(root, { env: runtimeEnv });
  const paths = resolveBootstrapPaths(root, runtimeEnv);
  const existingEnv = readEnvEntries(envPath);
  const createdDirs = ensureBootstrapDirectories(
    root,
    paths.directories,
    bootstrapOptions.checkOnly,
  );

  if (bootstrapOptions.checkOnly) {
    console.log(
      buildBootstrapCheckSummary({
        createdDirs,
        dependencyProbes: getDependencyProbes(root, existingEnv),
        envMessages: initialEnvMessages,
        files: [
          paths.envPath,
          paths.settingsPath,
          paths.gatewayPath,
          paths.onboardingPath,
        ].map((path) => relative(root, path) || path),
      }),
    );
    return 0;
  }

  if (bootstrapOptions.headless || bootstrapOptions.skipWizard) {
    assertHeadlessProviderAvailable(paths.settingsPath);
  }
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
    paths,
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
