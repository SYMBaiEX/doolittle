import type { ToolDefinition } from "@/types";

export const AUTOMATION_CONTROL_PLANES = [
  {
    id: "automation.cron",
    name: "Cron Automation",
    category: "automation",
    description: "Create and inspect scheduled automation jobs.",
    enabled: true,
    transport: "service",
  },
  {
    id: "automation.trajectory.export",
    name: "Trajectory Export",
    category: "automation",
    description: "Export recent interaction trajectories to JSONL.",
    enabled: true,
    transport: "service",
  },
  {
    id: "automation.trajectory.analyze",
    name: "Trajectory Analyze",
    category: "automation",
    description:
      "Create a model-backed research brief from a trajectory bundle.",
    enabled: true,
    transport: "service",
  },
  {
    id: "automation.trajectory.evaluate",
    name: "Trajectory Evaluate",
    category: "automation",
    description:
      "Score a trajectory bundle and emit a research evaluation report.",
    enabled: true,
    transport: "service",
  },
  {
    id: "automation.trajectory.package",
    name: "Trajectory Package",
    category: "automation",
    description:
      "Package export, replay, analysis, and evaluation artifacts into a reusable research bundle.",
    enabled: true,
    transport: "service",
  },
  {
    id: "skills.synthesize",
    name: "Skill Synthesis",
    category: "automation",
    description: "Create draft reusable skills from completed delegated work.",
    enabled: true,
    transport: "service",
  },
] as const satisfies readonly ToolDefinition[];
