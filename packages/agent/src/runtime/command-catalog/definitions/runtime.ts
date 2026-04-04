import type { CommandCatalogEntry } from "../types";

export const RuntimeCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/commands",
    category: "runtime",
    description: "List available slash commands and built-in workflows.",
  },
  {
    command: "/commands search <query>",
    category: "runtime",
    description:
      "Search the local slash-command catalog without waking the runtime.",
  },
  {
    command: "/status",
    category: "runtime",
    description: "Show the top-level agent runtime status summary.",
  },
  {
    command: "/doctor",
    category: "runtime",
    description: "Run the operator diagnostics checklist.",
  },
  {
    command: "/setup summary",
    category: "runtime",
    description: "Show setup, provider, and native service readiness.",
  },
  {
    command: "/runtime status",
    category: "runtime",
    description: "Print the active provider, model, and plugin state.",
  },
  {
    command: "/mode",
    category: "runtime",
    description:
      "Show the active run depth profile and configured max-iteration cap.",
  },
  {
    command: "/mode set <quick|standard|deep|explore>",
    category: "runtime",
    description:
      "Switch the agent autonomy profile and update the effective max-iteration cap.",
  },
  {
    command: "/progress",
    category: "runtime",
    description:
      "Show the active tool-progress mode used by the TUI, CLI, and gateway surfaces.",
  },
  {
    command: "/progress set <off|new|all|verbose>",
    category: "runtime",
    description:
      "Set how much observed tool activity should be streamed while the agent works.",
  },
  {
    command: "/runtime plugins",
    category: "runtime",
    description: "List native ElizaOS plugin inventory and source.",
  },
  {
    command: "/runtime services",
    category: "runtime",
    description: "Show native-vs-product service resolution across the stack.",
  },
  {
    command: "/runtime ownership",
    category: "runtime",
    description:
      "Show the full native ownership snapshot, including integration, autonomous alignment, and skill hub state.",
  },
  {
    command: "/runtime transports",
    category: "runtime",
    description:
      "Show native messaging plugin, service, and live control-plane state.",
  },
  {
    command: "/transport inventory",
    category: "runtime",
    description: "Show the shared canonical transport inventory.",
  },
  {
    command: "/transport show <platform>",
    category: "runtime",
    description: "Inspect one transport in detail.",
  },
  {
    command: "/transport status",
    category: "runtime",
    description: "Show the shared transport status summary.",
  },
  {
    command: "/transport mismatches",
    category: "runtime",
    description: "Show transport mediation and readiness mismatches.",
  },
  {
    command: "/runtime ecosystem",
    category: "runtime",
    description: "Show alpha-channel package alignment and native audit data.",
  },
  {
    command: "/accounts",
    category: "runtime",
    description:
      "Show managed Eliza Cloud status plus local Codex and Claude Code specialist provider readiness.",
  },
  {
    command: "/accounts refresh [elizacloud|codex|claude-code]",
    category: "runtime",
    description:
      "Refresh managed-cloud or local specialist-provider state from the workspace and auth stores.",
  },
  {
    command: "/accounts connect <elizacloud|codex|claude-code>",
    category: "runtime",
    description:
      "Activate Eliza Cloud managed mode or bind a local Codex/Claude Code specialist provider when auth is ready.",
  },
  {
    command: "/accounts doctor",
    category: "runtime",
    description:
      "Show managed-cloud readiness, local specialist-provider readiness, and the exact next-step commands.",
  },
  {
    command: "/accounts login <elizacloud|codex|claude-code>",
    category: "runtime",
    description:
      "Show the exact local CLI login command and the follow-up activation step for Cloud, Codex, or Claude Code.",
  },
  {
    command: "/accounts setup-token claude-code",
    category: "runtime",
    description:
      "Show the Claude setup-token flow used to finish native Claude Code binding.",
  },
  {
    command: "/accounts use <elizacloud|codex|claude-code>",
    category: "runtime",
    description:
      "Switch the active runtime provider to Eliza Cloud managed inference or a local Codex/Claude Code specialist provider.",
  },
  {
    command: "/theme",
    category: "runtime",
    description: "Show the active operator theme and available theme controls.",
  },
  {
    command: "/theme list",
    category: "runtime",
    description: "List all built-in operator cockpit themes.",
  },
  {
    command: "/theme next",
    category: "runtime",
    description: "Cycle to the next built-in operator cockpit theme.",
  },
  {
    command: "/theme prev",
    category: "runtime",
    description: "Cycle to the previous built-in operator cockpit theme.",
  },
  {
    command: "/theme set <name>",
    category: "runtime",
    description:
      "Set the active operator theme and persist it in runtime settings.",
  },
  {
    command: "/ecosystem",
    category: "runtime",
    description:
      "Show Doolittle benchmark packs, skill channels, and modeling profiles.",
  },
  {
    command: "/insights",
    category: "runtime",
    description:
      "Show a high-level ownership, ecosystem, and operator insight snapshot.",
  },
  {
    command: "/runtime autonomous",
    category: "runtime",
    description:
      "Show how much of the agent, skills, orchestration, and trajectory stack is running through native Eliza services.",
  },
  {
    command: "/runtime media",
    category: "runtime",
    description:
      "Show native media ownership, including official TTS plugin readiness.",
  },
  {
    command: "/runtime forms",
    category: "runtime",
    description:
      "Show native forms ownership, template counts, and persistence state.",
  },
  {
    command: "/runtime planning",
    category: "runtime",
    description:
      "Show native planning ownership, linked task/workflow counts, and execution readiness.",
  },
  {
    command: "/forms list",
    category: "runtime",
    description: "List native forms and their current status.",
  },
  {
    command: "/forms templates",
    category: "runtime",
    description: "List native form templates available from the forms service.",
  },
  {
    command: "/forms create <template-id> :: <json-metadata>",
    category: "runtime",
    description: "Create a native form from a template with optional metadata.",
  },
  {
    command: "/forms show <form-id>",
    category: "runtime",
    description: "Inspect one native form in detail.",
  },
  {
    command: "/forms cancel <form-id>",
    category: "runtime",
    description: "Cancel one native form.",
  },
  {
    command: "/plans list",
    category: "runtime",
    description:
      "List native execution plans and their linked task/workflow state.",
  },
  {
    command: "/plans create <title> :: <objective> [:: <json-metadata>]",
    category: "runtime",
    description: "Create a native execution plan with optional metadata.",
  },
  {
    command: "/plans show <plan-id>",
    category: "runtime",
    description: "Inspect one native execution plan.",
  },
  {
    command: "/runtime e2b",
    category: "runtime",
    description:
      "Show native E2B sandbox ownership, active sandboxes, and execution readiness.",
  },
  {
    command: "/e2b list",
    category: "runtime",
    description: "List native E2B sandboxes.",
  },
];
