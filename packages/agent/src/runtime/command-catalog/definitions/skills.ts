import type { CommandCatalogEntry } from "../types";

export const SkillsCommandCatalogEntries: CommandCatalogEntry[] = [
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
    command: "/skills synthesize latest",
    category: "skills",
    description:
      "Create a reusable skill from the active session when a workflow is detected.",
  },
  {
    command: "/skills synthesize <task-id>",
    category: "skills",
    description: "Create a reusable skill from a completed delegation task.",
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
];
