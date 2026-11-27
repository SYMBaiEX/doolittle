import {
  type DesktopShortcutPlatform,
  formatShortcutLabel,
} from "./shortcut-label";

export type ApprovalDecision = "approve" | "deny";

export interface ApprovalShortcutEventLike {
  altKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  key?: string;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** Approval accelerators are deliberately scoped by callers to approval UI. */
export function approvalDecisionForShortcut(
  event: ApprovalShortcutEventLike,
): ApprovalDecision | undefined {
  if (
    event.isComposing ||
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return undefined;
  const key = event.key?.toLowerCase();
  if (key === "a") return "approve";
  if (key === "d") return "deny";
  return undefined;
}

export function approvalShortcutLabel(
  decision: ApprovalDecision,
  platform?: DesktopShortcutPlatform,
): string {
  return formatShortcutLabel(
    { alt: true, key: decision === "approve" ? "a" : "d" },
    platform,
  );
}

export function approvalShortcutAriaKey(decision: ApprovalDecision): string {
  return decision === "approve" ? "Alt+A" : "Alt+D";
}
