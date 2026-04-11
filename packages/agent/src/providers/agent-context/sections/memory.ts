interface MemorySummary {
  entries: number;
  characters: number;
  preview: string[];
}

function renderMemorySummary(label: string, summary: MemorySummary): string {
  if (!summary.preview.length) {
    return `${label}\n(empty)`;
  }

  return [
    `${label} (${summary.entries} entries, ${summary.characters} chars)`,
    ...summary.preview.slice(-3).map((entry) => `- ${entry}`),
  ].join("\n");
}

export function renderMemorySections(
  memorySummary: MemorySummary,
  userSummary: MemorySummary,
): string[] {
  return [
    "MEMORY",
    renderMemorySummary("MEMORY", memorySummary),
    "",
    "USER PROFILE",
    renderMemorySummary("USER PROFILE", userSummary),
  ];
}
