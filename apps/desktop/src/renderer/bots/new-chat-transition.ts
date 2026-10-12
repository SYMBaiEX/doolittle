/** Commit draft ownership only after guarded project/view navigation succeeds. */
export async function commitNewChatAfterNavigation(
  navigate: () => Promise<boolean>,
  commit: () => void,
): Promise<boolean> {
  if (!(await navigate())) return false;
  commit();
  return true;
}
