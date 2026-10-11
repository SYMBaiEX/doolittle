/** Lightweight, volatile view state; conversation content stays in its existing store. */
export interface ChatPanelViewState {
  scrollTop: number;
  follow: boolean;
  inspectorVisible: boolean;
  inspectorTab?: "details" | "library" | "computer";
  unreadMessageIds: string[];
  knownMessageIds: string[];
}
