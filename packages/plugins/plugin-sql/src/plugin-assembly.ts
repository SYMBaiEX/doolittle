import type { Plugin } from "@elizaos/core";
import officialSqlPlugin from "@elizaos/plugin-sql";
import { patchDatabaseAdapter } from "./database-adapter";

const plugin: Plugin = {
  ...officialSqlPlugin,
  name: "@elizaos/plugin-sql",
  description:
    "Official Eliza SQL plugin with Doolittle relationship merge semantics.",
  async init(config, runtime) {
    await officialSqlPlugin.init?.(config, runtime);
    patchDatabaseAdapter(runtime);
  },
};

export default plugin;
