import { useMediaQuery } from "@elizaos/ui/hooks/useMediaQuery";
import type { Toast } from "./ToastRegion";

export interface ToastViewportProps {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: string) => void;
  readonly onPause: (id: string) => void;
  readonly onResume: (id: string) => void;
  readonly className?: string;
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
      className={`pointer-events-none fixed top-14.5 right-4.5 z-1400 w-[min(360px,calc(100vw-36px))] ${isReducedMotion ? "motion-reduce:transition-none" : ""} ${className}`.trim()}
      aria-live="polite"
      aria-relevant="additions removals"
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
              tabIndex={0}
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
                  <div className="text-[var(--text-control)] leading-[1.45] text-[var(--muted)]">
                    {toast.message}
                  </div>
                ) : null}
              </div>
              <button
                className="toast-close grid size-6 place-items-center rounded-[var(--radius-xs)] border-0 bg-transparent p-0 text-[15px] leading-none text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:bg-[var(--surface-hover)] focus-visible:text-[var(--text)]"
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label={`Dismiss ${toast.tone} toast`}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
