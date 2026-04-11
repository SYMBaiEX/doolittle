import type { Plugin } from "@elizaos/core";

import { E2BService } from "./service";

export const e2bPlugin: Plugin = {
  name: "@elizaos/plugin-e2b",
  description:
    "Workspace-native E2B sandbox plugin for local autocoder-compatible execution.",
  services: [E2BService],
  providers: [],
  actions: [],
};

export default e2bPlugin;
