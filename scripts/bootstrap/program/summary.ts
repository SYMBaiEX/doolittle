import { getTuiTheme } from "../../../packages/agent/src/runtime/theme-catalog";
import { bootstrapColor as color, paint } from "../core/output";
import { buildBootstrapPulseSummary } from "../summary";
import type { OnboardingSummary } from "../types";

export function printBootstrapSummary(options: {
  checkOnly: boolean;
  createdDirs: string[];
  envMessages: string[];
  onboarding: OnboardingSummary;
  section: (title: string, detail?: string) => void;
}): void {
  options.section("First Pulse", "I am configured enough to begin.");
  const theme = getTuiTheme(options.onboarding.theme);
  const summary = buildBootstrapPulseSummary({
    checkOnly: options.checkOnly,
    themeLabel: theme.label,
    onboarding: options.onboarding,
    createdDirs: options.createdDirs,
    envMessages: options.envMessages,
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
