import type { RefObject } from "react";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";

/**
 * Compatibility adapter for project-manager dialogs.
 *
 * New modal surfaces should consume useModalFocusBoundary directly so focus
 * capture, keyboard ownership and background isolation stay in one place.
 */
export function useDialogFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  suspended = false,
  isolationBoundaryRef?: RefObject<HTMLElement | null>,
): void {
  useModalFocusBoundary({
    active: open,
    dialogRef,
    initialFocusRef,
    isolationBoundaryRef,
    isolateBackground: isolationBoundaryRef !== undefined,
    onClose,
    restoreFocus: true,
    suspended,
  });
}
