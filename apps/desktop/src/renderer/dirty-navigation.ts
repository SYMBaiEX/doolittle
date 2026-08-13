export function confirmDirtyNavigation({
  dirty,
  confirm,
  discard,
}: {
  dirty: boolean;
  confirm: () => boolean;
  discard: () => void;
}): boolean {
  if (!dirty) return true;
  if (!confirm()) return false;
  discard();
  return true;
}
