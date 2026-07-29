import type { CommandCatalogEntry } from "../types";

export const DevelopmentCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/codegen generate <project-name> :: <prompt>",
    category: "workflow",
    description: "Generate a tracked project implementation.",
  },
  {
    command:
      "/codegen research <project-name> | type:<type> | apis:<apis> | requirements:<requirements> :: <description>",
    category: "workflow",
    description: "Research a tracked code-generation project.",
  },
  {
    command:
      "/codegen prd <project-name> | type:<type> | apis:<apis> | requirements:<requirements> :: <description>",
    category: "workflow",
    description: "Create a tracked product specification.",
  },
  {
    command: "/codegen qa <project-path>",
    category: "workflow",
    description: "Run the code-generation QA workflow for a project.",
  },
  {
    command: "/codegen runs",
    category: "workflow",
    description: "List tracked code-generation runs.",
  },
  {
    command: "/codegen workflows",
    category: "workflow",
    description: "List tracked code-generation workflows.",
  },
  {
    command: "/codegen show <run-id>",
    category: "workflow",
    description: "Inspect one tracked code-generation run.",
  },
  {
    command: "/codegen workflow <workflow-id>",
    category: "workflow",
    description: "Inspect one tracked code-generation workflow.",
  },
  {
    command: "/codegen bundle <workflow-id>",
    category: "workflow",
    description: "Build the handoff bundle for a tracked workflow.",
  },
  {
    command: "/github create <repo-name> [| private:false]",
    category: "tools",
    description: "Create a GitHub repository from the active workspace.",
  },
  {
    command: "/github delete <repo-name>",
    category: "tools",
    description:
      "Delete a GitHub repository through the configured integration.",
  },
  {
    command: "/secrets list",
    category: "tools",
    description: "List configured secret names without revealing values.",
  },
  {
    command: "/secrets get <key>",
    category: "tools",
    description: "Inspect secret metadata for one key.",
  },
  {
    command: "/secrets set <key> :: <value>",
    category: "tools",
    description: "Store a secret through the configured secrets service.",
  },
  {
    command: "/migrate scan",
    aliases: ["/migration"],
    category: "tools",
    description: "Scan the workspace for Eliza migration opportunities.",
  },
  {
    command: "/migrate history",
    aliases: ["/migration"],
    category: "tools",
    description: "Show prior workspace migration operations.",
  },
  {
    command: "/migrate inspect <path>",
    category: "tools",
    description: "Inspect one migration candidate.",
  },
  {
    command: "/migrate apply <path> :: overwrite=true",
    category: "tools",
    description: "Apply a reviewed workspace migration.",
  },
  {
    command: "/update preview",
    category: "runtime",
    description: "Preview the current Doolittle update and package state.",
  },
];
