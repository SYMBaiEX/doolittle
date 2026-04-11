import type { Plugin } from "@elizaos/core";
import { createCodingAgentServiceClass } from "./service";
import type { CodingAgentPluginOptions } from "./types";

export function createCodingAgentPlugin(
  options: CodingAgentPluginOptions,
): Plugin {
  const CodingAgentService = createCodingAgentServiceClass(options);

  return {
    name: "coding-agent",
    description:
      "Coding agent plugin layered onto Doolittle developer workflows.",
    services: [CodingAgentService],
  };
}

export default createCodingAgentPlugin;
