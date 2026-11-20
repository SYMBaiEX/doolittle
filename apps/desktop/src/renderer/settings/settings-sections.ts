import type { View } from "../desktop-navigation";

/** Canonical destinations rendered by the Settings shell. */
export type SettingsShellSection =
  | "appearance"
  | "interfaces"
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
  view: View;
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
      view: "settings",
      label: "Appearance",
      description: "Theme and display",
      group: "Appearance & desktop",
    },
    {
      id: "interfaces",
      view: "interfaces",
      label: "Interfaces",
      description: "Layouts, extension access and recovery",
      group: "Appearance & desktop",
    },
    {
      id: "desktop",
      view: "desktop",
      label: "Desktop",
      description: "Updates and lifecycle",
      group: "Appearance & desktop",
    },
    {
      id: "model",
      view: "models",
      label: "Models",
      description: "Models and inference",
      group: "Models & accounts",
    },
    {
      id: "accounts",
      view: "connections",
      label: "Providers & accounts",
      description: "Sign in and manage provider accounts",
      group: "Models & accounts",
    },
    {
      id: "credentials",
      view: "keys",
      label: "Credentials",
      description: "API keys and credentials",
      group: "Models & accounts",
    },
    {
      id: "tools",
      view: "tools",
      label: "Tools",
      description: "Installed tools",
      group: "Capabilities",
    },
    {
      id: "skills",
      view: "skills",
      label: "Skills",
      description: "Agent skills",
      group: "Capabilities",
    },
    {
      id: "plugins",
      view: "plugins",
      label: "Plugins",
      description: "Installed plugins",
      group: "Capabilities",
    },
    {
      id: "memory",
      view: "memory",
      label: "Memory",
      description: "Stored memory",
      group: "Personalization",
    },
    {
      id: "profiles",
      view: "profiles",
      label: "Profiles",
      description: "Agent profiles",
      group: "Personalization",
    },
    {
      id: "execution",
      view: "execution",
      label: "Execution",
      description: "Permissions and tools",
      group: "Runtime & diagnostics",
    },
    {
      id: "advanced",
      view: "advanced",
      label: "Advanced",
      description: "Every runtime field",
      group: "Runtime & diagnostics",
    },
    {
      id: "logs",
      view: "logs",
      label: "Logs",
      description: "Runtime logs",
      group: "Runtime & diagnostics",
    },
    {
      id: "runtime",
      view: "runtime",
      label: "Runtime",
      description: "Runtime status and autonomy",
      group: "Runtime & diagnostics",
    },
    {
      id: "compatibility",
      view: "compatibility",
      label: "Compatibility",
      description: "Compatibility diagnostics",
      group: "Runtime & diagnostics",
    },
    {
      id: "registry",
      view: "registry",
      label: "Registry",
      description: "Registry and package sources",
      group: "Setup & support",
    },
    {
      id: "setup",
      view: "operatorSetup",
      label: "Setup",
      description: "Operator setup",
      group: "Setup & support",
    },
    {
      id: "about",
      view: "docs",
      label: "About",
      description: "Docs and support",
      group: "Setup & support",
    },
  ];

export type SettingsCategoryId =
  | "general"
  | "intelligence"
  | "capabilities"
  | "personalization"
  | "execution"
  | "system"
  | "help";

export interface SettingsCategoryDefinition {
  id: SettingsCategoryId;
  label: string;
  description: string;
  sections: readonly SettingsShellSection[];
  defaultSection: SettingsShellSection;
}

/** Presentation categories never replace persisted subsection identities. */
export const SETTINGS_CATEGORIES = [
  {
    id: "general",
    label: "General",
    description: "Appearance, interface and desktop behavior",
    sections: ["appearance", "desktop", "interfaces"],
    defaultSection: "appearance",
  },
  {
    id: "intelligence",
    label: "Models & accounts",
    description: "Model routing, provider accounts and API keys",
    sections: ["model", "accounts", "credentials"],
    defaultSection: "model",
  },
  {
    id: "capabilities",
    label: "Tools & extensions",
    description: "Tools, skills, plugins and package sources",
    sections: ["tools", "skills", "plugins", "registry"],
    defaultSection: "tools",
  },
  {
    id: "personalization",
    label: "Memory & identity",
    description: "Stored knowledge and agent profiles",
    sections: ["memory", "profiles"],
    defaultSection: "memory",
  },
  {
    id: "execution",
    label: "Execution",
    description: "Permissions and execution environments",
    sections: ["execution"],
    defaultSection: "execution",
  },
  {
    id: "system",
    label: "System",
    description: "Runtime status, logs and advanced configuration",
    sections: ["runtime", "logs", "compatibility", "advanced"],
    defaultSection: "runtime",
  },
  {
    id: "help",
    label: "Help",
    description: "Setup, documentation and support",
    sections: ["setup", "about"],
    defaultSection: "setup",
  },
] as const satisfies readonly SettingsCategoryDefinition[];

export function settingsCategoryForSection(
  section: string,
): SettingsCategoryDefinition {
  return (
    SETTINGS_CATEGORIES.find((category: SettingsCategoryDefinition) =>
      category.sections.includes(section as SettingsShellSection),
    ) ?? SETTINGS_CATEGORIES[0]
  );
}

/** Desktop is merged into Preferences; its saved deep link still works. */
export function settingsTabsForCategory(category: SettingsCategoryDefinition) {
  return category.sections
    .filter((section) => section !== "desktop")
    .map((section) => ({
      id: section,
      label:
        section === "appearance"
          ? "Preferences"
          : (SETTINGS_SHELL_SECTIONS.find((entry) => entry.id === section)
              ?.label ?? section),
    }));
}

export function settingsSectionForView(
  view: View,
): SettingsShellSection | undefined {
  return SETTINGS_SHELL_SECTIONS.find((section) => section.view === view)?.id;
}

export function settingsViewForSection(id: string): View {
  return (
    SETTINGS_SHELL_SECTIONS.find((section) => section.id === id)?.view ??
    "settings"
  );
}
