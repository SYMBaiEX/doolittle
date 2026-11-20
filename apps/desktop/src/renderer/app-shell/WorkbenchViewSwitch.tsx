import { Code2, MessagesSquare } from "lucide-react";

export type WorkbenchView = "agent" | "ide";

const views = [
  { id: "agent", label: "Agent View", short: "Agent", icon: MessagesSquare },
  { id: "ide", label: "IDE View", short: "IDE", icon: Code2 },
] as const;

export function WorkbenchViewSwitch({
  view,
  onChange,
}: {
  view: WorkbenchView;
  onChange: (view: WorkbenchView) => void;
}) {
  return (
    <fieldset className="workbench-view-switch m-0 inline-flex min-w-0 shrink-0 items-stretch gap-0.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-soft)] p-0.5 shadow-[inset_0_1px_3px_var(--shadow),0_1px_0_var(--border)] [-webkit-app-region:no-drag]">
      <legend className="sr-only">Workbench view</legend>
      {views.map(({ id, label, short, icon: Icon }) => (
        <button
          aria-label={label}
          aria-pressed={id === view}
          className="inline-flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent px-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] aria-pressed:border-[var(--border-strong)] aria-pressed:bg-[var(--surface-raised)] aria-pressed:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--text)_7%,transparent),transparent)] aria-pressed:text-[var(--text)] aria-pressed:shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_9%,transparent),0_1px_3px_var(--shadow)] focus-visible:!outline-1 focus-visible:!outline-offset-[-2px] max-[560px]:h-10 max-[560px]:min-w-10 max-[560px]:px-1.5"
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
