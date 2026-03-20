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
    command: "/platforms",
    category: "gateway",
    description: "Show platform enablement and transport plugin mediation.",
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
    command: "/sessions gateway",
    category: "gateway",
    description: "List gateway-routed sessions and voice state.",
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
    command: "/user card",
    category: "memory",
    description: "Show the current user memory card.",
  },
  {
    command: "/agent profile",
    category: "memory",
    description: "Show the Eliza Agent identity profile.",
  },
  {
    command: "/skills list",
    category: "skills",
    description: "List available local and native-backed skills.",
  },
  {
    command: "/skills generated list",
    category: "skills",
    description: "List synthesized/generated skills.",
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
