import type { View } from "../desktop-navigation";

/** Canonical destinations rendered by the Settings shell. */
export type SettingsShellSection =
  | "appearance"
  | "desktop"
  | "execution"
  | "advanced"
  | "model"
  | "accounts"
  | "credentials"
  | "tools"
  | "skills"
  | "plugins"
  | "memory"
  | "profiles"
  | "logs"
  | "runtime"
  | "compatibility"
  | "registry"
  | "setup"
  | "about";

export interface SettingsShellSectionDefinition {
  id: SettingsShellSection;
  label: string;
  description: string;
  group:
    | "Appearance & desktop"
    | "Models & accounts"
    | "Capabilities"
    | "Personalization"
    | "Runtime & diagnostics"
    | "Setup & support";
}

/**
 * Static sections intentionally exist before the runtime settings document
 * loads. This keeps legacy deep links navigable and gives the navigation rail
 * stable, searchable labels.
 */
export const SETTINGS_SHELL_SECTIONS: readonly SettingsShellSectionDefinition[] =
  [
    {
      id: "appearance",
      label: "Appearance",
      description: "Theme and display",
      group: "Appearance & desktop",
    },
    {
      id: "desktop",
      label: "Desktop",
      description: "Updates and lifecycle",
      group: "Appearance & desktop",
    },
    {
      id: "model",
      label: "Models",
      description: "Models and inference",
      group: "Models & accounts",
    },
    {
      id: "accounts",
      label: "Providers & accounts",
      description: "Sign in and manage provider accounts",
      group: "Models & accounts",
    },
    {
      id: "credentials",
      label: "Credentials",
      description: "API keys and credentials",
      group: "Models & accounts",
    },
    {
      id: "tools",
      label: "Tools",
      description: "Installed tools",
      group: "Capabilities",
    },
    {
      id: "skills",
      label: "Skills",
      description: "Agent skills",
      group: "Capabilities",
    },
    {
      id: "plugins",
      label: "Plugins",
      description: "Installed plugins",
      group: "Capabilities",
    },
    {
      id: "memory",
      label: "Memory",
      description: "Stored memory",
      group: "Personalization",
    },
    {
      id: "profiles",
      label: "Profiles",
      description: "Agent profiles",
      group: "Personalization",
    },
    {
      id: "execution",
      label: "Execution",
      description: "Permissions and tools",
      group: "Runtime & diagnostics",
    },
    {
      id: "advanced",
      label: "Advanced",
      description: "Every runtime field",
      group: "Runtime & diagnostics",
    },
    {
      id: "logs",
      label: "Logs",
      description: "Runtime logs",
      group: "Runtime & diagnostics",
    },
    {
      id: "runtime",
      label: "Runtime",
      description: "Runtime status and autonomy",
      group: "Runtime & diagnostics",
    },
    {
      id: "compatibility",
      label: "Compatibility",
      description: "Compatibility diagnostics",
      group: "Runtime & diagnostics",
    },
    {
      id: "registry",
      label: "Registry",
      description: "Registry and package sources",
      group: "Setup & support",
    },
    {
      id: "setup",
      label: "Setup",
      description: "Operator setup",
      group: "Setup & support",
    },
    {
      id: "about",
      label: "About",
      description: "Docs and support",
      group: "Setup & support",
    },
  ];

const EMBEDDED_FEATURE_SECTIONS = new Set<SettingsShellSection>([
  "model",
  "accounts",
  "credentials",
  "tools",
  "skills",
  "plugins",
  "memory",
  "profiles",
  "logs",
  "runtime",
  "compatibility",
  "registry",
  "setup",
  "about",
]);

export function isEmbeddedSettingsFeature(section: string): boolean {
  return EMBEDDED_FEATURE_SECTIONS.has(section as SettingsShellSection);
}

export function settingsSectionForView(
  view: View,
): SettingsShellSection | undefined {
  switch (view) {
    case "settings":
      return "appearance";
    case "models":
      return "model";
    case "connections":
      return "accounts";
    case "keys":
      return "credentials";
    case "tools":
      return "tools";
    case "skills":
      return "skills";
    case "plugins":
      return "plugins";
    case "memory":
      return "memory";
    case "profiles":
      return "profiles";
    case "logs":
      return "logs";
    case "runtime":
      return "runtime";
    case "compatibility":
      return "compatibility";
    case "registry":
      return "registry";
    case "operatorSetup":
      return "setup";
    case "docs":
      return "about";
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
    case "credentials":
      return "keys";
    case "tools":
      return "tools";
    case "skills":
      return "skills";
    case "plugins":
      return "plugins";
    case "memory":
      return "memory";
    case "profiles":
      return "profiles";
    case "logs":
      return "logs";
    case "runtime":
      return "runtime";
    case "compatibility":
      return "compatibility";
    case "registry":
      return "registry";
    case "setup":
      return "operatorSetup";
    case "about":
      return "docs";
    default:
      return "settings";
  }
}
