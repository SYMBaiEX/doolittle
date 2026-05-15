import {
  normalizePluginName,
  type Plugin,
  validatePlugin,
} from "@elizaos/core";

export function shouldIncludeDirectProviderPlugin(
  selectedProvider: string,
  directProvider: "openai" | "anthropic",
): boolean {
  if (
    selectedProvider === "elizacloud" ||
    selectedProvider === "codex" ||
    selectedProvider === "claude-code"
  ) {
    return false;
  }

  if (selectedProvider === "openai") {
    return directProvider === "openai";
  }

  if (selectedProvider === "anthropic") {
    return directProvider === "anthropic";
  }

  return true;
}

export function normalizePlugin(
  plugin: unknown,
  source = "ElizaOS plugin",
): Plugin {
  const validation = validatePlugin(plugin);
  if (!validation.isValid) {
    throw new Error(
      `${source} has an invalid ElizaOS plugin shape: ${validation.errors.join("; ")}`,
    );
  }

  return plugin as Plugin;
}

export function deduplicateNativePluginActions(plugins: Plugin[]): Plugin[] {
  const seen = new Set<string>();
  for (const plugin of plugins) {
    if (!plugin.actions) {
      continue;
    }

    const pluginName = normalizePluginName(plugin.name);
    plugin.actions = plugin.actions.filter((action) => {
      const actionKey = normalizePluginName(action.name);
      if (seen.has(actionKey)) {
        return false;
      }
      seen.add(actionKey);
      return Boolean(pluginName);
    });
  }
  return plugins;
}
