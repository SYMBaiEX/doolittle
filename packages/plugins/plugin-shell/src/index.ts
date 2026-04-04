import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import type { TerminalServiceLike } from "./types";

export interface ShellPluginOptions {
  terminal: Pick<TerminalServiceLike, "run" | "getHistory" | "status">;
}

export function createShellPlugin(options: ShellPluginOptions): Plugin {
  class ShellService extends ElizaService {
    static serviceType = "shell";
    capabilityDescription =
      "Official-style shell plugin backed by Doolittle execution services.";

    static async start(runtime: IAgentRuntime): Promise<ElizaService> {
      return new ShellService(runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    run(command: string) {
      return options.terminal.run(command);
    }

    history(limit = 20) {
      return options.terminal.getHistory(limit);
    }

    status() {
      return options.terminal.status();
    }
  }

  return {
    name: "shell",
    description:
      "Official-style shell plugin aligned with Doolittle execution backends.",
    services: [ShellService],
  };
}

export default createShellPlugin;
