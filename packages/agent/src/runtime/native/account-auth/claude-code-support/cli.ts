import type { CliAuthStatus } from "../types";
import {
  type ClaudeCodeAuthDependencies,
  getClaudeCodeAuthDependencies,
} from "./dependencies";

export function getClaudeCodeCliAuthStatus(
  homePath?: string,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): CliAuthStatus {
  if (!deps.commandExists("claude")) {
    return {
      available: false,
      loggedIn: false,
    };
  }

  const payload = deps.readCommandJson(
    "claude",
    ["auth", "status", "--json"],
    homePath,
  ) as
    | {
        loggedIn?: boolean;
        authMethod?: string;
        apiProvider?: string;
      }
    | undefined;
  if (!payload) {
    const text = deps.readCommandText(
      "claude",
      ["auth", "status", "--text"],
      homePath,
    );
    return {
      available: true,
      loggedIn: /logged in/i.test(text),
      source: "claude auth status",
      detail: text || "Claude Code auth status is available.",
    };
  }

  return {
    available: true,
    loggedIn: Boolean(payload.loggedIn),
    authMethod:
      typeof payload.authMethod === "string" ? payload.authMethod : undefined,
    source: "claude auth status --json",
    detail: payload.loggedIn
      ? `Claude Code CLI reports logged in via ${payload.authMethod ?? "unknown"} auth.`
      : "Claude Code CLI reports no active login.",
  };
}
