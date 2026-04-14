import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleRegistryRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed === "/runtime compatibility") {
      return JSON.stringify(
        await context.services.agentSdk.compatibility(),
        null,
        2,
      );
    }

    if (trimmed === "/runtime registry") {
      return JSON.stringify(
        await context.services.agentSdk.registry(),
        null,
        2,
      );
    }

    if (trimmed === "/runtime registry refresh") {
      return JSON.stringify(
        await context.services.agentSdk.registry(true),
        null,
        2,
      );
    }

    if (trimmed.startsWith("/runtime registry search ")) {
      const query = trimmed.replace("/runtime registry search ", "").trim();
      if (!query) {
        return "Usage: /runtime registry search <query>";
      }

      return JSON.stringify(
        await context.services.agentSdk.searchRegistry(query),
        null,
        2,
      );
    }

    return undefined;
  };
