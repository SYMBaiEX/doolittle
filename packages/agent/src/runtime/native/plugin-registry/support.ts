import type { Plugin } from "@elizaos/core";

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

export function normalizePlugin(plugin: unknown): Plugin {
  return plugin as Plugin;
}
