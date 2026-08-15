export interface DesktopMobileMenuButtonProps {
  onOpen: () => void;
}

export function DesktopMobileMenuButton({
  onOpen,
}: DesktopMobileMenuButtonProps) {
  return (
    <button
      aria-label="Open navigation"
      className={MENU_BUTTON_CLASS}
      onClick={onOpen}
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        viewBox="0 0 20 20"
        stroke="currentColor"
      >
        <path d="M3 5h14M3 10h14M3 15h14" />
      </svg>
    </button>
  );
}

import { MENU_BUTTON_CLASS } from "./shell-layout";
