import { useEffect, useRef } from "react";

export interface InlineActionConfirmationProps {
  title: string;
  detail: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  tone?: "primary" | "danger";
  onCancel(): void;
  onConfirm(): void;
}

export function InlineActionConfirmation({
  title,
  detail,
  confirmLabel,
  busyLabel,
  busy,
  tone = "danger",
  onCancel,
  onConfirm,
}: InlineActionConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <fieldset
      aria-busy={busy}
      className={`inline-action-confirmation mt-2.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-[3px] rounded-[var(--radius-sm)] border p-2.5 max-[720px]:grid-cols-1 ${
        tone === "primary"
          ? "border-[color-mix(in_srgb,var(--accent)_26%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
          : "border-[color-mix(in_srgb,var(--bad)_26%,var(--border))] bg-[color-mix(in_srgb,var(--bad)_6%,var(--surface))]"
      }`}
    >
      <legend className="inline-action-confirmation__title col-start-1 m-0 p-0 text-[var(--text-caption)] font-bold">
        {title}
      </legend>
      <small className="inline-action-confirmation__detail col-start-1 text-[var(--text-meta)] leading-[1.45] text-[var(--muted)]">
        {detail}
      </small>
      <div className="inline-action-confirmation__actions col-start-2 row-start-1 row-span-2 flex items-center gap-2 max-[720px]:col-start-1 max-[720px]:row-auto">
        <button
          aria-busy={busy}
          className={tone === "primary" ? "primary-button" : "danger-button"}
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={onCancel}
          ref={cancelRef}
          type="button"
        >
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
