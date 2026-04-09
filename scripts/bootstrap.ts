#!/usr/bin/env bun

import { existsSync, mkdirSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { getTuiTheme } from "../packages/agent/src/runtime/theme-catalog";
import type { BootstrapWizardContext } from "./bootstrap/bootstrap-context";
import { ensureEnvFile, readEnvEntries } from "./bootstrap/core/env-file";
import {
  bootstrapColor as color,
  createBootstrapOutput,
  paint,
} from "./bootstrap/core/output";
import {
  applyAnswers,
  type BootstrapPersistencePaths,
} from "./bootstrap/persistence/index";
import {
  buildBootstrapCheckSummary,
  buildBootstrapPulseSummary,
} from "./bootstrap/summary";
import type { BootstrapOptions, OnboardingSummary } from "./bootstrap/types";
import { getDependencyProbes } from "./bootstrap/wizard/dependencies";
import { runWizard } from "./bootstrap/wizard-flow";
import type { WizardScreenContext } from "./bootstrap/wizard-screen/types";

const IS_MACOS = platform() === "darwin";

function macAwareInstallerKeyLabel(label: string): string {
  if (!IS_MACOS) {
    return label;
  }
  return label
    .replaceAll("Alt-", "Option-")
    .replaceAll("Alt", "Option")
    .replaceAll("Ctrl-", "Control-")
    .replaceAll("Ctrl", "Control");
}

const root = process.cwd();
const args = process.argv.slice(2);
const options: BootstrapOptions = {
  checkOnly: args.includes("--check"),
  headless:
    args.includes("--headless") ||
    args.includes("--non-interactive") ||
    !input.isTTY ||
    !output.isTTY,
  skipWizard: args.includes("--skip-wizard"),
  yes: args.includes("--yes"),
};

const directories = [
  ".doolittle",
  ".doolittle/cron-output",
  ".doolittle/gateway",
  ".doolittle/hooks",
  ".doolittle/remote-artifacts",
  ".doolittle/trajectories",
  "packages/skills/generated",
  "packages/skill-packs-optional/generated",
];

const envPath = join(root, ".env");
const envExamplePath = join(root, ".env.example");
const settingsPath = join(root, ".doolittle", "settings.json");
const gatewayPath = join(root, ".doolittle", "gateway", "gateway.json");
const onboardingPath = join(root, ".doolittle", "onboarding.json");
const nativeOnboardingPath = join(root, ".doolittle", "onboarding.state.json");

let wizardScreen: WizardScreenContext | null = null;
const bootstrapOutput = createBootstrapOutput(() => wizardScreen);
const { banner, info, section, warn } = bootstrapOutput;

const wizardContext: BootstrapWizardContext = {
  root,
  options: {
    headless: options.headless,
    skipWizard: options.skipWizard,
  },
  banner,
  section,
  info,
  warn,
  formatKeyLabel: macAwareInstallerKeyLabel,
  getWizardScreen: () => wizardScreen,
  setWizardScreen: (screen) => {
    wizardScreen = screen;
  },
};

function ensureDir(path: string): void {
  if (existsSync(path) || options.checkOnly) {
    return;
  }
  mkdirSync(path, { recursive: true });
}

function printSummary(
  createdDirs: string[],
  envMessages: string[],
  onboarding: OnboardingSummary,
): void {
  section("First Pulse", "I am configured enough to begin.");
  const theme = getTuiTheme(onboarding.theme);
  const summary = buildBootstrapPulseSummary({
    checkOnly: options.checkOnly,
    themeLabel: theme.label,
    onboarding,
    createdDirs,
    envMessages,
  });
  for (const line of summary.statusLines) {
    console.log(`  ${line}`);
  }
  for (const sectionDef of summary.sections) {
    console.log();
    console.log(paint(sectionDef.title, color.cyan + color.bold));
    for (const line of sectionDef.lines) {
      console.log(`  ${line}`);
    }
  }
}

const createdDirs: string[] = [];
for (const dir of directories) {
  const absolute = join(root, dir);
  const existed = existsSync(absolute);
  ensureDir(absolute);
  if (existed) {
    createdDirs.push(`${dir} (exists)`);
  } else if (options.checkOnly) {
    createdDirs.push(`${dir} (missing)`);
  } else {
    createdDirs.push(dir);
  }
}

const initialEnvMessages = ensureEnvFile({
  envPath,
  envExamplePath,
  checkOnly: options.checkOnly,
});
const dependencyProbes = getDependencyProbes(root, readEnvEntries(envPath));

if (options.checkOnly) {
  console.log(
    buildBootstrapCheckSummary({
      createdDirs,
      dependencyProbes,
      envMessages: initialEnvMessages,
    }),
  );
  process.exit(0);
}

const existingEnv = readEnvEntries(envPath);
const answers = await runWizard(existingEnv, wizardContext);
const { envMessages, onboarding } = await applyAnswers(
  answers,
  {
    envPath,
    settingsPath,
    gatewayPath,
    onboardingPath,
    nativeOnboardingPath,
  } satisfies BootstrapPersistencePaths,
  options,
);
printSummary(createdDirs, [...initialEnvMessages, ...envMessages], onboarding);
