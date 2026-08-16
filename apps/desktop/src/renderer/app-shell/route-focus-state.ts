import type {
  EditorPane,
  LeftPane,
  UtilityPane,
} from "../coding-workspace/models";
import type { WorkTabId } from "../OrchestrationPage";

export interface CodingWorkspaceFocusState {
  leftPane: LeftPane;
  editorPane: EditorPane;
  utilityPane: UtilityPane;
  selectedPath: string;
  searchDraft: string;
  searchQuery: string;
  acpTaskOpen: boolean;
  acpTaskDraft: string;
}

export interface OrchestrationFocusState {
  activeTab: WorkTabId;
  selectedTaskId: string;
  selectedWorkerId: string;
  selectedPlanId: string;
  selectedWorkflowId: string;
  selectedRunId: string;
}

export interface DesktopRouteFocusSnapshot {
  code?: CodingWorkspaceFocusState;
  work?: OrchestrationFocusState;
}

export type DesktopRouteFocusStore = Map<string, DesktopRouteFocusSnapshot>;

/** Keeps transient route focus from leaking between project/workspace scopes. */
export function desktopRouteFocusScope(
  workspacePath: string,
  projectScope: string,
): string {
  return `${workspacePath}\u0000${projectScope}`;
}
