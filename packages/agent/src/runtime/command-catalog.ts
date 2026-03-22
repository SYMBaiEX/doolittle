export interface CommandCatalogEntry {
  command: string;
  category:
    | "runtime"
    | "gateway"
    | "memory"
    | "skills"
    | "browser"
    | "media"
    | "execution"
    | "delegation"
    | "research"
    | "workspace";
  description: string;
}

export const COMMAND_CATALOG: CommandCatalogEntry[] = [
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
    command: "/ecosystem",
    category: "runtime",
    description:
      "Show Eliza Agent benchmark packs, skill channels, and modeling profiles.",
  },
  {
    command: "/benchmarks packs",
    category: "research",
    description: "List workspace-native benchmark packs.",
  },
  {
    command: "/skills channels",
    category: "skills",
    description: "List workspace-native skill distribution channels.",
  },
  {
    command: "/skills optional",
    category: "skills",
    description:
      "List optional Eliza-native skill packs curated for this repo.",
  },
  {
    command: "/modeling profiles",
    category: "memory",
    description: "List workspace-native user and assistant modeling profiles.",
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
  {
    command: "/e2b create <template>",
    category: "runtime",
    description: "Create a native E2B sandbox.",
  },
  {
    command: "/e2b exec <language> :: <code>",
    category: "runtime",
    description: "Execute code in the active native E2B sandbox.",
  },
  {
    command: "/e2b kill <sandbox-id>",
    category: "runtime",
    description:
      "Kill one native E2B sandbox, or the active sandbox by default.",
  },
  {
    command: "/runtime codegen",
    category: "runtime",
    description:
      "Show native code generation, GitHub, secrets, and sandbox ownership.",
  },
  {
    command: "/codegen generate <project-name> :: <prompt>",
    category: "runtime",
    description: "Invoke the native code generation service directly.",
  },
  {
    command:
      "/codegen research <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>",
    category: "runtime",
    description: "Run native autocoder research for a project request.",
  },
  {
    command:
      "/codegen prd <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>",
    category: "runtime",
    description: "Run native autocoder research and generate a PRD.",
  },
  {
    command: "/codegen qa <project-path>",
    category: "runtime",
    description: "Run native autocoder QA against a generated project path.",
  },
  {
    command: "/codegen runs",
    category: "runtime",
    description: "List persisted native autocoder pipeline runs.",
  },
  {
    command: "/retry <delegation-task-id>",
    category: "delegation",
    description: "Alias for /delegate retry <delegation-task-id>.",
  },
  {
    command: "/compress [manifest-path|bundle-label|latest]",
    category: "research",
    description:
      "Alias for trajectory compression of the latest or named bundle.",
  },
  {
    command: "/codegen workflows",
    category: "runtime",
    description: "List persisted native autocoder workflow graphs.",
  },
  {
    command: "/codegen show <run-id>",
    category: "runtime",
    description: "Inspect one persisted native autocoder pipeline run.",
  },
  {
    command: "/codegen workflow <workflow-id>",
    category: "runtime",
    description: "Inspect one native autocoder workflow graph and its runs.",
  },
  {
    command: "/codegen bundle <workflow-id>",
    category: "runtime",
    description: "Export one native autocoder workflow bundle manifest.",
  },
  {
    command: "/github create <repo-name> [| private:false]",
    category: "runtime",
    description: "Create a native autocoder-backed GitHub repository.",
  },
  {
    command: "/github delete <repo-name>",
    category: "runtime",
    description: "Delete a native autocoder-backed GitHub repository.",
  },
  {
    command: "/secrets list",
    category: "runtime",
    description: "List native secrets-manager keys.",
  },
  {
    command: "/secrets get <key>",
    category: "runtime",
    description: "Read one native secret value.",
  },
  {
    command: "/secrets set <key> :: <value>",
    category: "runtime",
    description: "Store one native secret value.",
  },
  {
    command: "/runtime research",
    category: "runtime",
    description:
      "Show native research ownership, including action-bench and autocoder readiness.",
  },
  {
    command: "/runtime ecosystem refresh",
    category: "runtime",
    description: "Refresh the ElizaOS agent SDK ecosystem audit and cache.",
  },
  {
    command: "/runtime registry",
    category: "runtime",
    description: "Show the ElizaOS registry snapshot and configured endpoints.",
  },
  {
    command: "/runtime compatibility",
    category: "runtime",
    description:
      "Show plugin-to-core compatibility results from the Eliza agent SDK.",
  },
  {
    command: "/runtime registry refresh",
    category: "runtime",
    description: "Refresh the ElizaOS registry snapshot from the agent SDK.",
  },
  {
    command: "/runtime registry search <query>",
    category: "runtime",
    description: "Search the ElizaOS registry snapshot for plugins.",
  },
  {
    command: "/sessions list",
    category: "runtime",
    description: "List recent titled and active sessions.",
  },
  {
    command: "/resume <title>",
    category: "runtime",
    description: "Switch the active operator session by title.",
  },
  {
    command: "/tools summary",
    category: "runtime",
    description: "Summarize enabled tools and native plugin inventory.",
  },
  {
    command: "/acp status",
    category: "runtime",
    description: "Show ACP bridge status, command wiring, and registry paths.",
  },
  {
    command: "/acp package",
    category: "runtime",
    description: "Show ACP package metadata for editor and registry packaging.",
  },
  {
    command: "/acp editor",
    category: "runtime",
    description:
      "Show ACP editor install, export, and import integration details.",
  },
  {
    command: "/acp install",
    category: "runtime",
    description:
      "Show ACP editor installation instructions and registry integration details.",
  },
  {
    command: "/acp sessions",
    category: "runtime",
    description:
      "Summarize recent ACP-visible sessions and titled session state.",
  },
  {
    command: "/acp registry",
    category: "runtime",
    description: "Show the ACP registry manifest metadata for Eliza Agent.",
  },
  {
    command: "/acp publish",
    category: "runtime",
    description:
      "Write the ACP registry manifest to disk for editor discovery.",
  },
  {
    command: "/acp export [label]",
    category: "runtime",
    description:
      "Export ACP package, registry, session, and tool metadata into a bundle.",
  },
  {
    command: "/acp import <path-or-json>",
    category: "runtime",
    description:
      "Import an ACP bundle from disk or a raw JSON payload into the local ACP store.",
  },
  {
    command: "/acp tools",
    category: "runtime",
    description: "List ACP tool definitions with kind and source metadata.",
  },
  {
    command: "/acp search <query>",
    category: "runtime",
    description:
      "Search ACP-exposed tools by name, kind, source, or description.",
  },
  {
    command: "/acp describe <tool-name>",
    category: "runtime",
    description: "Describe one ACP-exposed tool in editor-facing detail.",
  },
  {
    command: "/acp probe",
    category: "runtime",
    description: "Run the configured ACP server command health probe.",
  },
  {
    command: "/acp invoke <args>",
    category: "runtime",
    description: "Invoke the ACP server command directly with raw arguments.",
  },
  {
    command: "/acp call <tool-name> :: <json>",
    category: "runtime",
    description: "Invoke one ACP tool with JSON input through the ACP bridge.",
  },
  {
    command: "/platforms",
    category: "gateway",
    description: "Show platform enablement and transport plugin mediation.",
  },
  {
    command: "/gateway transports",
    category: "gateway",
    description: "Show the canonical gateway transport inventory.",
  },
  {
    command: "/gateway transport <platform>",
    category: "gateway",
    description: "Show one gateway transport in detail.",
  },
  {
    command: "/gateway readiness",
    category: "gateway",
    description: "Inspect transport readiness across all messaging platforms.",
  },
  {
    command: "/gateway runtime",
    category: "gateway",
    description: "Show persisted gateway runtime lifecycle state.",
  },
  {
    command: "/gateway daemon",
    category: "gateway",
    description: "Show the daemon policy, watchdog, and restart queue state.",
  },
  {
    command: "/gateway trace limit:20",
    category: "gateway",
    description: "Inspect recent gateway trace events with filtering support.",
  },
  {
    command: "/gateway history limit:10",
    category: "gateway",
    description: "Show the full gateway journal snapshot for recent events.",
  },
  {
    command: "/gateway supervision",
    category: "gateway",
    description: "Inspect daemon-style gateway supervision records.",
  },
  {
    command: "/gateway watchdog",
    category: "gateway",
    description: "Run a gateway watchdog cycle and collect restart decisions.",
  },
  {
    command: "/gateway watch homeassistant",
    category: "gateway",
    description:
      "Run a Home Assistant watch cycle and surface observed states.",
  },
  {
    command: "/gateway restart all",
    category: "gateway",
    description:
      "Restart one or all gateway adapters through the daemon control plane.",
  },
  {
    command: "/gateway replay latest",
    category: "gateway",
    description: "Replay the most recent inbox record through the gateway.",
  },
  {
    command: "/sessions gateway",
    category: "gateway",
    description: "List gateway-routed sessions and voice state.",
  },
  {
    command: "/responses list",
    category: "gateway",
    description: "List recent stateful API transport responses.",
  },
  {
    command: "/pairing pending",
    category: "gateway",
    description: "List pending pairing requests across platforms.",
  },
  {
    command: "/memory list memory",
    category: "memory",
    description: "Show long-term memory entries.",
  },
  {
    command: "/memory summary",
    category: "memory",
    description: "Show native memory summary data.",
  },
  {
    command: "/user card",
    category: "memory",
    description: "Show the current user memory card.",
  },
  {
    command: "/user beliefs",
    category: "memory",
    description: "Show extracted beliefs for the active user.",
  },
  {
    command: "/user relationship",
    category: "memory",
    description: "Show the current relationship summary for the active user.",
  },
  {
    command: "/user engagement",
    category: "memory",
    description: "Show the current engagement summary for the active user.",
  },
  {
    command: "/user search <query>",
    category: "memory",
    description: "Search the user profile index for matching signals.",
  },
  {
    command: "/profiles summary",
    category: "memory",
    description: "Show native rolodex and profile workspace summary data.",
  },
  {
    command: "/profiles users summary",
    category: "memory",
    description: "Show the Honcho-style user modeling workspace summary.",
  },
  {
    command: "/profiles users search <query>",
    category: "memory",
    description: "Search all user profiles by profile signal.",
  },
  {
    command: "/agent profile",
    category: "memory",
    description: "Show the Eliza Agent identity profile.",
  },
  {
    command: "/personality summary",
    category: "memory",
    description: "Show native personality summary data.",
  },
  {
    command: "/experience summary",
    category: "memory",
    description: "Show native session and memory experience summary data.",
  },
  {
    command: "/experience",
    category: "memory",
    description: "Show native session and memory experience summary data.",
  },
  {
    command: "/skills list",
    category: "skills",
    description: "List available local and native-backed skills.",
  },
  {
    command: "/skills summary",
    category: "skills",
    description: "Show workspace and hub skill summaries.",
  },
  {
    command: "/skills hub",
    category: "skills",
    description: "Show the native Eliza skills hub summary.",
  },
  {
    command: "/skills hub distribution",
    category: "skills",
    description:
      "Show skills hub distribution across sources, roots, categories, and tags.",
  },
  {
    command: "/skills hub families",
    category: "skills",
    description:
      "Show curated and generated skill families with workspace, catalog, and install coverage.",
  },
  {
    command: "/skills families",
    category: "skills",
    description:
      "Show curated and generated skill families with workspace, catalog, and install coverage.",
  },
  {
    command: "/skills family <slug>",
    category: "skills",
    description: "Show a single skill family by slug.",
  },
  {
    command: "/skills installed",
    category: "skills",
    description: "List installed skill manifests.",
  },
  {
    command: "/skills installed show <slug>",
    category: "skills",
    description: "Show one installed skill manifest.",
  },
  {
    command: "/skills generated list",
    category: "skills",
    description: "List synthesized/generated skills.",
  },
  {
    command: "/skills catalog",
    category: "skills",
    description: "Show the native Eliza skill catalog snapshot.",
  },
  {
    command: "/skills catalog refresh",
    category: "skills",
    description: "Refresh the native Eliza skill catalog snapshot and cache.",
  },
  {
    command: "/skills catalog search <query>",
    category: "skills",
    description: "Search the native Eliza skill catalog cache.",
  },
  {
    command: "/skills catalog show <slug>",
    category: "skills",
    description: "Show a specific catalog skill entry.",
  },
  {
    command: "/skills sync",
    category: "skills",
    description:
      "Sync the workspace skill hub against the native catalog and distribution index.",
  },
  {
    command: "/skills manifest <slug>",
    category: "skills",
    description: "Show the installable manifest for a workspace skill.",
  },
  {
    command: "/skills export <slug|all>",
    category: "skills",
    description: "Export an installable skill manifest or bundle.",
  },
  {
    command: "/skills import <manifest-path>",
    category: "skills",
    description: "Import a skill manifest into the local hub install area.",
  },
  {
    command: "/skills install <catalog-slug>",
    category: "skills",
    description: "Install a catalog skill into the local hub install area.",
  },
  {
    command: "/browser status",
    category: "browser",
    description: "Show browser backend status and provider details.",
  },
  {
    command: "/browser capture <url>",
    category: "browser",
    description: "Create a capture bundle with snapshots and reports.",
  },
  {
    command: "/browser compare <left> :: <right>",
    category: "browser",
    description: "Compare two pages and produce a comparison bundle.",
  },
  {
    command: "/media analyze <path>",
    category: "media",
    description: "Run model-assisted media analysis.",
  },
  {
    command: "/media transcript <path>",
    category: "media",
    description: "Generate or read a transcript for an audio file.",
  },
  {
    command: "/media generate <prompt>",
    category: "media",
    description: "Create an image concept artifact from a prompt.",
  },
  {
    command: "/execution status",
    category: "execution",
    description: "Show health and readiness for all execution backends.",
  },
  {
    command: "/execution preview <command>",
    category: "execution",
    description: "Preview backend execution without running it.",
  },
  {
    command: "/terminal run <command>",
    category: "execution",
    description: "Run a command through the active execution backend.",
  },
  {
    command: "/repo status",
    category: "workspace",
    description: "Show git status for the active workspace.",
  },
  {
    command: "/workspace tree",
    category: "workspace",
    description: "List files in the active workspace.",
  },
  {
    command: "/delegate overview",
    category: "delegation",
    description: "Show delegation queue and worker health overview.",
  },
  {
    command: "/delegate workers",
    category: "delegation",
    description: "List delegated workers and worker metadata.",
  },
  {
    command: "/delegate supervise group:browser concurrency:3",
    category: "delegation",
    description: "Supervise queued work with concurrency controls.",
  },
  {
    command:
      "/delegate create Research spike | group:browser | profile:research :: inspect transport drift",
    category: "delegation",
    description: "Create a rich delegated task with metadata.",
  },
  {
    command: "/trajectories ingest gateway label:review limit:100",
    category: "research",
    description: "Ingest gateway traces into a research bundle.",
  },
  {
    command: "/trajectories evaluate",
    category: "research",
    description: "Evaluate recent trajectories with the active rubric.",
  },
  {
    command:
      "/trajectories batch label:research rubric:coverage,signal :: prompt one => prompt two",
    category: "research",
    description: "Create a research batch bundle from prompts.",
  },
  {
    command:
      "/trajectories benchmark create label:benchmark rubric:coverage,signal :: label:baseline => label:target",
    category: "research",
    description: "Create a benchmark manifest from trajectory bundles.",
  },
  {
    command: "/trajectories benchmark environment",
    category: "research",
    description:
      "Show benchmark environment summary and model/runtime context.",
  },
  {
    command: "/trajectories benchmark run latest",
    category: "research",
    description: "Run the latest benchmark manifest and score all cases.",
  },
  {
    command: "/trajectories benchmark list",
    category: "research",
    description: "List saved benchmark manifests.",
  },
];

export function suggestCommands(
  input: string,
  limit = 8,
): CommandCatalogEntry[] {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return COMMAND_CATALOG.slice(0, limit);
  }

  const scored = COMMAND_CATALOG.map((entry) => {
    const command = entry.command.toLowerCase();
    const description = entry.description.toLowerCase();
    let score = 0;

    if (command.startsWith(normalized)) {
      score += 5;
    }
    if (command.includes(normalized)) {
      score += 3;
    }
    if (description.includes(normalized)) {
      score += 1;
    }

    const tokens = normalized.split(/\s+/u).filter(Boolean);
    for (const token of tokens) {
      if (command.includes(token)) {
        score += 2;
      }
      if (description.includes(token)) {
        score += 1;
      }
    }

    return { entry, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scored.length) {
    return COMMAND_CATALOG.slice(0, limit);
  }

  return scored.slice(0, limit).map((entry) => entry.entry);
}
