import {
  DEFAULT_TUI_THEME,
  listTuiThemes,
  type TuiThemeName,
} from "../../../packages/agent/src/runtime/theme-catalog";
import type { BootstrapWizardContext } from "../bootstrap-context";
import { ask, chooseOne } from "../core/prompt-ops";
import type { PromptHandle } from "../prompting/types";
import type { WizardMode } from "../types";

export interface WizardIdentitySelection {
  mode: WizardMode;
  agentName: string;
  timezone: string;
  theme: TuiThemeName;
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
  const timezone = await ask(
    context,
    rl,
    "What timezone should shape my days",
    existingEnv.get("DOOLITTLE_TIMEZONE") || "America/Chicago",
  );
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
