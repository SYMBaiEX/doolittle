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
      <UiIcon icon={Menu} size="md" />
    </button>
  );
}

import { Menu } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import { MENU_BUTTON_CLASS } from "./shell-layout";
