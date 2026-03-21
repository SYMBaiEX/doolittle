import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
} from "@elizaos/plugin-compat";

export interface ShellPluginOptions {
  terminal: {
    run(command: string): Promise<unknown>;
    getHistory(limit?: number): unknown[];
    status(): Promise<unknown>;
  };
}

export function createShellPlugin(options: ShellPluginOptions): Plugin {
  const ShellService = createServiceAdapter({
    serviceType: "shell",
    capabilityDescription:
      "Official-style shell plugin backed by Eliza Agent execution services.",
    create: async () => ({
      run(command: string) {
        return options.terminal.run(command);
      },
      history(limit = 20) {
        return options.terminal.getHistory(limit);
      },
      status() {
        return options.terminal.status();
      },
    }),
  });

  return createServicePlugin(
    "shell",
    "Official-style shell plugin aligned with Eliza Agent execution backends.",
    ShellService,
  );
}

export default createShellPlugin;
