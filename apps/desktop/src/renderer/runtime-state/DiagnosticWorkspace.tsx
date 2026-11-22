import { ChevronRight, type LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { UiIcon } from "../components/UiIcon";
import "./diagnostic-workspace.css";

export function DiagnosticWorkspace({
  actions,
  children,
  className = "",
  description,
  icon,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={`diagnostic-workspace ${className}`}
      data-settings-embedded="true"
    >
      <header className="diagnostic-workspace__masthead">
        <div className="diagnostic-workspace__identity">
          <span className="diagnostic-workspace__glyph">
            <UiIcon icon={icon} size="lg" />
          </span>
          <div>
            <h2 id={titleId}>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        {actions ? (
          <div className="diagnostic-workspace__actions">{actions}</div>
        ) : null}
      </header>
      <div className="diagnostic-workspace__content">{children}</div>
    </section>
  );
}

export function DiagnosticDisclosure({
  children,
  description,
  icon,
  meta,
  onToggle,
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  icon: LucideIcon;
  meta?: ReactNode;
  onToggle?: (open: boolean) => void;
  title: string;
}) {
  return (
    <details
      className="diagnostic-disclosure"
      onToggle={
        onToggle ? (event) => onToggle(event.currentTarget.open) : undefined
      }
    >
      <summary>
        <UiIcon icon={icon} size="md" />
        <span className="diagnostic-disclosure__copy">
          <strong>{title}</strong>
          {description ? <small>{description}</small> : null}
        </span>
        {meta ? (
          <span className="diagnostic-disclosure__meta">{meta}</span>
        ) : null}
        <UiIcon
          className="diagnostic-disclosure__chevron"
          icon={ChevronRight}
          size="xs"
        />
      </summary>
      <div className="diagnostic-disclosure__content">{children}</div>
    </details>
  );
}

export function DiagnosticStatusRow({
  title,
  detail,
  status,
}: {
  title: string;
  detail?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="diagnostic-status-row">
      <div>
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      {status}
    </div>
  );
}
