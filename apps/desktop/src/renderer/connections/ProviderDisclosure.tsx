import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ProviderIdentity } from "./ProviderIdentity";

export function ProviderDisclosure({
  children,
  description,
  icon,
  status,
  title,
  className,
  ...detailsProps
}: ComponentPropsWithoutRef<"details"> & {
  description?: string;
  icon: LucideIcon;
  status?: ReactNode;
  title: string;
}) {
  return (
    <details
      {...detailsProps}
      className={["provider-disclosure", className].filter(Boolean).join(" ")}
    >
      <summary className="provider-disclosure__summary">
        <ProviderIdentity icon={icon} />
        <span className="provider-disclosure__label">
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </span>
        {status ? (
          <span className="provider-disclosure__status">{status}</span>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className="provider-disclosure__chevron"
          size={15}
        />
      </summary>
      <div className="provider-disclosure__body">{children}</div>
    </details>
  );
}
