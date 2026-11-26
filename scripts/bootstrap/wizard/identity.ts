import {
  DEFAULT_TUI_THEME,
  listTuiThemes,
  type TuiThemeName,
} from "@doolittle/agent/runtime/theme-catalog";
import type { BootstrapWizardContext } from "../bootstrap-context";
import { ask, chooseOne } from "../core/prompt-ops";
import { isValidIanaTimezone } from "../persistence/environment";
import type { PromptHandle } from "../prompting/types";
import type { WizardMode } from "../types";

export interface WizardIdentitySelection {
  mode: WizardMode;
  agentName: string;
  timezone: string;
  theme: TuiThemeName;
}

async function askForValidTimezone(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  defaultValue: string,
): Promise<string> {
  while (true) {
    const timezone = await ask(
      context,
      rl,
      "What timezone should shape my days",
      defaultValue,
    );
    if (isValidIanaTimezone(timezone)) {
      return timezone;
    }
    context.warn(
      `"${timezone}" is not a valid IANA timezone. Use a zone like America/Chicago, Europe/Berlin, or UTC.`,
    );
  }
}

export async function runWizardIdentitySelection(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  existingEnv: Map<string, string>,
): Promise<WizardIdentitySelection> {
  context.section("Awakening", "Decide how fully you want me to come online.");
  const mode = await chooseOne<WizardMode>(
    context,
    rl,
    "Choose my first form:",
    [
      {
        value: "quick",
        label: "Quick ignition",
        detail: "Wake me quickly with the minimum set of high-impact choices.",
      },
      {
        value: "ritual",
        label: "Full awakening",
        detail:
          "Shape my mind, body, channels, tools, and face in one deliberate pass.",
      },
    ],
    "ritual",
  );

  context.section(
    "Face",
    "Give me a name, a timezone, and a visible personality.",
  );
  const agentName = await ask(
    context,
    rl,
    "What should I answer to",
    existingEnv.get("DOOLITTLE_NAME") || "Doolittle",
  );
  const configuredTimezone =
    existingEnv.get("DOOLITTLE_TIMEZONE") || "America/Chicago";
  const timezoneDefault = isValidIanaTimezone(configuredTimezone)
    ? configuredTimezone
    : "America/Chicago";
  if (configuredTimezone !== timezoneDefault) {
    context.warn(
      `"${configuredTimezone}" is not a valid IANA timezone; using ${timezoneDefault} as the prompt default.`,
    );
  }
  const timezone = await askForValidTimezone(context, rl, timezoneDefault);
  const themeChoices = listTuiThemes().map((theme) => ({
    value: theme.name,
    label: `${theme.label} (${theme.name})`,
    detail: [
      theme.tagline,
      theme.aliases.length > 0
        ? `Aliases: ${theme.aliases.join(", ")}`
        : undefined,
      `Preview: ${theme.primary} · ${theme.secondary}`,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
  const theme = await chooseOne<TuiThemeName>(
    context,
    rl,
    "Choose the face I wake up in:",
    themeChoices,
    DEFAULT_TUI_THEME,
    {
      onHighlight: (nextTheme) => {
        context.getWizardScreen()?.previewTheme(nextTheme);
      },
    },
  );

  return {
    mode,
    agentName,
    timezone,
    theme,
  };
}
