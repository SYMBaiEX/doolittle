import { ChevronDown } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
import { orchestrationClass as oc } from "./layout";

export interface TaskSupervisionControlsProps {
  active: boolean;
  busy: boolean;
  concurrency: string;
  onConcurrencyChange: (value: string) => void;
  onSupervise: () => void;
}

export function TaskSupervisionControls({
  active,
  busy,
  concurrency,
  onConcurrencyChange,
  onSupervise,
}: TaskSupervisionControlsProps) {
  return (
    <details className={oc("orchestration-supervision")}>
      <summary>
        <span>Supervise</span>
        <small>Parallel {concurrency}</small>
        <UiIcon icon={ChevronDown} size="xs" />
      </summary>
      <div className={oc("orchestration-supervision__body")}>
        <label>
          <span>Parallel</span>
          <input
            aria-label="Supervision concurrency"
            disabled={!active || busy}
            inputMode="numeric"
            onChange={(event) => onConcurrencyChange(event.target.value)}
            value={concurrency}
          />
        </label>
        <button
          className="secondary-button"
          disabled={!active || busy}
          onClick={onSupervise}
          type="button"
        >
          {busy ? "Supervising…" : "Run supervision"}
        </button>
      </div>
    </details>
  );
}
