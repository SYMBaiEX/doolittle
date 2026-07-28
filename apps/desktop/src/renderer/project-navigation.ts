export type ProjectNavigationIntent =
  | "select-scope"
  | "open-conversation"
  | "new-conversation";

/**
 * Selecting a project changes workspace context without changing the active
 * page. Explicit chat actions still open Chat.
 */
export function projectNavigationTarget(
  intent: ProjectNavigationIntent,
): "chat" | undefined {
  return intent === "select-scope" ? undefined : "chat";
}
