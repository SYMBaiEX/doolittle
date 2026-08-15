import type { ReactNode } from "react";
import {
  type ResourceStatusItem,
  resourceStatusLabel,
  summarizeResourceStatuses,
} from "../resource-status";

const STATUS_INDICATOR_CLASS_NAMES = {
  disabled: "bg-[var(--faint)] shadow-none",
  error:
    "bg-[var(--bad)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--bad)_14%,transparent)]",
  loading:
    "bg-[var(--accent)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]",
  ready:
    "bg-[var(--good)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--good)_14%,transparent)]",
  refreshing:
    "bg-[var(--accent)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]",
} as const;

export function ResourceStatusBar({
  resources,
  children,
}: {
  resources: readonly ResourceStatusItem[];
  children?: ReactNode;
}) {
  const summary = summarizeResourceStatuses(resources);
  const failedResources = resources.filter(
    ({ resource }) =>
      resource.status === "error" ||
      (!resource.status && Boolean(resource.error) && !resource.data),
  );
  const retry = () => {
    for (const { resource } of failedResources) resource.reload();
  };
  const failed = summary.required.errors + summary.optional.errors > 0;
  const pending = summary.required.pending + summary.optional.pending > 0;
  const requiredUnavailable =
    summary.required.errors > 0 && summary.required.ready === 0;
  const hasCustomRetry = Boolean(children);
  return (
    <div
      aria-atomic="true"
      aria-busy={pending || summary.isValidating}
      aria-live={requiredUnavailable ? "assertive" : "polite"}
      className="resource-status-bar flex min-h-8 flex-wrap items-center gap-[7px] rounded-[5px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_68%,transparent)] px-[9px] py-1.5 text-[11px] leading-[1.3] text-[var(--text-soft)] max-[640px]:items-start"
      role={requiredUnavailable ? "alert" : "status"}
    >
      <span
        className={`resource-status-bar__indicator size-1.5 flex-none rounded-full ${STATUS_INDICATOR_CLASS_NAMES[summary.status]}`}
        aria-hidden="true"
      />
      <span>
        {summary.hasData && failed
          ? "Partially available"
          : resourceStatusLabel(summary.status)}
      </span>
      <span className="resource-status-bar__counts font-[var(--font-mono)] text-[10px] text-[var(--muted)] max-[640px]:basis-full max-[640px]:pl-[13px]">
        {summary.required.ready}/{summary.required.total} required
        {summary.optional.total
          ? ` · ${summary.optional.ready}/${summary.optional.total} optional`
          : ""}
      </span>
      {failed || children ? (
        <div className="ml-auto flex flex-wrap items-center gap-1 max-[640px]:ml-0">
          {failed && !hasCustomRetry ? (
            <button
              className="text-button min-h-6 px-[5px] py-0.5 text-[10px] text-[var(--accent-hover)]"
              onClick={retry}
              type="button"
            >
              Retry failed
            </button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
