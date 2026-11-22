import { Code2, MessagesSquare } from "lucide-react";
import "./workbench-view-switch.css";

export type WorkbenchView = "agent" | "ide";

const views = [
  { id: "agent", label: "Agent View", short: "Agent", icon: MessagesSquare },
  { id: "ide", label: "IDE View", short: "IDE", icon: Code2 },
] as const;

export function WorkbenchViewSwitch({
  view,
  ideUnavailable = false,
  onChange,
}: {
  view: WorkbenchView;
  ideUnavailable?: boolean;
  onChange: (view: WorkbenchView) => void;
}) {
  return (
    <fieldset className="workbench-view-switch">
      <legend className="sr-only">Workbench view</legend>
      {views.map(({ id, label, short, icon: Icon }) => (
        <button
          aria-label={label}
          aria-pressed={id === view}
          disabled={id === "ide" && id !== view && ideUnavailable}
          key={id}
          onClick={() => {
            if (id !== view) onChange(id);
          }}
          title={label}
          type="button"
        >
          <Icon aria-hidden size={14} />
          <span className="max-[560px]:sr-only">{short}</span>
        </button>
      ))}
    </fieldset>
  );
}
