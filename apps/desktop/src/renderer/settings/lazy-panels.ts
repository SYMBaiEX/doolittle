import { lazy } from "react";

export const settingsPanels = {
  interfaces: lazy(async () => {
    const module = await import("./SettingsInterfacePanel");
    return { default: module.SettingsInterfacePanel };
  }),
  model: lazy(async () => {
    const module = await import("../ModelsPage");
    return { default: module.ModelsPage };
  }),
  accounts: lazy(async () => {
    const module = await import("../ConnectionsPage");
    return { default: module.ConnectionsPage };
  }),
  credentials: lazy(async () => {
    const module = await import("../KeysPage");
    return { default: module.KeysPage };
  }),
  tools: lazy(async () => {
    const module = await import("../ToolsPage");
    return { default: module.ToolsPage };
  }),
  skills: lazy(async () => {
    const module = await import("../SkillsPage");
    return { default: module.SkillsPage };
  }),
  plugins: lazy(async () => {
    const module = await import("../PluginsPage");
    return { default: module.PluginsPage };
  }),
  memory: lazy(async () => {
    const module = await import("../MemoryPage");
    return { default: module.MemoryPage };
  }),
  profiles: lazy(async () => {
    const module = await import("../ProfilesPage");
    return { default: module.ProfilesPage };
  }),
  logs: lazy(async () => {
    const module = await import("../LogsPage");
    return { default: module.LogsPage };
  }),
  runtime: lazy(async () => {
    const module = await import("../RuntimePage");
    return { default: module.RuntimePage };
  }),
  compatibility: lazy(async () => {
    const module = await import("../CompatibilityPage");
    return { default: module.CompatibilityPage };
  }),
  registry: lazy(async () => {
    const module = await import("../RegistryPage");
    return { default: module.RegistryPage };
  }),
  setup: lazy(async () => {
    const module = await import("../SetupPage");
    return { default: module.SetupPage };
  }),
  about: lazy(async () => {
    const module = await import("../DocsPage");
    return { default: module.DocsPage };
  }),
};

export function isEmbeddedSettingsFeature(
  section: string,
): section is keyof typeof settingsPanels {
  return Object.hasOwn(settingsPanels, section);
}
