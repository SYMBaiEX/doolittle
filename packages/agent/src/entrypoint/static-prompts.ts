import { buildHelpText } from "@/cli/help-text";
import { renderCommandCatalog } from "@/runtime/command-catalog";

export interface StaticResult {
  text: string;
  tone?: "info" | "success" | "warning" | "error" | "agent";
  shouldExit?: boolean;
}

export function formatTopLevelError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return String(error);
}

export function resolveStaticPrompt(
  prompt: string | undefined,
  agentName: string,
  workspaceDir: string,
): StaticResult | undefined {
  const trimmed = prompt?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === "/help") {
    return { text: buildHelpText(agentName) };
  }
  if (trimmed === "/commands") {
    return { text: renderCommandCatalog(undefined, 80, workspaceDir) };
  }
  if (
    trimmed === "/commands search" ||
    trimmed.startsWith("/commands search ")
  ) {
    const query = trimmed.replace("/commands search", "").trim();
    return {
      text: query
        ? renderCommandCatalog(query, 80, workspaceDir)
        : "Usage: /commands search <query>",
    };
  }

  if (trimmed === "exit" || trimmed === "quit") {
    return { text: "Closing Doolittle.", shouldExit: true };
  }

  return undefined;
}

export function isRecoverableTopLevelRuntimeError(error: unknown): boolean {
  const normalized = formatTopLevelError(error).toLowerCase();
  return [
    "cannot connect to api",
    "unable to connect",
    "failedtoopensocket",
    "connectionrefused",
    "rate limit",
    "unauthorized",
    "no output generated",
    "database is shutting down",
    "operation rejected",
    "pglite startup failed after automatic recovery",
  ].some((fragment) => normalized.includes(fragment));
}
