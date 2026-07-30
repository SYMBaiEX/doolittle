import { type Plugin, validatePlugin } from "@elizaos/core";

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
