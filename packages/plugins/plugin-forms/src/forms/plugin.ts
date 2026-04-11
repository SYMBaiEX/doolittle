import { bindPluginStorage } from "@doolittle/contracts";
import type { Plugin } from "@elizaos/core";
import { createFormsService } from "./service";
import type { FormsPluginOptions } from "./types";

export function createFormsPlugin(options: FormsPluginOptions = {}): Plugin {
  const storage = bindPluginStorage("forms", options.storage);
  const FormsService = createFormsService(storage.rootDir);

  return {
    name: "@elizaos/plugin-forms",
    description:
      "Workspace-native forms plugin for structured operator and autocoder workflows.",
    services: [FormsService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}

const formsPlugin = createFormsPlugin();

export default formsPlugin;
