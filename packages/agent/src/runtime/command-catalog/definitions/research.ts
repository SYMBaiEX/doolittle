import type { CommandCatalogEntry } from "../types";

export const ResearchCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/benchmarks packs",
    category: "research",
    description: "List workspace-native benchmark packs.",
  },
  {
    command: "/trajectories compress [manifest-path|bundle-label|latest]",
    category: "research",
    description:
      "Compress the latest or named trajectory bundle for research/training.",
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
