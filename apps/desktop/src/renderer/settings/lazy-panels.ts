import { lazy } from "react";

export const LazyModelsPage = lazy(async () => {
  const module = await import("../ModelsPage");
  return { default: module.ModelsPage };
});

export const LazyConnectionsPage = lazy(async () => {
  const module = await import("../ConnectionsPage");
  return { default: module.ConnectionsPage };
});

export const LazyKeysPage = lazy(async () => {
  const module = await import("../KeysPage");
  return { default: module.KeysPage };
});

export const LazyToolsPage = lazy(async () => {
  const module = await import("../ToolsPage");
  return { default: module.ToolsPage };
});

export const LazySkillsPage = lazy(async () => {
  const module = await import("../SkillsPage");
  return { default: module.SkillsPage };
});

export const LazyPluginsPage = lazy(async () => {
  const module = await import("../PluginsPage");
  return { default: module.PluginsPage };
});

export const LazyMemoryPage = lazy(async () => {
  const module = await import("../MemoryPage");
  return { default: module.MemoryPage };
});

export const LazyProfilesPage = lazy(async () => {
  const module = await import("../ProfilesPage");
  return { default: module.ProfilesPage };
});

export const LazyLogsPage = lazy(async () => {
  const module = await import("../LogsPage");
  return { default: module.LogsPage };
});

export const LazyRuntimePage = lazy(async () => {
  const module = await import("../RuntimePage");
  return { default: module.RuntimePage };
});

export const LazyCompatibilityPage = lazy(async () => {
  const module = await import("../CompatibilityPage");
  return { default: module.CompatibilityPage };
});

export const LazyRegistryPage = lazy(async () => {
  const module = await import("../RegistryPage");
  return { default: module.RegistryPage };
});

export const LazySetupPage = lazy(async () => {
  const module = await import("../SetupPage");
  return { default: module.SetupPage };
});

export const LazyDocsPage = lazy(async () => {
  const module = await import("../DocsPage");
  return { default: module.DocsPage };
});
