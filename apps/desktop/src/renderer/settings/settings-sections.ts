import type { View } from "../desktop-navigation";

/** Sections with a canonical Settings-shell route in the first migration slice. */
export type SettingsShellSection =
  | "appearance"
  | "desktop"
  | "execution"
  | "advanced"
  | "model"
  | "accounts";

export function settingsSectionForView(
  view: View,
): SettingsShellSection | undefined {
  switch (view) {
    case "models":
      return "model";
    case "connections":
      return "accounts";
    default:
      return undefined;
  }
}

export function settingsViewForSection(section: string): View {
  switch (section) {
    case "model":
      return "models";
    case "accounts":
      return "connections";
    default:
      return "settings";
  }
}
