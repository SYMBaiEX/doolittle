import type { AgentContextScope } from "../types";

interface SkillEntry {
  slug: string;
  source?: string | null;
  commandName?: string | null;
  description: string;
}

interface TerminalEntry {
  exitCode: number;
  command: string;
}

interface WorkspaceSectionsInput {
  scope: AgentContextScope;
  contextFiles: string;
  skillEntries: SkillEntry[];
  workspaceSummary: string;
  recentTerminal: TerminalEntry[];
  repoSummary: string;
}

function renderSkillEntry(skill: SkillEntry): string {
  const source = skill.source ?? "workspace";
  const commandHint = skill.commandName ? ` cmd=${skill.commandName}` : "";
  return `- ${skill.slug} [${source}${commandHint}]: ${skill.description}`;
}

function renderRecentCommand(entry: TerminalEntry): string {
  return `- [${entry.exitCode}] ${entry.command}`;
}

export function renderWorkspaceSections({
  scope,
  contextFiles,
  skillEntries,
  workspaceSummary,
  recentTerminal,
  repoSummary,
}: WorkspaceSectionsInput): string[] {
  const skills = skillEntries
    .slice(0, scope === "full" ? 10 : scope === "local" ? 6 : 3)
    .map(renderSkillEntry)
    .join("\n");

  if (scope === "minimal") {
    return ["AVAILABLE SKILLS", skills || "(none)"];
  }

  const recentCommands = recentTerminal.map(renderRecentCommand).join("\n");

  return [
    "WORKSPACE CONTEXT",
    contextFiles || "(none)",
    "",
    "AVAILABLE SKILLS",
    skills || "(none)",
    "",
    "WORKSPACE TREE",
    workspaceSummary || "(none)",
    "",
    "RECENT TERMINAL COMMANDS",
    recentCommands || "(none)",
    "",
    "REPOSITORY STATUS",
    repoSummary || "(none)",
  ];
}
