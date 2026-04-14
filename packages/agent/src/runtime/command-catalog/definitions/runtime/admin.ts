import { runtimeCommand } from "./shared";

export const RuntimeAdminCommandCatalogEntries = [
  runtimeCommand(
    "/commands",
    "List available slash commands and built-in workflows.",
  ),
  runtimeCommand(
    "/commands search <query>",
    "Search the local slash-command catalog without waking the runtime.",
  ),
  runtimeCommand("/status", "Show the top-level agent runtime status summary."),
  runtimeCommand("/doctor", "Run the operator diagnostics checklist."),
  runtimeCommand(
    "/setup summary",
    "Show setup, provider, and native service readiness.",
  ),
  runtimeCommand(
    "/accounts",
    "Show managed Eliza Cloud status plus local Codex and Claude Code specialist provider readiness.",
  ),
  runtimeCommand(
    "/accounts refresh [elizacloud|codex|claude-code]",
    "Refresh managed-cloud or local specialist-provider state from the workspace and auth stores.",
  ),
  runtimeCommand(
    "/accounts connect <elizacloud|codex|claude-code>",
    "Activate Eliza Cloud managed mode or bind a local Codex/Claude Code specialist provider when auth is ready.",
  ),
  runtimeCommand(
    "/accounts doctor",
    "Show managed-cloud readiness, local specialist-provider readiness, and the exact next-step commands.",
  ),
  runtimeCommand(
    "/accounts login <elizacloud|codex|claude-code>",
    "Show the exact local CLI login command and the follow-up activation step for Cloud, Codex, or Claude Code.",
  ),
  runtimeCommand(
    "/accounts setup-token claude-code",
    "Show the Claude setup-token flow used to finish native Claude Code binding.",
  ),
  runtimeCommand(
    "/accounts use <elizacloud|codex|claude-code>",
    "Switch the active runtime provider to Eliza Cloud managed inference or a local Codex/Claude Code specialist provider.",
  ),
];
