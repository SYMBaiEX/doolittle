import type { CommandCatalogEntry } from "../types";

export const SessionCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/search <query>",
    category: "memory",
    description: "Search prior session messages.",
  },
  {
    command: "/sessions list",
    category: "memory",
    description: "List recent conversations and their session identifiers.",
  },
  {
    command: "/resume [session-title]",
    category: "memory",
    description: "List titled sessions or resume one by title.",
  },
  {
    command: "/title <name>",
    category: "memory",
    description: "Name the active session.",
  },
  {
    command: "/session title <session-id> :: <title>",
    category: "memory",
    description: "Rename a session by identifier.",
  },
  {
    command: "/session continuity <session-id>",
    category: "memory",
    description: "Inspect a session continuity record.",
  },
  {
    command: "/session summary [session-id]",
    category: "memory",
    description: "Summarize the active or selected session.",
  },
  {
    command: "/usage [session-id|session-title]",
    category: "runtime",
    description: "Show estimated usage for the active or selected session.",
  },
  {
    command: "/context files",
    category: "workspace",
    description: "Show files currently attached to workspace context.",
  },
  {
    command: "/queue <prompt>",
    category: "workspace",
    description: "Queue an agent objective behind the active run.",
  },
  {
    command: "/sessions gateway",
    category: "gateway",
    description: "List active gateway session bindings.",
  },
  {
    command: "/sessions gateway expire <minutes>",
    category: "gateway",
    description: "Expire stale gateway session bindings.",
  },
  {
    command: "/voice status",
    category: "gateway",
    description: "Show voice delivery and channel state for this route.",
  },
  {
    command: "/voice <on|off|tts>",
    category: "gateway",
    description: "Set the active gateway voice-delivery mode.",
  },
  {
    command: "/voice <join|channel|leave>",
    category: "gateway",
    description: "Join or leave the active route's voice channel.",
  },
  {
    command: "/sethome",
    category: "gateway",
    description: "Mark the active gateway route as the home session.",
  },
];
