import type { Plugin } from "@elizaos/core";

import { LocalSandboxService } from "./service";

export const localSandboxPlugin: Plugin = {
  name: "@doolittle/plugin-local-sandbox",
  description:
    "Doolittle local sandbox adapter for autocoder-compatible execution.",
  services: [LocalSandboxService],
  providers: [],
  actions: [],
};

export default localSandboxPlugin;
