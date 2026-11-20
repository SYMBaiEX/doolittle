import type { ThreadWorkbenchTab } from "../thread-workbench";

/** Lightweight, volatile view state; conversation content stays in its existing store. */
export interface ChatPanelViewState {
  scrollTop: number;
  follow: boolean;
  inspectorVisible: boolean;
  inspectorTab?: "details" | ThreadWorkbenchTab;
  unreadMessageIds: string[];
  knownMessageIds: string[];
}
