import { buildHelpText } from "@/cli/help-text";
import {
  normalizeSlashCommandSyntax,
  renderCommandCatalog,
} from "@/runtime/command-catalog";
import type { CliExecutionResult } from "./types";

export function resolveStaticCliInput(
  line: string,
  agentName: string,
  workspaceDir?: string,
): CliExecutionResult | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return { text: "", tone: "info" };
  }
  const normalizedTrimmed = normalizeSlashCommandSyntax(trimmed);
  if (trimmed === "exit" || trimmed === "quit") {
    return {
      text: `Closing ${agentName}.`,
      tone: "success",
      shouldExit: true,
    };
  }
  if (normalizedTrimmed === "/help") {
    return { text: buildHelpText(agentName), tone: "info" };
  }
  if (normalizedTrimmed === "/commands") {
    return {
      text: renderCommandCatalog(undefined, 80, workspaceDir),
      tone: "info",
    };
  }
  if (normalizedTrimmed.startsWith("/commands search ")) {
    const query = normalizedTrimmed.replace("/commands search ", "").trim();
    return {
      text: query
        ? renderCommandCatalog(query, 80, workspaceDir)
        : "Usage: /commands search <query>",
      tone: "info",
    };
  }
  return undefined;
}
