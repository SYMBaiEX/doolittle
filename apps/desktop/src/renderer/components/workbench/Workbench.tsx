import { Button } from "@doolittle/ui";
import type { LucideIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { UiIcon } from "../UiIcon";
import "./workbench.css";

const actionVariants = {
  primary: "default",
  secondary: "secondary",
  quiet: "ghost",
  danger: "destructive",
} as const;

export function WorkbenchAction({
  className = "",
  children,
  emphasis = "secondary",
  icon,
  size = "sm",
  type = "button",
  variant = actionVariants[emphasis],
  ...props
}: Omit<ComponentProps<typeof Button>, "asChild"> & {
  emphasis?: keyof typeof actionVariants;
  icon?: LucideIcon;
}) {
  return (
    <Button
      {...props}
      className={`workbench-action ${className}`}
      size={size}
      type={type}
      variant={variant}
    >
      {icon ? <UiIcon icon={icon} /> : null}
      {children}
    </Button>
  );
}

export function WorkbenchSection({
  title,
  headingLevel = 2,
  description,
  icon,
  actions,
  busy,
  children,
  className = "",
}: {
  title: string;
  headingLevel?: 2 | 3;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const heading = useId();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section
      aria-busy={busy}
      aria-labelledby={heading}
      className={`workbench-section ${className}`}
    >
      <header className="workbench-section__header">
        <div className="workbench-section__heading">
          {icon ? (
            <span className="workbench-section__glyph">
              <UiIcon icon={icon} size="md" />
            </span>
          ) : null}
          <div className="workbench-section__copy">
            <Heading id={heading}>{title}</Heading>
            {description ? <div>{description}</div> : null}
          </div>
        </div>
        {actions ? (
          <div className="workbench-section__actions">{actions}</div>
        ) : null}
      </header>
      <div className="workbench-section__body">{children}</div>
    </section>
  );
}

export function WorkbenchEmpty({
  title,
  children,
  icon,
  actions,
}: {
  title: string;
  children?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <div className="workbench-empty">
      {icon ? (
        <span className="workbench-empty__glyph">
          <UiIcon icon={icon} size="lg" />
        </span>
      ) : null}
      <div className="workbench-empty__copy">
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
      {actions ? (
        <div className="workbench-empty__actions">{actions}</div>
      ) : null}
    </div>
  );
}
