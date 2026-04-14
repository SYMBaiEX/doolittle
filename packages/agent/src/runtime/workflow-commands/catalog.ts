import { listWorkflowCommands } from "./listing";
import type {
  WorkflowCommandCatalogEntry,
  WorkflowCommandDefinition,
} from "./types";

function matchesWorkflowQuery(
  definition: WorkflowCommandDefinition,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    definition.command.toLowerCase().includes(normalizedQuery) ||
    definition.title.toLowerCase().includes(normalizedQuery) ||
    definition.description.toLowerCase().includes(normalizedQuery)
  );
}

export function getWorkflowCommandCatalogEntries(
  workspaceDir?: string,
): WorkflowCommandCatalogEntry[] {
  return listWorkflowCommands(workspaceDir).map((definition) => ({
    command: definition.command,
    category: "workflow",
    description: definition.description,
  }));
}

export function renderWorkflowCommandCatalog(
  workspaceDir?: string,
  query?: string,
): string {
  const commands = listWorkflowCommands(workspaceDir).filter((definition) =>
    matchesWorkflowQuery(definition, query ?? ""),
  );

  if (!commands.length) {
    return query?.trim()
      ? `No workflow commands found for query: ${query}`
      : "No workflow commands available.";
  }

  return commands
    .map((definition) => `${definition.command} — ${definition.description}`)
    .join("\n");
}
