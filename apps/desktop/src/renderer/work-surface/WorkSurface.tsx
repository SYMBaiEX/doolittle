import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { WorkbenchEmpty } from "../components/workbench/Workbench";
import type { WorkTier } from "./status";
import "./work-surface.css";

export function WorkSurface({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={`ws-surface ${className}`}>{children}</section>;
}

export function WorkMasthead({
  kicker,
  title,
  meta,
  actions,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ws-masthead">
      <div className="ws-masthead__group">
        {kicker ? <span className="ws-masthead__kicker">{kicker}</span> : null}
        <h1 className="ws-masthead__title">{title}</h1>
      </div>
      {meta ? <div className="ws-masthead__meta">{meta}</div> : null}
      {actions ? <div className="ws-masthead__actions">{actions}</div> : null}
    </header>
  );
}

export function WorkToolbar({ children }: { children: ReactNode }) {
  return <div className="ws-toolbar">{children}</div>;
}

export function WorkSplit({
  className = "",
  ref,
  children,
}: {
  className?: string;
  ref?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div className={`ws-split${className ? ` ${className}` : ""}`} ref={ref}>
      {children}
    </div>
  );
}

export function WorkRail({
  heading,
  meta,
  controls,
  note,
  className = "",
  children,
}: {
  heading: ReactNode;
  meta?: ReactNode;
  controls?: ReactNode;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <aside className={`ws-rail ${className}`}>
      <div className="ws-rail__heading">
        <span>{heading}</span>
        {meta ? <small>{meta}</small> : null}
      </div>
      {controls ? <div className="ws-rail__controls">{controls}</div> : null}
      {note ? <div className="ws-rail__note">{note}</div> : null}
      {children}
    </aside>
  );
}

export function WorkList({ children }: { children: ReactNode }) {
  return <ul className="ws-list">{children}</ul>;
}

export function WorkListFooter({ children }: { children: ReactNode }) {
  return <li className="ws-list__footer">{children}</li>;
}

export function WorkRow({
  tone,
  title,
  status,
  meta,
  time,
  selected,
  disabled,
  onSelect,
  label,
}: {
  tone: WorkTier;
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode[];
  time?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  label?: string;
}) {
  return (
    <li>
      <button
        type="button"
        className="ws-row"
        aria-current={selected ? "true" : undefined}
        disabled={disabled}
        onClick={onSelect}
        title={label}
      >
        <i className="ws-row__mark" data-tier={tone} aria-hidden="true" />
        <strong className="ws-row__title">{title}</strong>
        {status ? (
          <span className="ws-row__status" data-tier={tone}>
            {status}
          </span>
        ) : null}
        {meta?.length || time ? (
          <span className="ws-row__meta">
            {meta?.map((entry, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: meta pills are static per row render
              <span key={index}>{entry}</span>
            ))}
            {time ? <span className="ws-row__time">{time}</span> : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function WorkDetail({ children }: { children: ReactNode }) {
  return <article className="ws-detail">{children}</article>;
}

export function DetailHeader({
  kicker,
  title,
  objective,
  status,
  tags,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  objective?: ReactNode;
  status?: ReactNode;
  tags?: ReactNode;
}) {
  return (
    <>
      <header className="ws-detail__header">
        <div>
          {kicker ? <span className="ws-kicker">{kicker}</span> : null}
          <h2 className="ws-detail__title">{title}</h2>
          {objective ? (
            <p className="ws-detail__objective">{objective}</p>
          ) : null}
        </div>
        {status}
      </header>
      {tags ? <div className="ws-tags">{tags}</div> : null}
    </>
  );
}

export function WorkTag({
  tone,
  children,
}: {
  tone?: "neutral" | "good" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <span className="ws-tag" data-tone={tone === "neutral" ? undefined : tone}>
      {children}
    </span>
  );
}

export function WorkActions({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="ws-actions">
      <div className="ws-actions__primary">{primary}</div>
      {secondary ? (
        <div className="ws-actions__secondary">{secondary}</div>
      ) : null}
    </div>
  );
}

export function WorkConfirm({
  title,
  detail,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmDisabled = false,
  cancelDisabled = false,
  returnFocusRef,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  detail: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const detailId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();
  }, []);

  const cancel = () => {
    const restoreTarget = returnFocusRef?.current ?? previousFocusRef.current;
    if (restoreTarget?.isConnected) {
      restoreTarget.focus({ preventScroll: true });
    }
    onCancel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };

  return (
    <div
      aria-describedby={detailId}
      aria-labelledby={titleId}
      aria-modal="false"
      className="ws-confirm"
      onKeyDown={onKeyDown}
      role="alertdialog"
      tabIndex={-1}
    >
      <div>
        <strong id={titleId}>{title}</strong>
        <span id={detailId}>{detail}</span>
      </div>
      <button
        className="danger-button"
        disabled={confirmDisabled}
        onClick={onConfirm}
        type="button"
      >
        {confirmLabel}
      </button>
      <button
        className="text-button"
        disabled={cancelDisabled}
        onClick={cancel}
        ref={cancelRef}
        type="button"
      >
        {cancelLabel}
      </button>
    </div>
  );
}

export function WorkCards({ children }: { children: ReactNode }) {
  return <div className="ws-cards">{children}</div>;
}

export function WorkCard({
  kicker,
  children,
}: {
  kicker: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ws-card">
      <span className="ws-kicker">{kicker}</span>
      {children}
    </section>
  );
}

export function WorkDisclosure({
  summary,
  detail,
  aside,
  children,
}: {
  summary: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="ws-disclosure">
      <summary>
        <span>
          <strong>{summary}</strong>
          {detail ? <small>{detail}</small> : null}
        </span>
        {aside ? <small>{aside}</small> : <span />}
      </summary>
      {children}
    </details>
  );
}

export function DetailFacts({ children }: { children: ReactNode }) {
  return <dl className="ws-facts">{children}</dl>;
}

export function FactRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="ws-fact">
      <dt>{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}

export { WorkbenchEmpty as WorkEmpty };
