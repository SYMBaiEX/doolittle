import { useEffect, useRef } from "react";
import "./inline-action-confirmation.css";

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
    <fieldset aria-busy={busy} className={`inline-action-confirmation ${tone}`}>
      <legend className="inline-action-confirmation__title">{title}</legend>
      <small className="inline-action-confirmation__detail">{detail}</small>
      <div className="inline-action-confirmation__actions">
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
