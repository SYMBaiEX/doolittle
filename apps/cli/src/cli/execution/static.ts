import { renderCommandCatalog } from "@doolittle/agent/runtime/command-catalog";
import { buildHelpText } from "../help-text";
import type { CliExecutionResult } from "./types";

/** Static built-ins shared by pre-boot and interactive prompt dispatch. */
export function resolveStaticCliInput(
  input: string,
  options: {
    agentName: string;
    workspaceDir?: string;
    sessionOpen?: boolean;
  },
): CliExecutionResult | undefined {
  const { agentName, workspaceDir, sessionOpen } = options;
  if (!input) {
    return sessionOpen ? { text: "", tone: "info" } : undefined;
  }
  if (input === "exit" || input === "quit") {
    return {
      text: `Closing ${sessionOpen ? agentName : "Doolittle"}.`,
      tone: sessionOpen ? "success" : "info",
      shouldExit: true,
    };
  }
  if (input === "/help") {
    return { text: buildHelpText(agentName), tone: "info" };
  }
  if (input === "/commands") {
    return {
      text: renderCommandCatalog(undefined, 80, workspaceDir),
      tone: "info",
    };
  }
  if (input === "/commands search" || input.startsWith("/commands search ")) {
    const query = input.slice("/commands search".length).trim();
    return {
      text: query
        ? renderCommandCatalog(query, 80, workspaceDir)
        : "Usage: /commands search <query>",
      tone: "info",
    };
  }
  return undefined;
}
