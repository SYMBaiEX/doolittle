import type { WorkspaceEntry } from "@/types";

export function summarizeWorkspaceTree(
  entries: WorkspaceEntry[],
  maxEntries = 20,
): string {
  const limitedEntries = entries.slice(0, maxEntries);
  if (!limitedEntries.length) {
    return "(empty workspace)";
  }

  return limitedEntries
    .map(
      (entry) =>
        `${"  ".repeat(entry.depth)}- ${entry.path}${entry.type === "directory" ? "/" : ""}`,
    )
    .join("\n");
}
