export interface DesktopMobileMenuButtonProps {
  onOpen: () => void;
  forceVisible?: boolean;
}

export function DesktopMobileMenuButton({
  onOpen,
  forceVisible = false,
}: DesktopMobileMenuButtonProps) {
  return (
    <button
      aria-label="Open navigation"
      className={`${MENU_BUTTON_CLASS}${forceVisible ? " !grid !size-10" : ""}`}
      onClick={onOpen}
      type="button"
    >
      <UiIcon icon={Menu} size="md" />
    </button>
  );
}

import { Menu } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import { MENU_BUTTON_CLASS } from "./shell-layout";
