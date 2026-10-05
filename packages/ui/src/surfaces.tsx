import type { ComponentPropsWithRef, HTMLAttributes, ReactNode } from "react";
import type { UiRunState } from "./host";

const classes = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(" ");

export interface WorkspaceShellProps extends ComponentPropsWithRef<"div"> {
  navigation?: ReactNode;
  header?: ReactNode;
  inspector?: ReactNode;
  layout?: "companion" | "canvas";
  /** The native host supplies existing landmark slots, without extra wrappers. */
  hostSlots?: boolean;
}

/** Composition only. The host owns navigation, focus, resource and run state. */
export function WorkspaceShell({
  navigation,
  header,
  inspector,
  layout = "companion",
  hostSlots = false,
  children,
  className,
  ...props
}: WorkspaceShellProps) {
  return (
    <div
      {...props}
      data-layout={layout}
      data-layout-mode={hostSlots ? "host-slots" : undefined}
      className={classes("dl-workspace", className)}
    >
      {hostSlots ? (
        children
      ) : (
        <>
          {navigation && <aside className="dl-navigation">{navigation}</aside>}
          <div className="dl-main">
            {header && <header className="dl-header">{header}</header>}
            <main className="dl-content">{children}</main>
          </div>
          {inspector && <aside className="dl-inspector">{inspector}</aside>}
        </>
      )}
    </div>
  );
}

export interface ContactRowProps {
  name: string;
  avatar: ReactNode;
  selected?: boolean;
  state?: UiRunState;
  detail?: string;
  onSelect: () => void;
}

export function ContactRow({
  name,
  avatar,
  selected,
  state,
  detail,
  onSelect,
}: ContactRowProps) {
  return (
    <button
      type="button"
      className="dl-contact"
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
    >
      <span className="dl-avatar" aria-hidden="true">
        {avatar}
      </span>
      <span className="dl-contact-copy">
        <span className="dl-contact-name">{name}</span>
        {detail && <span className="dl-meta">{detail}</span>}
      </span>
      {state && <RunState state={state} compact />}
    </button>
  );
}

const stateLabels: Record<UiRunState, string> = {
  running: "Running",
  waiting: "Waiting",
  attention: "Attention",
  complete: "Complete",
  stopped: "Stopped",
  error: "Error",
  offline: "Offline",
};

export function RunState({
  state,
  compact = false,
}: {
  state: UiRunState;
  compact?: boolean;
}) {
  return (
    <span
      className="dl-run-state"
      role="img"
      data-state={state}
      aria-label={stateLabels[state]}
      title={stateLabels[state]}
    >
      <span className="dl-state-mark" aria-hidden="true" />
      {!compact && stateLabels[state]}
    </span>
  );
}

export function ConversationFrame({
  children,
  composer,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { composer?: ReactNode }) {
  return (
    <div {...props} className={classes("dl-conversation", className)}>
      {composer === undefined ? (
        children
      ) : (
        <div className="dl-transcript">{children}</div>
      )}
      {composer && <div className="dl-composer-slot">{composer}</div>}
    </div>
  );
}

type ComposerFrameProps = (
  | ({ as: "form" } & ComponentPropsWithRef<"form">)
  | ({ as?: "div" } & ComponentPropsWithRef<"div">)
) & { actions?: ReactNode; context?: ReactNode };
export function ComposerFrame({
  as = "div",
  children,
  actions,
  context,
  className,
  ...props
}: ComposerFrameProps) {
  const content = (
    <>
      {children}
      {actions && <div className="dl-composer-actions">{actions}</div>}
      {context && <div className="dl-composer-context">{context}</div>}
    </>
  );
  const frameClass = classes("dl-composer", className);
  return as === "form" ? (
    <form {...(props as ComponentPropsWithRef<"form">)} className={frameClass}>
      {content}
    </form>
  ) : (
    <div {...(props as ComponentPropsWithRef<"div">)} className={frameClass}>
      {content}
    </div>
  );
}

export function InspectorFrame({
  title,
  navigation,
  children,
  className,
  ...props
}: {
  title: string;
  navigation?: ReactNode;
  children: ReactNode;
} & ComponentPropsWithRef<"aside">) {
  return (
    <aside
      {...props}
      className={classes("dl-inspector-frame", className)}
      aria-label={title}
    >
      {navigation}
      {navigation === undefined ? (
        children
      ) : (
        <div className="dl-inspector-content">{children}</div>
      )}
    </aside>
  );
}

export function StateSurface({
  kind,
  title,
  children,
  action,
}: {
  kind: "loading" | "empty" | "error" | "offline";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className="dl-state-surface"
      data-kind={kind}
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading" || undefined}
    >
      <h2>{title}</h2>
      {children && <div className="dl-meta">{children}</div>}
      {action && <div className="dl-state-action">{action}</div>}
    </section>
  );
}
