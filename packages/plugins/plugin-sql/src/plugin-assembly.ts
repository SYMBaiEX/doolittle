import type { Plugin } from "@elizaos/core";
import officialSqlPlugin from "@elizaos-official/plugin-sql";
import { patchDatabaseAdapter } from "./database-adapter";

const plugin: Plugin = {
  ...officialSqlPlugin,
  name: "@elizaos/plugin-sql",
  description:
    "Workspace-native SQL plugin aligned with Doolittle's core/runtime contract.",
  async init(config, runtime) {
    await officialSqlPlugin.init?.(config, runtime);
    patchDatabaseAdapter(runtime);
  },
};

export default plugin;
