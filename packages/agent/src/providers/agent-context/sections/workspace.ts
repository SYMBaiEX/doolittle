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
  contextFiles,
  skillEntries,
  workspaceSummary,
  recentTerminal,
  repoSummary,
}: WorkspaceSectionsInput): string[] {
  const skills = skillEntries.slice(0, 10).map(renderSkillEntry).join("\n");

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
