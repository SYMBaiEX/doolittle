import type { LucideIcon } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import "./provider-workspace.css";

type ProviderIdentityProps =
  | { initials: string; icon?: never }
  | { icon: LucideIcon; initials?: never };

export function ProviderIdentity({ icon, initials }: ProviderIdentityProps) {
  return (
    <span aria-hidden="true" className="provider-identity-mark">
      {icon ? <UiIcon icon={icon} size="sm" /> : initials}
    </span>
  );
}
