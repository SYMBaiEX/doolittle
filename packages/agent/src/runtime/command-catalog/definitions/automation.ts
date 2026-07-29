import type { CommandCatalogEntry } from "../types";

export const AutomationCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/cron list",
    category: "workflow",
    description: "List scheduled agent jobs.",
  },
  {
    command: "/cron runs",
    category: "workflow",
    description: "List recent scheduled-job runs.",
  },
  {
    command: "/cron show <job-id>",
    category: "workflow",
    description: "Inspect one scheduled agent job.",
  },
  {
    command:
      "/cron create <schedule> | name:<name> | skills:<slugs> | personality:<name> | provider:<provider> | model:<model> :: <prompt>",
    category: "workflow",
    description: "Create a scheduled agent job.",
  },
  {
    command:
      "/cron update <job-id> <schedule> | name:<name> | skills:<slugs> | personality:<name> | provider:<provider> | model:<model> :: <prompt>",
    category: "workflow",
    description: "Update an existing scheduled agent job.",
  },
  {
    command: "/cron pause <job-id>",
    category: "workflow",
    description: "Pause a scheduled agent job.",
  },
  {
    command: "/cron resume <job-id>",
    category: "workflow",
    description: "Resume a scheduled agent job.",
  },
  {
    command: "/cron run <job-id>",
    category: "workflow",
    description: "Run a scheduled agent job immediately.",
  },
  {
    command: "/cron remove <job-id>",
    category: "workflow",
    description: "Remove a scheduled agent job.",
  },
  {
    command: "/hooks list",
    category: "workflow",
    description: "List registered runtime event hooks.",
  },
  {
    command: "/hooks add <event> [name] :: <template>",
    category: "workflow",
    description: "Register a runtime event hook.",
  },
  {
    command: "/hooks recent",
    category: "workflow",
    description: "List recent runtime hook invocations.",
  },
];
