import { useMediaQuery } from "@doolittle/ui/environment";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Toast } from "./ToastRegion";
import { UiIcon } from "./UiIcon";

export interface ToastViewportProps {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: string) => void;
  readonly onPause: (id: string) => void;
  readonly onResume: (id: string) => void;
  readonly className?: string;
}

/**
 * Long backend error strings must not let one toast cover the window. The
 * full message stays in the DOM for assistive technology; sighted users get
 * a quiet disclosure toggle only when the clamped text actually overflows.
 */
function ToastMessage({ children }: { readonly children: Toast["message"] }) {
  const messageId = useId();
  const messageRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // Toast content is immutable per id, so re-measuring on expansion
  // collapse and on resize covers the overflow lifecycle.
  useEffect(() => {
    if (expanded) return;
    const element = messageRef.current;
    if (!element) return;
    const measure = () => {
      setOverflowing(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    const Observer = element.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    const observer = new Observer(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <>
      <div
        className={`text-[length:var(--text-control)] leading-[1.45] text-[var(--muted)] [overflow-wrap:anywhere] ${expanded ? "" : "line-clamp-4"}`}
        id={messageId}
        ref={messageRef}
      >
        {children}
      </div>
      {overflowing ? (
        <button
          aria-controls={messageId}
          aria-expanded={expanded}
          className="w-fit border-0 bg-transparent p-0 font-[var(--font-mono)] text-[length:var(--text-meta)] uppercase tracking-[0.04em] text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </>
  );
}

export function ToastViewport({
  toasts,
  onDismiss,
  onPause,
  onResume,
  className = "",
}: ToastViewportProps) {
  const isReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  return (
    <section
      className={`toast-viewport pointer-events-none fixed top-14.5 right-4.5 w-[min(360px,calc(100vw-36px))] ${isReducedMotion ? "motion-reduce:transition-none" : ""} ${className}`.trim()}
    >
      <ul className="m-0 grid list-none gap-2 p-0">
        {toasts.map((toast) => {
          const isError = toast.tone === "error";
          return (
            <li
              key={toast.id}
              className={`pointer-events-auto relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_95%,transparent)] py-3 pr-3 pl-3.5 text-[var(--text)] shadow-[0_18px_54px_var(--shadow)] before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:content-[''] ${
                toast.tone === "success"
                  ? "before:bg-[var(--good)]"
                  : toast.tone === "warning"
                    ? "before:bg-[var(--warn)]"
                    : toast.tone === "error"
                      ? "before:bg-[var(--bad)]"
                      : "before:bg-[var(--accent)]"
              }`}
              role={isError ? "alert" : "status"}
              onMouseEnter={() => onPause(toast.id)}
              onMouseLeave={() => onResume(toast.id)}
              onFocus={() => onPause(toast.id)}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (
                  !(nextTarget instanceof Node) ||
                  !event.currentTarget.contains(nextTarget)
                ) {
                  onResume(toast.id);
                }
              }}
            >
              <div className="grid gap-0.75">
                {toast.title ? (
                  <div className="text-xs font-bold">{toast.title}</div>
                ) : null}
                {toast.message ? (
                  <ToastMessage>{toast.message}</ToastMessage>
                ) : null}
              </div>
              <button
                className="toast-close grid size-6 place-items-center rounded-[var(--radius-xs)] border-0 bg-transparent p-0 text-[15px] leading-none text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:bg-[var(--surface-hover)] focus-visible:text-[var(--text)]"
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label={`Dismiss ${toast.tone} toast`}
              >
                <UiIcon icon={X} size="xs" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
