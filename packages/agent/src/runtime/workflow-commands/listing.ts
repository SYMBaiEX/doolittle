import {
  builtInWorkflowDefinitions,
  discoverWorkspaceWorkflowDefinitions,
} from "./definitions";
import type { WorkflowCommandDefinition } from "./types";

export function listWorkflowCommands(
  workspaceDir?: string,
): WorkflowCommandDefinition[] {
  const merged = new Map<string, WorkflowCommandDefinition>();

  for (const definition of builtInWorkflowDefinitions()) {
    merged.set(definition.command, definition);
  }

  if (workspaceDir) {
    for (const definition of discoverWorkspaceWorkflowDefinitions(
      workspaceDir,
    )) {
      merged.set(definition.command, definition);
    }
  }

  return [...merged.values()].sort((left, right) =>
    left.command.localeCompare(right.command),
  );
}
