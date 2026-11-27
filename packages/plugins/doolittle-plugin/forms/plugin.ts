import type { Plugin } from "@elizaos/core";
import { createFormsService } from "./service";
import type { FormsPluginOptions } from "./types";

export function createFormsPlugin(options: FormsPluginOptions): Plugin {
  const FormsService = createFormsService(options.storage.rootDir);

  return {
    name: "@doolittle/plugin-forms",
    description:
      "Doolittle forms adapter for structured operator and autocoder workflows.",
    services: [FormsService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}
